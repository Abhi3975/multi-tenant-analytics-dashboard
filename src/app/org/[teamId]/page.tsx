import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canWrite, type Dashboard } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { NewDashboardForm } from "./new-dashboard-form";

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

  // No row => not a member (RLS filtered it out) or nonexistent team.
  if (!team) notFound();

  const role = await getTeamRole(teamId, user.id);
  const writable = canWrite(role);

  const { data: dashboards } = await supabase
    .from("dashboards")
    .select("id, name, updated_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  const list = (dashboards ?? []) as Pick<
    Dashboard,
    "id" | "name" | "updated_at"
  >[];

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
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {team.name}
          </h1>
          <Badge variant="secondary" className="capitalize">
            {role ?? "no access"}
          </Badge>
        </div>
        {writable && <NewDashboardForm teamId={teamId} />}
      </header>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No dashboards yet.
          {writable
            ? " Create one to get started."
            : " Ask an editor or admin to create one."}
        </p>
      ) : (
        <div className="grid gap-3">
          {list.map((d) => (
            <Link
              key={d.id}
              href={`/org/${teamId}/dashboards/${d.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-accent">
                <CardHeader className="flex-row items-center gap-3 space-y-0 py-4">
                  <LayoutDashboard className="text-muted-foreground" />
                  <CardTitle className="text-base">{d.name}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
