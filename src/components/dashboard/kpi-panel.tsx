"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { MetricName } from "@/lib/types";
import { DEFAULT_ANOMALY_THRESHOLD } from "@/lib/anomaly";
import { Card } from "@/components/ui/card";

const REFRESH_MS = 4000;

interface Kpi {
  metric_name: MetricName;
  latest_value: number | null;
  previous_value: number | null;
  avg_value: number | null;
  min_value: number | null;
  max_value: number | null;
  stddev_value: number | null;
  sample_count: number;
}

function fmt(metric: MetricName, value: number | null): string {
  if (value === null) return "—";
  if (metric === "revenue") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function label(metric: MetricName): string {
  return metric.replace("_", " ");
}

export function KpiPanel({ teamId }: { teamId: string }) {
  const [kpis, setKpis] = useState<Kpi[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("metric_kpis")
        .select("*")
        .eq("team_id", teamId);
      if (active && data) setKpis(data as Kpi[]);
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [teamId]);

  if (kpis.length === 0) return null;

  const order: MetricName[] = ["revenue", "page_views", "clicks", "errors"];
  const sorted = [...kpis].sort(
    (a, b) => order.indexOf(a.metric_name) - order.indexOf(b.metric_name)
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {sorted.map((k) => {
        const latest = k.latest_value;
        const prev = k.previous_value;
        const deltaPct =
          latest !== null && prev !== null && prev !== 0
            ? ((latest - prev) / Math.abs(prev)) * 100
            : null;
        const sd = k.stddev_value ?? 0;
        const avg = k.avg_value ?? 0;
        const anomaly =
          latest !== null &&
          sd > 0 &&
          k.sample_count >= 4 &&
          Math.abs((latest - avg) / sd) > DEFAULT_ANOMALY_THRESHOLD;

        return (
          <Card key={k.metric_name} className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium capitalize text-muted-foreground">
                {label(k.metric_name)}
              </span>
              {anomaly && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive"
                  title="Latest value is a statistical anomaly"
                >
                  <AlertTriangle className="size-3" /> anomaly
                </span>
              )}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {fmt(k.metric_name, latest)}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>avg {fmt(k.metric_name, avg)}</span>
              {deltaPct !== null && (
                <span
                  className={
                    deltaPct >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }
                >
                  {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
