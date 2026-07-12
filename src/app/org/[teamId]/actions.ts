"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

/**
 * Create a dashboard inside a project. RLS ("dashboards_insert_writers")
 * rejects this for viewers. Records an audit entry and fires webhooks.
 */
export async function createDashboard(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const projectId = String(formData.get("projectId"));
  const name = String(formData.get("name") || "").trim() || "Untitled dashboard";

  const user = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("dashboards")
    .insert({
      team_id: teamId,
      project_id: projectId,
      name,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create dashboard: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "dashboard.created",
    entityType: "dashboard",
    entityId: data.id,
    metadata: { name, project_id: projectId },
  });
  await dispatchWebhook(teamId, "dashboard.created", {
    dashboard_id: data.id,
    name,
    project_id: projectId,
    by: user.email,
  });

  revalidatePath(`/org/${teamId}`);
  redirect(`/org/${teamId}/dashboards/${data.id}`);
}

/** Create a project (writers). */
export async function createProject(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const name = String(formData.get("name") || "").trim() || "Untitled project";

  const user = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({ team_id: teamId, name })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create project: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "project.created",
    entityType: "project",
    entityId: data.id,
    metadata: { name },
  });

  revalidatePath(`/org/${teamId}`);
}
