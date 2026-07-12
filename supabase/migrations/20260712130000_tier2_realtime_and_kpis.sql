-- =============================================================================
-- Tier 2: realtime collaboration + KPI calculations
-- =============================================================================

-- --- Realtime -------------------------------------------------------------------
-- Publish widget changes so collaborators see add/move/resize/remove live.
-- Realtime enforces the same RLS as reads, so a user only receives changes for
-- dashboards on teams they belong to.
alter publication supabase_realtime add table public.widgets;

-- Ensure UPDATE/DELETE payloads carry enough info for clients to reconcile.
alter table public.widgets replica identity full;

-- --- KPI view -------------------------------------------------------------------
-- Per-team, per-metric rollups computed in the database. `security_invoker = on`
-- means the view runs with the QUERYING user's privileges, so RLS on `metrics`
-- still isolates tenants — a Marketing viewer only ever sees Marketing KPIs.
create view public.metric_kpis
with (security_invoker = on) as
select
  m.team_id,
  m.metric_name,
  count(*)                                              as sample_count,
  avg(m.value)                                          as avg_value,
  min(m.value)                                          as min_value,
  max(m.value)                                          as max_value,
  coalesce(stddev_pop(m.value), 0)                      as stddev_value,
  (array_agg(m.value order by m.recorded_at desc))[1]   as latest_value,
  (array_agg(m.value order by m.recorded_at desc))[2]   as previous_value,
  max(m.recorded_at)                                    as latest_at
from public.metrics m
group by m.team_id, m.metric_name;

grant select on public.metric_kpis to authenticated;
