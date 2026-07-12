-- =============================================================================
-- Initial schema: organizations -> teams -> (memberships, dashboards, metrics)
--                                            dashboards -> widgets
--
-- Row Level Security is ENABLED on every table at the bottom of this file.
-- The actual access policies live in a later migration
-- (20260712120200_rls_policies.sql) and depend on the helper functions in
-- 20260712120100_rls_helper_functions.sql.
-- =============================================================================

-- gen_random_uuid() is in Postgres core (>= 13). pgcrypto (for crypt/gen_salt,
-- used by seed.sql) is provided by Supabase in the `extensions` schema.

-- Role enum shared by memberships ------------------------------------------------
create type public.app_role as enum ('admin', 'editor', 'viewer');

-- organizations: the tenant boundary --------------------------------------------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- teams: belong to exactly one organization -------------------------------------
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index teams_org_id_idx on public.teams (org_id);

-- memberships: a user's role within a team (the unit of access) ------------------
create table public.memberships (
  user_id    uuid not null references auth.users (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  role       public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);
create index memberships_team_id_idx on public.memberships (team_id);
create index memberships_user_id_idx on public.memberships (user_id);

-- dashboards: owned by a team ----------------------------------------------------
create table public.dashboards (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null,
  layout     jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dashboards_team_id_idx on public.dashboards (team_id);

-- widgets: belong to a dashboard (team is derived via the dashboard) -------------
create table public.widgets (
  id           uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  type         text not null,
  config       jsonb not null default '{}'::jsonb,
  position     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index widgets_dashboard_id_idx on public.widgets (dashboard_id);

-- metrics: time-series data points owned by a team ------------------------------
create table public.metrics (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  metric_name text not null
    check (metric_name in ('revenue', 'errors', 'page_views', 'clicks')),
  value       double precision not null,
  recorded_at timestamptz not null default now()
);
create index metrics_team_id_idx on public.metrics (team_id);
create index metrics_team_name_time_idx
  on public.metrics (team_id, metric_name, recorded_at desc);

-- Keep dashboards.updated_at fresh ----------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger dashboards_set_updated_at
  before update on public.dashboards
  for each row
  execute function public.set_updated_at();

-- Enable Row Level Security on EVERY table --------------------------------------
-- With RLS enabled and no policy matching a request, Postgres returns zero rows
-- (and rejects writes). Policies are added in a later migration.
alter table public.organizations enable row level security;
alter table public.teams         enable row level security;
alter table public.memberships   enable row level security;
alter table public.dashboards    enable row level security;
alter table public.widgets       enable row level security;
alter table public.metrics       enable row level security;
