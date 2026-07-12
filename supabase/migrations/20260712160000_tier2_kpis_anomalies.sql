-- =============================================================================
-- Tier 2 completion: user-defined KPIs + server-side anomaly alerts
-- =============================================================================

-- --- KPI definitions ------------------------------------------------------------
-- A KPI is a named arithmetic formula over metric keys, e.g. "revenue / users".
-- The formula is validated/evaluated by a safe parser (src/lib/kpi-formula.ts),
-- never eval()'d.
create table public.kpi_definitions (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null,
  formula    text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index kpi_definitions_team_name on public.kpi_definitions (team_id, name);
create index kpi_definitions_team_id_idx on public.kpi_definitions (team_id);
alter table public.kpi_definitions enable row level security;

-- --- Anomaly alerts -------------------------------------------------------------
-- One row per detected anomaly, written by the detector trigger below.
create table public.anomaly_alerts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  metric_name text not null,
  value       double precision not null,
  mean        double precision not null,
  stddev      double precision not null,
  z_score     double precision not null,
  created_at  timestamptz not null default now()
);
create index anomaly_alerts_team_idx on public.anomaly_alerts (team_id, created_at desc);
alter table public.anomaly_alerts enable row level security;

-- --- 'users' built-in metric (so "revenue / users" ARPU works out of the box) ---
insert into public.metric_definitions (team_id, key, label, unit, is_builtin)
values (null, 'users', 'Users', null, true)
on conflict do nothing;

-- --- Anomaly detector -----------------------------------------------------------
-- Rolling-window z-score. On each new metric reading we look at the previous
-- WINDOW readings for the same (team, metric), compute their mean and population
-- stddev, and if we have at least MIN_SAMPLES and the new value is more than
-- THRESHOLD standard deviations away, we record an anomaly_alert.
--
-- SECURITY DEFINER so the insert into anomaly_alerts succeeds regardless of who
-- inserted the metric (there is no INSERT policy on anomaly_alerts for users).
create or replace function public.detect_anomaly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  window_size  constant int  := 20;
  min_samples  constant int  := 8;
  threshold    constant real := 2.0;
  m double precision;
  s double precision;
  c int;
  z double precision;
begin
  select count(*), avg(value), stddev_pop(value)
    into c, m, s
  from (
    select value
    from public.metrics
    where team_id = new.team_id
      and metric_name = new.metric_name
      and id <> new.id
    order by recorded_at desc
    limit window_size
  ) recent;

  if c >= min_samples and s is not null and s > 0 then
    z := abs((new.value - m) / s);
    if z > threshold then
      insert into public.anomaly_alerts (team_id, metric_name, value, mean, stddev, z_score)
      values (new.team_id, new.metric_name, new.value, m, s, z);
    end if;
  end if;

  return new;
end;
$$;

create trigger metrics_detect_anomaly
  after insert on public.metrics
  for each row execute function public.detect_anomaly();

-- --- Realtime -------------------------------------------------------------------
-- Metrics: so KPI widgets recompute live. Anomaly alerts: so the notification
-- bell + widget badges update live. RLS still scopes delivery to team members.
alter publication supabase_realtime add table public.metrics;
alter publication supabase_realtime add table public.anomaly_alerts;

-- --- RLS policies ---------------------------------------------------------------
-- kpi_definitions: members read; writers (admin/editor) manage.
create policy "kpi_definitions_select_members"
  on public.kpi_definitions for select to authenticated
  using (public.is_team_member(team_id));
create policy "kpi_definitions_insert_writers"
  on public.kpi_definitions for insert to authenticated
  with check (public.can_write_team(team_id));
create policy "kpi_definitions_update_writers"
  on public.kpi_definitions for update to authenticated
  using (public.can_write_team(team_id))
  with check (public.can_write_team(team_id));
create policy "kpi_definitions_delete_writers"
  on public.kpi_definitions for delete to authenticated
  using (public.can_write_team(team_id));

-- anomaly_alerts: members read; only the detector (definer) writes.
create policy "anomaly_alerts_select_members"
  on public.anomaly_alerts for select to authenticated
  using (public.is_team_member(team_id));
