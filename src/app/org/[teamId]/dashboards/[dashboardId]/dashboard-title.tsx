"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { renameDashboard } from "./actions";

/**
 * Dashboard title that (a) lets editors/admins rename inline and (b) reflects
 * renames made by other users live, via Realtime Postgres Changes on the
 * `dashboards` table. Own-echo is de-duplicated so saving doesn't flicker.
 */
export function DashboardTitle({
  dashboardId,
  initialName,
  canEdit,
}: {
  dashboardId: string;
  initialName: string;
  canEdit: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const pendingName = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-meta:${dashboardId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dashboards",
          filter: `id=eq.${dashboardId}`,
        },
        (payload) => {
          const next = (payload.new as { name: string }).name;
          // Ignore the echo of our own rename.
          if (pendingName.current === next) {
            pendingName.current = null;
            return;
          }
          setName(next);
          setDraft(next);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dashboardId]);

  async function save() {
    const clean = draft.trim();
    setEditing(false);
    if (!clean || clean === name) {
      setDraft(name);
      return;
    }
    pendingName.current = clean;
    setName(clean); // optimistic
    await renameDashboard(dashboardId, clean).catch((e) => {
      console.error(e);
      setName(name); // revert on failure
      pendingName.current = null;
    });
  }

  if (canEdit && editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        className="rounded border bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    );
  }

  return (
    <h1
      className={`group flex items-center gap-2 text-2xl font-semibold tracking-tight ${
        canEdit ? "cursor-text" : ""
      }`}
      onClick={() => canEdit && setEditing(true)}
      title={canEdit ? "Click to rename" : undefined}
    >
      {name}
      {canEdit && (
        <Pencil className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </h1>
  );
}
