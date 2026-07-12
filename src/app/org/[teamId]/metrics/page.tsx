import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser, getTeamRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canWrite, type MetricDefinition } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NewMetricForm } from "./new-metric-form";
import { deleteMetricDefinition } from "./actions";

export default async function MetricsPage({
  params,
}: {
  params: { teamId: string };
}) {
  const { teamId } = params;
  const user = await requireUser();
  const role = await getTeamRole(teamId, user.id);
  if (!canWrite(role)) notFound();

  const supabase = createClient();
  const { data } = await supabase
    .from("metric_definitions")
    .select("*")
    .or(`team_id.is.null,team_id.eq.${teamId}`)
    .order("is_builtin", { ascending: false });

  const defs = (data ?? []) as MetricDefinition[];

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
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Metric definitions
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Built-in metrics are available to every team. Add custom metrics for this
        team; new metric data must reference a defined key.
      </p>

      <div className="mb-6">
        <NewMetricForm teamId={teamId} />
      </div>

      <div className="grid gap-2">
        {defs.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex items-center justify-between p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.label}</span>
                  <code className="rounded bg-muted px-1 text-xs">{d.key}</code>
                  {d.unit && (
                    <span className="text-xs text-muted-foreground">
                      {d.unit}
                    </span>
                  )}
                </div>
              </div>
              {d.is_builtin ? (
                <Badge variant="secondary">built-in</Badge>
              ) : (
                <form action={deleteMetricDefinition}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="id" value={d.id} />
                  <Button
                    size="sm"
                    variant="ghost"
                    type="submit"
                    className="text-destructive"
                  >
                    Delete
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
