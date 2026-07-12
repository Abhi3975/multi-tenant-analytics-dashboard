import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Webhook, WebhookDelivery } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NewWebhookForm } from "./new-webhook-form";
import { deleteWebhook } from "./actions";

export default async function WebhooksPage({
  params,
}: {
  params: { teamId: string };
}) {
  const { teamId } = params;
  const user = await requireUser();
  const role = await getTeamRole(teamId, user.id);
  if (role !== "admin") notFound();

  const supabase = createClient();
  const [{ data: webhooks }, { data: deliveries }] = await Promise.all([
    supabase
      .from("webhooks")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhook_deliveries")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const hooks = (webhooks ?? []) as Webhook[];
  const recent = (deliveries ?? []) as WebhookDelivery[];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-2">
        <Link
          href={`/org/${teamId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Team
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Webhooks</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        POST signed events to external URLs. Requests include an
        <code className="mx-1 rounded bg-muted px-1 text-xs">
          X-Webhook-Signature
        </code>
        header (HMAC-SHA256 of the body using the webhook secret).
      </p>

      <div className="mb-6">
        <NewWebhookForm teamId={teamId} />
      </div>

      <h2 className="mb-2 text-sm font-medium">Registered</h2>
      {hooks.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">No webhooks yet.</p>
      ) : (
        <div className="mb-6 grid gap-2">
          {hooks.map((h) => (
            <Card key={h.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm">{h.url}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {h.events.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        no events
                      </span>
                    ) : (
                      h.events.map((e) => (
                        <Badge key={e} variant="secondary" className="text-[10px]">
                          {e}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <form action={deleteWebhook}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="id" value={h.id} />
                  <Button
                    size="sm"
                    variant="ghost"
                    type="submit"
                    className="text-destructive"
                  >
                    Delete
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-medium">Recent deliveries</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deliveries yet.</p>
      ) : (
        <div className="grid gap-1 text-sm">
          {recent.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded border px-3 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    d.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }
                >
                  {d.ok ? "✓" : "✕"}
                </span>
                <code className="text-xs">{d.event}</code>
              </div>
              <span className="text-xs text-muted-foreground">
                {d.status_code ?? d.error ?? "—"}
                {d.attempts > 1 ? ` · ${d.attempts} tries` : ""} ·{" "}
                {new Date(d.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
