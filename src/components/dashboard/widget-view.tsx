"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { createClient } from "@/lib/supabase/client";
import type { Metric, MetricName, WidgetConfig, WidgetType } from "@/lib/types";

const POINTS = 30;
const REFRESH_MS = 4000;

function formatValue(metric: MetricName, value: number): string {
  if (metric === "revenue") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface Point {
  t: string;
  value: number;
}

/**
 * Reads the `metrics` table (team_id + metric_name), scoped by RLS to the
 * current user's session, and refreshes on an interval so the simulate script
 * shows live movement.
 */
export function WidgetView({
  teamId,
  type,
  config,
}: {
  teamId: string;
  type: WidgetType;
  config: WidgetConfig;
}) {
  const [rows, setRows] = useState<Point[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("metrics")
        .select("value, recorded_at")
        .eq("team_id", teamId)
        .eq("metric_name", config.metric)
        .order("recorded_at", { ascending: false })
        .limit(POINTS);

      if (!active || !data) return;
      const points = (data as Pick<Metric, "value" | "recorded_at">[])
        .map((r) => ({ t: timeLabel(r.recorded_at), value: r.value }))
        .reverse();
      setRows(points);
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [teamId, config.metric]);

  const latest = rows.length ? rows[rows.length - 1].value : null;
  const stroke = "hsl(var(--chart-2))";
  const fill = "hsl(var(--chart-1))";

  if (type === "stat") {
    const prev = rows.length > 1 ? rows[rows.length - 2].value : null;
    const delta = latest !== null && prev !== null ? latest - prev : null;
    return (
      <div className="flex h-full flex-col justify-center">
        <div className="text-3xl font-semibold tabular-nums">
          {latest === null ? "—" : formatValue(config.metric, latest)}
        </div>
        {delta !== null && (
          <div
            className={
              delta >= 0
                ? "text-xs text-emerald-600 dark:text-emerald-400"
                : "text-xs text-destructive"
            }
          >
            {delta >= 0 ? "▲" : "▼"} {formatValue(config.metric, Math.abs(delta))}{" "}
            vs previous
          </div>
        )}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === "bar_chart" ? (
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} width={44} />
          <Tooltip
            formatter={(value) => formatValue(config.metric, Number(value))}
            labelClassName="text-xs"
          />
          <Bar dataKey="value" fill={fill} radius={[2, 2, 0, 0]} />
        </BarChart>
      ) : (
        <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} width={44} />
          <Tooltip
            formatter={(value) => formatValue(config.metric, Number(value))}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
