"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { AnomalyAlert } from "@/lib/types";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function describe(a: AnomalyAlert): string {
  return `${a.metric_name.replace("_", " ")} = ${Math.round(
    a.value
  ).toLocaleString()} (${a.z_score.toFixed(1)}σ from mean ${Math.round(
    a.mean
  ).toLocaleString()})`;
}

/**
 * Bell icon listing recent anomaly alerts for the current team (newest first),
 * plus a transient toast whenever a new one arrives via Realtime. Alerts are
 * produced server-side by the rolling-window detector trigger on `metrics`.
 */
export function NotificationBell({ teamId }: { teamId: string }) {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<AnomalyAlert[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("anomaly_alerts")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!active || !data) return;
      const rows = data as AnomalyAlert[];
      rows.forEach((r) => seen.current.add(r.id));
      setAlerts(rows);
    }
    load();

    const channel = supabase
      .channel(`alerts:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "anomaly_alerts",
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const a = payload.new as AnomalyAlert;
          if (seen.current.has(a.id)) return;
          seen.current.add(a.id);
          setAlerts((prev) => [a, ...prev].slice(0, 20));
          setUnread((n) => n + 1);
          setToasts((prev) => [a, ...prev]);
          setTimeout(
            () => setToasts((prev) => prev.filter((t) => t.id !== a.id)),
            6000
          );
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => {
            setOpen((o) => !o);
            setUnread(0);
          }}
          className="relative rounded-md p-1.5 hover:bg-accent"
          aria-label="Anomaly alerts"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-1 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg">
            <div className="border-b px-3 py-2 text-sm font-medium">
              Anomaly alerts
            </div>
            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No anomalies detected yet.
                </p>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 border-b px-3 py-2 last:border-b-0"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <div className="text-sm capitalize">{describe(a)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {timeAgo(a.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm shadow-lg"
          >
            <AlertTriangle className="size-4 text-destructive" />
            <span className="capitalize">Anomaly: {describe(a)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
