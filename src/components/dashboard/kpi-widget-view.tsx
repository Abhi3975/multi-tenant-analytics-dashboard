"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { evaluateFormula, parseFormula } from "@/lib/kpi-formula";
import type { WidgetConfig } from "@/lib/types";

/**
 * KPI widget: loads its KPI definition, evaluates the formula against the latest
 * value of each referenced metric, and recomputes live — it subscribes to
 * `metrics` Realtime inserts for the team and re-evaluates when a referenced
 * metric changes.
 */
export function KpiWidgetView({
  teamId,
  config,
}: {
  teamId: string;
  config: WidgetConfig;
}) {
  const [name, setName] = useState(config.title ?? "KPI");
  const [formula, setFormula] = useState<string | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const metricsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!config.kpiDefinitionId) return;
    const supabase = createClient();
    let active = true;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;

    async function recompute(f: string, metrics: string[]) {
      const rows = await Promise.all(
        metrics.map((m) =>
          supabase
            .from("metrics")
            .select("value")
            .eq("team_id", teamId)
            .eq("metric_name", m)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        )
      );
      if (!active) return;
      const vars: Record<string, number> = {};
      metrics.forEach((m, i) => {
        const v = rows[i].data?.value;
        if (typeof v === "number") vars[m] = v;
      });
      setValue(evaluateFormula(f, vars));
    }

    async function init() {
      const { data } = await supabase
        .from("kpi_definitions")
        .select("name, formula")
        .eq("id", config.kpiDefinitionId!)
        .maybeSingle();
      if (!active || !data) return;
      setName(config.title ?? (data.name as string));
      setFormula(data.formula as string);
      const parsed = parseFormula(data.formula as string);
      metricsRef.current = parsed.metrics;
      await recompute(data.formula as string, parsed.metrics);

      // Live recompute: any new metric reading for a referenced metric.
      const channel = supabase
        .channel(`kpi-metrics:${teamId}:${config.kpiDefinitionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "metrics",
            filter: `team_id=eq.${teamId}`,
          },
          (payload) => {
            const mn = (payload.new as { metric_name: string }).metric_name;
            if (!metricsRef.current.includes(mn)) return;
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(
              () => recompute(data.formula as string, metricsRef.current),
              300
            );
          }
        )
        .subscribe();
      cleanup = () => supabase.removeChannel(channel);
    }

    let cleanup = () => {};
    init();
    return () => {
      active = false;
      clearTimeout(reloadTimer);
      cleanup();
    };
  }, [teamId, config.kpiDefinitionId, config.title]);

  const display =
    value === null
      ? "—"
      : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="text-3xl font-semibold tabular-nums">{display}</div>
      {formula && (
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {name} = {formula}
        </div>
      )}
    </div>
  );
}
