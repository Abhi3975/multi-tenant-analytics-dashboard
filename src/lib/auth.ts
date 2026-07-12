import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

/** Current authenticated user, or null. */
export async function getUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Current user, or redirect to /login. Use to gate protected pages. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The current user's role in a team, or null if they aren't a member.
 * RLS also enforces this on every read/write; this is just for UI gating.
 */
export async function getTeamRole(
  teamId: string,
  userId: string
): Promise<Role | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as Role) ?? null;
}
