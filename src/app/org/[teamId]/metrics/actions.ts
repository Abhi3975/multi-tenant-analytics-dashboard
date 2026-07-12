"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Define a custom metric for a team (writers). RLS blocks non-writers. */
export async function createMetricDefinition(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const key = slugify(String(formData.get("key") || ""));
  const label = String(formData.get("label") || "").trim() || key;
  const unit = String(formData.get("unit") || "").trim() || null;

  if (!key) throw new Error("Metric key is required");

  const user = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("metric_definitions")
    .insert({ team_id: teamId, key, label, unit, is_builtin: false })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create metric: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "metric_definition.created",
    entityType: "metric_definition",
    entityId: data.id,
    metadata: { key, label },
  });

  revalidatePath(`/org/${teamId}/metrics`);
}

export async function deleteMetricDefinition(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const id = String(formData.get("id"));

  const user = await requireUser();
  const supabase = createClient();

  const { error } = await supabase
    .from("metric_definitions")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Could not delete metric: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "metric_definition.deleted",
    entityType: "metric_definition",
    entityId: id,
  });

  revalidatePath(`/org/${teamId}/metrics`);
}
