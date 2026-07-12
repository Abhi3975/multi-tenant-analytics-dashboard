import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canWrite, type Widget } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { KpiPanel } from "@/components/dashboard/kpi-panel";
import { PresenceBar } from "@/components/dashboard/presence-bar";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { GridEditor } from "./grid-editor";
import { DashboardTitle } from "./dashboard-title";

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

  // Built-in (global) metrics + this team's custom definitions.
  const { data: defs } = await supabase
    .from("metric_definitions")
    .select("key, label, is_builtin, team_id")
    .or(`team_id.is.null,team_id.eq.${teamId}`);

  const availableMetrics = (defs ?? [])
    .sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin))
    .map((d) => ({ key: d.key as string, label: d.label as string }));

  const { data: kpis } = await supabase
    .from("kpi_definitions")
    .select("id, name")
    .eq("team_id", teamId)
    .order("name");
  const availableKpis = (kpis ?? []).map((k) => ({
    id: k.id as string,
    name: k.name as string,
  }));

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
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <DashboardTitle
          dashboardId={dashboardId}
          initialName={dashboard.name}
          canEdit={writable}
        />
        <Badge variant="secondary" className="capitalize">
          {role ?? "no access"}
        </Badge>
        {!writable && (
          <span className="text-sm text-muted-foreground">
            View only — editing is disabled for your role.
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <PresenceBar
            dashboardId={dashboardId}
            email={user.email ?? user.id}
            role={role}
            canEdit={writable}
          />
          <NotificationBell teamId={teamId} />
        </div>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Team KPIs
        </h2>
        <KpiPanel teamId={teamId} />
      </section>

      <GridEditor
        dashboardId={dashboardId}
        teamId={teamId}
        canEdit={writable}
        initialWidgets={(widgets ?? []) as Widget[]}
        availableMetrics={availableMetrics}
        availableKpis={availableKpis}
      />
    </div>
  );
}
