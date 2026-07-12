"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Create a dashboard scoped to a team. RLS ("dashboards_insert_writers")
 * rejects this for viewers, so this is safe even though the UI also hides it.
 */
export async function createDashboard(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const name = String(formData.get("name") || "").trim() || "Untitled dashboard";

  const user = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("dashboards")
    .insert({ team_id: teamId, name, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    // RLS violation (viewer) or any other failure.
    throw new Error(`Could not create dashboard: ${error.message}`);
  }

  revalidatePath(`/org/${teamId}`);
  redirect(`/org/${teamId}/dashboards/${data.id}`);
}
