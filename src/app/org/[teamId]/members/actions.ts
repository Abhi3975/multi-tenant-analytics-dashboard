"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { findUserIdByEmail } from "@/lib/admin-users";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["admin", "editor", "viewer"];

function parseRole(v: FormDataEntryValue | null): Role {
  const r = String(v);
  if (!ROLES.includes(r as Role)) throw new Error("Invalid role");
  return r as Role;
}

/**
 * Add an existing user to a team by email. RLS ("memberships_insert_admin")
 * enforces that only team admins can do this; we resolve the email -> user id
 * with the service role since auth.users isn't reachable via RLS.
 */
export async function addMember(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const email = String(formData.get("email") || "").trim();
  const role = parseRole(formData.get("role"));

  const user = await requireUser();
  const supabase = createClient();

  const userId = await findUserIdByEmail(email);
  if (!userId) {
    throw new Error(`No user found with email ${email}`);
  }

  const { error } = await supabase
    .from("memberships")
    .insert({ user_id: userId, team_id: teamId, role });

  if (error) {
    throw new Error(
      error.code === "23505"
        ? `${email} is already a member of this team`
        : `Could not add member: ${error.message}`
    );
  }

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "member.added",
    entityType: "membership",
    entityId: userId,
    metadata: { email, role },
  });

  revalidatePath(`/org/${teamId}/members`);
}

export async function updateMemberRole(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const userId = String(formData.get("userId"));
  const role = parseRole(formData.get("role"));

  const user = await requireUser();
  if (userId === user.id) {
    throw new Error("You can't change your own role");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not update role: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "member.role_changed",
    entityType: "membership",
    entityId: userId,
    metadata: { role },
  });

  revalidatePath(`/org/${teamId}/members`);
}

export async function removeMember(formData: FormData) {
  const teamId = String(formData.get("teamId"));
  const userId = String(formData.get("userId"));

  const user = await requireUser();
  if (userId === user.id) {
    throw new Error("You can't remove yourself from the team");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not remove member: ${error.message}`);

  await recordAudit({
    teamId,
    actorId: user.id,
    actorEmail: user.email,
    action: "member.removed",
    entityType: "membership",
    entityId: userId,
  });

  revalidatePath(`/org/${teamId}/members`);
}
