"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { isSafeWebhookUrl } from "@/lib/url-safety";

/** Register a webhook for a team (admins only, enforced by RLS). */
export async function createWebhook(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const url = String(formData.get("url") || "").trim();
  const events = formData.getAll("events").map(String);

  if (!url) throw new Error("URL is required");
  const safe = isSafeWebhookUrl(url);
  if (!safe.ok) throw new Error(`Invalid webhook URL: ${safe.reason}`);

  const user = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("webhooks")
    .insert({ team_id: teamId, url, events, created_by: user.id })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create webhook: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "webhook.created",
    entityType: "webhook",
    entityId: data.id,
    metadata: { url, events },
  });

  revalidatePath(`/org/${teamId}/webhooks`);
}

export async function deleteWebhook(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const id = String(formData.get("id"));

  const user = await requireUser();
  const supabase = createClient();

  const { error } = await supabase.from("webhooks").delete().eq("id", id);
  if (error) throw new Error(`Could not delete webhook: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "webhook.deleted",
    entityType: "webhook",
    entityId: id,
  });

  revalidatePath(`/org/${teamId}/webhooks`);
}
