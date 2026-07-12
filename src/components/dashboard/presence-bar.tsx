"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

interface Peer {
  email: string;
  role: Role | null;
  canEdit: boolean;
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Shows who else is currently viewing this dashboard, using Supabase Realtime
 * Presence. Editors/admins get a green "can edit" ring.
 */
export function PresenceBar({
  dashboardId,
  email,
  role,
  canEdit,
}: {
  dashboardId: string;
  email: string;
  role: Role | null;
  canEdit: boolean;
}) {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`presence:dashboard:${dashboardId}`, {
      config: { presence: { key: email } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Peer>();
        const list = Object.values(state)
          .map((entries) => entries[0])
          .filter(Boolean) as Peer[];
        setPeers(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email, role, canEdit });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dashboardId, email, role, canEdit]);

  if (peers.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {peers.map((p) => (
          <div
            key={p.email}
            title={`${p.email} · ${p.role ?? "viewer"}${
              p.email === email ? " (you)" : ""
            }`}
            className={`flex size-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold ${
              p.canEdit
                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500 dark:bg-emerald-900 dark:text-emerald-100"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {initials(p.email)}
          </div>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {peers.length} {peers.length === 1 ? "person" : "people"} here
      </span>
    </div>
  );
}
