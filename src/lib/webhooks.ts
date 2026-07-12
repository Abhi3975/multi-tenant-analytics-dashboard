import "server-only";

import { createHmac } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Webhook } from "@/lib/types";

const DELIVERY_TIMEOUT_MS = 5000;

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
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }

        await admin.from("webhook_deliveries").insert({
          webhook_id: hook.id,
          team_id: teamId,
          event,
          payload,
          status_code: status,
          ok,
          error,
        });
      })
    );
  } catch (e) {
    console.error("dispatchWebhook failed:", e);
  }
}
