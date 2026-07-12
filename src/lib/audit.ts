import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Append an immutable audit entry. Uses the service-role client so the write
 * always succeeds and cannot be forged or suppressed by the acting user (there
 * is no INSERT policy on audit_logs for normal roles). Never throws into the
 * caller — auditing must not break the user action it records.
 */
export async function recordAudit(entry: {
  teamId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      team_id: entry.teamId,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("recordAudit failed:", e);
  }
}
