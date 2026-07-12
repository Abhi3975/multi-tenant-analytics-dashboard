// Shared domain types mirroring the Postgres schema in supabase/migrations.

export type Role = "admin" | "editor" | "viewer";

// A metric key. The four built-ins ship globally; teams can define custom keys
// (Tier 3), so this is a string rather than a closed union.
export type MetricName = string;

export const BUILTIN_METRICS = [
  "revenue",
  "errors",
  "page_views",
  "clicks",
  "users",
] as const;

/** Kept for back-compat; prefer team-specific definitions from the DB. */
export const METRIC_NAMES: MetricName[] = [...BUILTIN_METRICS];

export interface MetricDefinition {
  id: string;
  team_id: string | null;
  key: string;
  label: string;
  unit: string | null;
  is_builtin: boolean;
  created_at: string;
}

export type WidgetType = "line_chart" | "bar_chart" | "stat" | "kpi";

export const WIDGET_TYPES: { value: WidgetType; label: string }[] = [
  { value: "line_chart", label: "Line chart" },
  { value: "bar_chart", label: "Bar chart" },
  { value: "stat", label: "Stat tile" },
  { value: "kpi", label: "KPI" },
];

/** Grid position/size in 12-column grid units. */
export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetConfig {
  /** For chart/stat widgets: the metric key to visualize. */
  metric?: MetricName;
  /** For KPI widgets: the KPI definition to evaluate. */
  kpiDefinitionId?: string;
  title?: string;
}

export interface KpiDefinition {
  id: string;
  team_id: string;
  name: string;
  formula: string;
  created_by: string | null;
  created_at: string;
}

export interface AnomalyAlert {
  id: string;
  team_id: string;
  metric_name: string;
  value: number;
  mean: number;
  stddev: number;
  z_score: number;
  created_at: string;
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

export interface Project {
  id: string;
  team_id: string;
  name: string;
  created_at: string;
}

export interface Dashboard {
  id: string;
  team_id: string;
  project_id: string;
  name: string;
  layout: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Webhook {
  id: string;
  team_id: string;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  team_id: string;
  event: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  ok: boolean;
  error: string | null;
  attempts: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  team_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Webhook/audit event names emitted by server actions. */
export const WEBHOOK_EVENTS = [
  "dashboard.created",
  "dashboard.deleted",
  "widget.added",
  "widget.removed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

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
