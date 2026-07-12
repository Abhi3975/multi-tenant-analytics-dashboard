import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export default async function AuditPage({
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
    .from("audit_logs")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(100);

  const logs = (data ?? []) as AuditLog[];

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
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Immutable record of changes on this team. Written server-side with the
        service role — users cannot insert or alter entries.
      </p>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="grid gap-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {log.action}
                </Badge>
                <span className="text-muted-foreground">
                  {log.actor_email ?? "system"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
