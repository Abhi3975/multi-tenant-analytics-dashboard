-- =============================================================================
-- RLS helper functions
--
-- These are SECURITY DEFINER so they run with the function owner's privileges
-- and read `memberships` WITHOUT triggering RLS. That does two things:
--   1. Avoids infinite recursion (a policy ON memberships that needs to read
--      memberships would otherwise recurse).
--   2. Gives a single, trusted source of truth for "is the CURRENT user
--      (auth.uid()) allowed to touch this team?" that every policy reuses.
--
-- Every function is keyed on auth.uid(), so a user can only ever prove
-- membership/role for teams they personally belong to.
-- `set search_path = public` prevents search_path hijacking of a definer func.
-- =============================================================================

-- Is the current user a member of this team (any role)?
create or replace function public.is_team_member(_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.team_id = _team_id
      and m.user_id = auth.uid()
  );
$$;

-- Does the current user hold one of the given roles in this team?
create or replace function public.has_team_role(_team_id uuid, _roles public.app_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.team_id = _team_id
      and m.user_id = auth.uid()
      and m.role = any (_roles)
  );
$$;

-- Admin of this team?
create or replace function public.is_team_admin(_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_team_role(_team_id, array['admin']::public.app_role[]);
$$;

-- Allowed to WRITE team-scoped content (admins and editors, not viewers)?
create or replace function public.can_write_team(_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_team_role(_team_id, array['admin', 'editor']::public.app_role[]);
$$;

-- Member of any team inside this organization?
create or replace function public.is_org_member(_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships m
    join public.teams t on t.id = m.team_id
    where t.org_id = _org_id
      and m.user_id = auth.uid()
  );
$$;

-- Admin of any team inside this organization?
create or replace function public.is_org_admin(_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships m
    join public.teams t on t.id = m.team_id
    where t.org_id = _org_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;

-- Can the current user READ the team that owns this dashboard?
create or replace function public.can_read_dashboard(_dashboard_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.dashboards d
    where d.id = _dashboard_id
      and public.is_team_member(d.team_id)
  );
$$;

-- Can the current user WRITE the team that owns this dashboard?
create or replace function public.can_write_dashboard(_dashboard_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.dashboards d
    where d.id = _dashboard_id
      and public.can_write_team(d.team_id)
  );
$$;

-- Only authenticated users ever need these.
grant execute on function public.is_team_member(uuid)               to authenticated;
grant execute on function public.has_team_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_team_admin(uuid)                to authenticated;
grant execute on function public.can_write_team(uuid)               to authenticated;
grant execute on function public.is_org_member(uuid)                to authenticated;
grant execute on function public.is_org_admin(uuid)                 to authenticated;
grant execute on function public.can_read_dashboard(uuid)           to authenticated;
grant execute on function public.can_write_dashboard(uuid)          to authenticated;
