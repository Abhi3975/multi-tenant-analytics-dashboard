"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  MetricName,
  Widget,
  WidgetConfig,
  WidgetPosition,
  WidgetType,
} from "@/lib/types";

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
  return data as Widget;
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
  const { error } = await supabase.from("widgets").delete().eq("id", widgetId);
  if (error) throw new Error(`Could not remove widget: ${error.message}`);
}
