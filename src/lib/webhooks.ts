import "server-only";

import { createHmac } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSafeWebhookUrl } from "@/lib/url-safety";
import type { Webhook } from "@/lib/types";

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deliver an event to every active webhook subscribed to it for a team.
 * Runs with the service-role client (webhooks are admin-only under RLS) and
 * records each attempt in webhook_deliveries. Signs the body with the webhook's
 * secret (HMAC-SHA256) so receivers can verify authenticity.
 *
 * Fire-and-forget from the caller's perspective — failures are logged, never
 * thrown, so a bad webhook can't break the user action that triggered it.
 */
export async function dispatchWebhook(
  teamId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: hooks } = await admin
      .from("webhooks")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true);

    const subscribers = ((hooks ?? []) as Webhook[]).filter((h) =>
      h.events.includes(event)
    );
    if (subscribers.length === 0) return;

    const body = JSON.stringify({
      event,
      team_id: teamId,
      sent_at: new Date().toISOString(),
      data: payload,
    });

    await Promise.all(
      subscribers.map(async (hook) => {
        const signature = createHmac("sha256", hook.secret)
          .update(body)
          .digest("hex");
        let status: number | null = null;
        let ok = false;
        let error: string | null = null;
        let attempts = 0;

        // Re-check at send time (SSRF defense-in-depth; the URL was also
        // validated at creation).
        const safe = isSafeWebhookUrl(hook.url);
        if (!safe.ok) {
          await admin.from("webhook_deliveries").insert({
            webhook_id: hook.id,
            team_id: teamId,
            event,
            payload,
            status_code: null,
            ok: false,
            error: `blocked: ${safe.reason}`,
            attempts: 0,
          });
          return;
        }

        // Retry with exponential backoff on network errors / 5xx. 4xx is a
        // client error and is not retried.
        while (attempts < MAX_ATTEMPTS) {
          attempts++;
          try {
            const res = await fetch(hook.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Webhook-Event": event,
                "X-Webhook-Signature": `sha256=${signature}`,
              },
              body,
              signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
            });
            status = res.status;
            ok = res.ok;
            error = ok ? null : `HTTP ${status}`;
            if (ok || status < 500) break; // success or non-retryable
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }
          if (attempts < MAX_ATTEMPTS) await sleep(300 * 2 ** (attempts - 1));
        }

        await admin.from("webhook_deliveries").insert({
          webhook_id: hook.id,
          team_id: teamId,
          event,
          payload,
          status_code: status,
          ok,
          error,
          attempts,
        });
      })
    );
  } catch (e) {
    console.error("dispatchWebhook failed:", e);
  }
}
