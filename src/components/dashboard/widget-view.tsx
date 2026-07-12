"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { Metric, MetricName, WidgetConfig, WidgetType } from "@/lib/types";
import { detectAnomalies, mean, stddev, zScore } from "@/lib/anomaly";

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
  anomaly: boolean;
}

const ANOMALY_COLOR = "hsl(var(--destructive))";

/**
 * Reads the `metrics` table (team_id + metric_name), scoped by RLS to the
 * current user, refreshes on an interval, and flags anomalies (z-score).
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
  const [raw, setRaw] = useState<{ t: string; value: number }[]>([]);

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
      setRaw(
        (data as Pick<Metric, "value" | "recorded_at">[])
          .map((r) => ({ t: timeLabel(r.recorded_at), value: r.value }))
          .reverse()
      );
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [teamId, config.metric]);

  const { rows, anomalyCount, latest, latestIsAnomaly, delta } = useMemo(() => {
    const values = raw.map((r) => r.value);
    const flags = detectAnomalies(values);
    const rows: Point[] = raw.map((r, i) => ({ ...r, anomaly: flags[i] }));
    const latest = values.length ? values[values.length - 1] : null;
    const prev = values.length > 1 ? values[values.length - 2] : null;
    const avg = mean(values);
    const sd = stddev(values, avg);
    const latestIsAnomaly =
      latest !== null && values.length >= 4 && Math.abs(zScore(latest, avg, sd)) > 2.5;
    return {
      rows,
      anomalyCount: flags.filter(Boolean).length,
      latest,
      latestIsAnomaly,
      delta: latest !== null && prev !== null ? latest - prev : null,
    };
  }, [raw]);

  const stroke = "hsl(var(--chart-2))";
  const fill = "hsl(var(--chart-1))";

  if (type === "stat") {
    return (
      <div className="flex h-full flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-semibold tabular-nums">
            {latest === null ? "—" : formatValue(config.metric, latest)}
          </span>
          {latestIsAnomaly && (
            <AlertTriangle
              className="size-4 text-destructive"
              aria-label="Anomaly detected"
            />
          )}
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
    <div className="relative h-full w-full">
      {anomalyCount > 0 && (
        <span className="absolute right-1 top-0 z-10 inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
          <AlertTriangle className="size-3" />
          {anomalyCount}
        </span>
      )}
      <ResponsiveContainer width="100%" height="100%">
        {type === "bar_chart" ? (
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} width={44} />
            <Tooltip
              formatter={(value) => formatValue(config.metric, Number(value))}
            />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.anomaly ? ANOMALY_COLOR : fill} />
              ))}
            </Bar>
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
              isAnimationActive={false}
              dot={(props) => {
                const { cx, cy, index } = props;
                if (!rows[index]?.anomaly)
                  return <g key={index} />;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={ANOMALY_COLOR}
                    stroke="white"
                    strokeWidth={1}
                  />
                );
              }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
