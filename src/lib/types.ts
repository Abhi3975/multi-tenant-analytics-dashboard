// Shared domain types mirroring the Postgres schema in supabase/migrations.

export type Role = "admin" | "editor" | "viewer";

export type MetricName = "revenue" | "errors" | "page_views" | "clicks";

export const METRIC_NAMES: MetricName[] = [
  "revenue",
  "errors",
  "page_views",
  "clicks",
];

export type WidgetType = "line_chart" | "bar_chart" | "stat";

export const WIDGET_TYPES: { value: WidgetType; label: string }[] = [
  { value: "line_chart", label: "Line chart" },
  { value: "bar_chart", label: "Bar chart" },
  { value: "stat", label: "Stat tile" },
];

/** Grid position/size in 12-column grid units. */
export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetConfig {
  metric: MetricName;
  title?: string;
}

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Team {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export interface Membership {
  user_id: string;
  team_id: string;
  role: Role;
  created_at: string;
}

export interface Dashboard {
  id: string;
  team_id: string;
  name: string;
  layout: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Widget {
  id: string;
  dashboard_id: string;
  type: WidgetType;
  config: WidgetConfig;
  position: WidgetPosition;
  created_at: string;
}

export interface Metric {
  id: string;
  team_id: string;
  metric_name: MetricName;
  value: number;
  recorded_at: string;
}

/** admin/editor may write; viewer is read-only. */
export function canWrite(role: Role | null | undefined): boolean {
  return role === "admin" || role === "editor";
}
