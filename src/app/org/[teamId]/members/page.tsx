import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emailsByIds } from "@/lib/admin-users";
import type { Role } from "@/lib/types";
import { AddMemberForm } from "./add-member-form";
import { MemberRow } from "./member-row";

export default async function MembersPage({
  params,
}: {
  params: { teamId: string };
}) {
  const { teamId } = params;
  const user = await requireUser();
  const role = await getTeamRole(teamId, user.id);
  if (role !== "admin") notFound();

  const supabase = createClient();
  const { data } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("team_id", teamId);

  const members = (data ?? []) as { user_id: string; role: Role }[];
  const emails = await emailsByIds(members.map((m) => m.user_id));

  const roleRank: Record<Role, number> = { admin: 0, editor: 1, viewer: 2 };
  members.sort((a, b) => roleRank[a.role] - roleRank[b.role]);

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
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Members</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Only admins can manage members. Add an existing user by email, change a
        role, or remove someone. Every change is enforced by RLS and recorded in
        the audit log.
      </p>

      <div className="mb-6">
        <AddMemberForm teamId={teamId} />
      </div>

      <div className="grid gap-2">
        {members.map((m) => (
          <MemberRow
            key={m.user_id}
            teamId={teamId}
            userId={m.user_id}
            email={emails[m.user_id] ?? m.user_id}
            role={m.role}
            isSelf={m.user_id === user.id}
          />
        ))}
      </div>
    </div>
  );
}
