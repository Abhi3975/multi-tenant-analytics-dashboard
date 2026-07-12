-- =============================================================================
-- Tier 3: Project level, webhooks, audit logs, custom metric definitions
--
-- Access-control note: memberships stay TEAM-scoped (the unit RLS is built on).
-- Projects are a sub-grouping of dashboards inside a team; access to a project
-- is access to its team. This adds the third hierarchy level without disturbing
-- the Tier 1/2 isolation model.
-- =============================================================================

-- gen_random_bytes (webhook secret default) needs pgcrypto in `extensions`.
create extension if not exists pgcrypto with schema extensions;

-- --- Projects (Team -> Project -> Dashboard) -----------------------------------
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index projects_team_id_idx on public.projects (team_id);
alter table public.projects enable row level security;

-- Dashboards now live under a project. Add the column, backfill a default
-- project for any existing dashboards, then make it required.
alter table public.dashboards
  add column project_id uuid references public.projects (id) on delete cascade;

do $$
declare
  t record;
  gen_project uuid;
begin
  for t in
    select distinct team_id from public.dashboards where project_id is null
  loop
    insert into public.projects (team_id, name)
    values (t.team_id, 'General')
    returning id into gen_project;

    update public.dashboards
    set project_id = gen_project
    where team_id = t.team_id and project_id is null;
  end loop;
end $$;

alter table public.dashboards alter column project_id set not null;
create index dashboards_project_id_idx on public.dashboards (project_id);

-- --- Custom metric definitions --------------------------------------------------
-- team_id null => a global built-in available to everyone.
create table public.metric_definitions (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references public.teams (id) on delete cascade,
  key        text not null,
  label      text not null,
  unit       text,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index metric_definitions_global_key
  on public.metric_definitions (key) where team_id is null;
create unique index metric_definitions_team_key
  on public.metric_definitions (team_id, key) where team_id is not null;
alter table public.metric_definitions enable row level security;

-- Seed the four built-ins as global definitions.
insert into public.metric_definitions (team_id, key, label, unit, is_builtin) values
  (null, 'revenue',    'Revenue',    'USD', true),
  (null, 'errors',     'Errors',     null,  true),
  (null, 'page_views', 'Page views', null,  true),
  (null, 'clicks',     'Clicks',     null,  true);

-- Replace the hard-coded CHECK on metrics with a definition-backed trigger so
-- custom metric keys are allowed (but still validated).
alter table public.metrics drop constraint if exists metrics_metric_name_check;

create or replace function public.validate_metric_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.metric_definitions d
    where d.key = new.metric_name
      and (d.team_id is null or d.team_id = new.team_id)
  ) then
    raise exception 'Unknown metric_name "%" for team %', new.metric_name, new.team_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger metrics_validate_metric_name
  before insert or update on public.metrics
  for each row execute function public.validate_metric_name();

-- --- Webhooks -------------------------------------------------------------------
create table public.webhooks (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  url        text not null,
  events     text[] not null default '{}',
  secret     text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  is_active  boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index webhooks_team_id_idx on public.webhooks (team_id);
alter table public.webhooks enable row level security;

create table public.webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  webhook_id  uuid not null references public.webhooks (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete cascade,
  event       text not null,
  payload     jsonb not null default '{}'::jsonb,
  status_code integer,
  ok          boolean not null default false,
  error       text,
  created_at  timestamptz not null default now()
);
create index webhook_deliveries_webhook_id_idx
  on public.webhook_deliveries (webhook_id, created_at desc);
alter table public.webhook_deliveries enable row level security;

-- --- Audit logs -----------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_team_id_idx on public.audit_logs (team_id, created_at desc);
alter table public.audit_logs enable row level security;
