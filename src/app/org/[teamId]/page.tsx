import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboard, Folder, Webhook, ScrollText, Gauge } from "lucide-react";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canWrite, type Project } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { NewDashboardForm } from "./new-dashboard-form";
import { NewProjectForm } from "./new-project-form";

interface DashboardRow {
  id: string;
  name: string;
  project_id: string;
}

export default async function TeamPage({
  params,
}: {
  params: { teamId: string };
}) {
  const { teamId } = params;
  const user = await requireUser();
  const supabase = createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, organizations(name)")
    .eq("id", teamId)
    .maybeSingle();

  if (!team) notFound();

  const role = await getTeamRole(teamId, user.id);
  const writable = canWrite(role);
  const isAdmin = role === "admin";

  const [{ data: projects }, { data: dashboards }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, team_id, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
    supabase
      .from("dashboards")
      .select("id, name, project_id")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
  ]);

  const projectList = (projects ?? []) as Project[];
  const dashList = (dashboards ?? []) as DashboardRow[];
  const byProject = (projectId: string) =>
    dashList.filter((d) => d.project_id === projectId);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-2">
        <Link
          href="/org"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Teams
        </Link>
      </div>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
        <Badge variant="secondary" className="capitalize">
          {role ?? "no access"}
        </Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {writable && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/org/${teamId}/metrics`}>
                <Gauge className="mr-1" /> Metrics
              </Link>
            </Button>
          )}
          {isAdmin && (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/org/${teamId}/webhooks`}>
                  <Webhook className="mr-1" /> Webhooks
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/org/${teamId}/audit`}>
                  <ScrollText className="mr-1" /> Audit
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {writable && (
        <div className="mb-6">
          <NewProjectForm teamId={teamId} />
        </div>
      )}

      {projectList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No projects yet.
          {writable ? " Create one to organize dashboards." : ""}
        </p>
      ) : (
        <div className="space-y-6">
          {projectList.map((project) => {
            const items = byProject(project.id);
            return (
              <section key={project.id}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="size-4 text-muted-foreground" />
                    <h2 className="font-medium">{project.name}</h2>
                    <span className="text-xs text-muted-foreground">
                      {items.length}{" "}
                      {items.length === 1 ? "dashboard" : "dashboards"}
                    </span>
                  </div>
                  {writable && (
                    <NewDashboardForm teamId={teamId} projectId={project.id} />
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="pl-6 text-sm text-muted-foreground">
                    No dashboards in this project yet.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {items.map((d) => (
                      <Link
                        key={d.id}
                        href={`/org/${teamId}/dashboards/${d.id}`}
                        className="block"
                      >
                        <Card className="transition-colors hover:bg-accent">
                          <CardHeader className="flex-row items-center gap-3 space-y-0 py-3">
                            <LayoutDashboard className="text-muted-foreground" />
                            <CardTitle className="text-sm">{d.name}</CardTitle>
                          </CardHeader>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
