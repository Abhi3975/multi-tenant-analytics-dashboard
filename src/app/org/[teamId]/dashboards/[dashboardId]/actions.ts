"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import type {
  MetricName,
  Widget,
  WidgetConfig,
  WidgetPosition,
  WidgetType,
} from "@/lib/types";

/** Look up the team that owns a dashboard (for audit/webhook context). */
async function teamForDashboard(dashboardId: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("dashboards")
    .select("team_id")
    .eq("id", dashboardId)
    .maybeSingle();
  return data?.team_id ?? null;
}

/**
 * All of these writes are enforced by RLS ("widgets_*_writers" ->
 * can_write_dashboard). A viewer calling them directly gets an error; the UI
 * also hides the controls.
 */

export async function addWidget(input: {
  dashboardId: string;
  type: WidgetType;
  metric: MetricName;
  position: WidgetPosition;
}): Promise<Widget> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("widgets")
    .insert({
      dashboard_id: input.dashboardId,
      type: input.type,
      config: { metric: input.metric } satisfies WidgetConfig,
      position: input.position,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Could not add widget: ${error.message}`);

  const widget = data as Widget;
  const user = await requireUser();
  const teamId = await teamForDashboard(input.dashboardId);
  if (teamId) {
    await recordAudit({
      teamId,
      actorId: user.id,
      actorEmail: user.email,
      action: "widget.added",
      entityType: "widget",
      entityId: widget.id,
      metadata: { dashboard_id: input.dashboardId, type: input.type, metric: input.metric },
    });
    await dispatchWebhook(teamId, "widget.added", {
      widget_id: widget.id,
      dashboard_id: input.dashboardId,
      type: input.type,
      metric: input.metric,
      by: user.email,
    });
  }
  return widget;
}

export async function updateWidgetPosition(
  widgetId: string,
  position: WidgetPosition
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("widgets")
    .update({ position })
    .eq("id", widgetId);
  if (error) throw new Error(`Could not save layout: ${error.message}`);
}

/** Rename a dashboard (writers). The change propagates via Realtime on the
 *  `dashboards` table — no revalidate needed for other viewers. */
export async function renameDashboard(
  dashboardId: string,
  name: string
): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("dashboards")
    .update({ name: clean })
    .eq("id", dashboardId);
  if (error) throw new Error(`Could not rename dashboard: ${error.message}`);
}

export async function updateWidgetConfig(
  widgetId: string,
  config: WidgetConfig
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("widgets")
    .update({ config })
    .eq("id", widgetId);
  if (error) throw new Error(`Could not update widget: ${error.message}`);
}

export async function removeWidget(widgetId: string): Promise<void> {
  const supabase = createClient();

  // Capture dashboard/team before deleting, for audit + webhooks.
  const { data: existing } = await supabase
    .from("widgets")
    .select("id, dashboard_id")
    .eq("id", widgetId)
    .maybeSingle();

  const { error } = await supabase.from("widgets").delete().eq("id", widgetId);
  if (error) throw new Error(`Could not remove widget: ${error.message}`);

  if (existing) {
    const user = await requireUser();
    const teamId = await teamForDashboard(existing.dashboard_id);
    if (teamId) {
      await recordAudit({
        teamId,
        actorId: user.id,
        actorEmail: user.email,
        action: "widget.removed",
        entityType: "widget",
        entityId: widgetId,
        metadata: { dashboard_id: existing.dashboard_id },
      });
      await dispatchWebhook(teamId, "widget.removed", {
        widget_id: widgetId,
        dashboard_id: existing.dashboard_id,
        by: user.email,
      });
    }
  }
}
