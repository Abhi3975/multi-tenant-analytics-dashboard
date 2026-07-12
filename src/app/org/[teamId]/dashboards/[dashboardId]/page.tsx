import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canWrite, type Widget } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { GridEditor } from "./grid-editor";

export default async function DashboardPage({
  params,
}: {
  params: { teamId: string; dashboardId: string };
}) {
  const { teamId, dashboardId } = params;
  const user = await requireUser();
  const supabase = createClient();

  // RLS ensures this returns a row only if the user can see this team.
  const { data: dashboard } = await supabase
    .from("dashboards")
    .select("id, name, team_id")
    .eq("id", dashboardId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!dashboard) notFound();

  const role = await getTeamRole(teamId, user.id);
  const writable = canWrite(role);

  const { data: widgets } = await supabase
    .from("widgets")
    .select("*")
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-2">
        <Link
          href={`/org/${teamId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Dashboards
        </Link>
      </div>
      <header className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {dashboard.name}
        </h1>
        <Badge variant="secondary" className="capitalize">
          {role ?? "no access"}
        </Badge>
        {!writable && (
          <span className="text-sm text-muted-foreground">
            View only — editing is disabled for your role.
          </span>
        )}
      </header>

      <GridEditor
        dashboardId={dashboardId}
        teamId={teamId}
        canEdit={writable}
        initialWidgets={(widgets ?? []) as Widget[]}
      />
    </div>
  );
}
