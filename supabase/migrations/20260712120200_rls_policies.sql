-- =============================================================================
-- RLS policies
--
-- Model:
--   * SELECT  -> any member of the owning team (viewers included)
--   * WRITE   -> admins + editors of the owning team (viewers excluded)
--   * memberships writes -> team admins only
--
-- Because every USING/WITH CHECK clause resolves to auth.uid()'s own
-- memberships (via the helper functions), a user simply has no row-visibility
-- into teams they don't belong to. There is no "org-wide" read path.
--
-- All policies target the `authenticated` role. The `anon` role has no policies
-- and therefore no access.
-- =============================================================================

-- organizations -----------------------------------------------------------------
-- You can see an org if you belong to at least one of its teams.
create policy "organizations_select_members"
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

-- Any authenticated user may create an org (they bootstrap their own tenant).
create policy "organizations_insert_authenticated"
  on public.organizations for insert to authenticated
  with check (true);

create policy "organizations_update_admin"
  on public.organizations for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy "organizations_delete_admin"
  on public.organizations for delete to authenticated
  using (public.is_org_admin(id));

-- teams -------------------------------------------------------------------------
create policy "teams_select_members"
  on public.teams for select to authenticated
  using (public.is_team_member(id));

-- Only an existing org admin can add teams to that org.
create policy "teams_insert_org_admin"
  on public.teams for insert to authenticated
  with check (public.is_org_admin(org_id));

create policy "teams_update_admin"
  on public.teams for update to authenticated
  using (public.is_team_admin(id) or public.is_org_admin(org_id))
  with check (public.is_team_admin(id) or public.is_org_admin(org_id));

create policy "teams_delete_admin"
  on public.teams for delete to authenticated
  using (public.is_team_admin(id) or public.is_org_admin(org_id));

-- memberships -------------------------------------------------------------------
-- Members of a team can see the roster of that team.
create policy "memberships_select_team_members"
  on public.memberships for select to authenticated
  using (public.is_team_member(team_id));

-- Only team admins invite / change roles / remove members.
create policy "memberships_insert_admin"
  on public.memberships for insert to authenticated
  with check (public.is_team_admin(team_id));

create policy "memberships_update_admin"
  on public.memberships for update to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "memberships_delete_admin"
  on public.memberships for delete to authenticated
  using (public.is_team_admin(team_id));

-- dashboards --------------------------------------------------------------------
create policy "dashboards_select_members"
  on public.dashboards for select to authenticated
  using (public.is_team_member(team_id));

-- Writers (admin/editor) only; the creator must be the current user.
create policy "dashboards_insert_writers"
  on public.dashboards for insert to authenticated
  with check (public.can_write_team(team_id) and created_by = auth.uid());

create policy "dashboards_update_writers"
  on public.dashboards for update to authenticated
  using (public.can_write_team(team_id))
  with check (public.can_write_team(team_id));

create policy "dashboards_delete_writers"
  on public.dashboards for delete to authenticated
  using (public.can_write_team(team_id));

-- widgets -----------------------------------------------------------------------
-- Access is inherited from the widget's dashboard -> team.
create policy "widgets_select_members"
  on public.widgets for select to authenticated
  using (public.can_read_dashboard(dashboard_id));

create policy "widgets_insert_writers"
  on public.widgets for insert to authenticated
  with check (public.can_write_dashboard(dashboard_id));

create policy "widgets_update_writers"
  on public.widgets for update to authenticated
  using (public.can_write_dashboard(dashboard_id))
  with check (public.can_write_dashboard(dashboard_id));

create policy "widgets_delete_writers"
  on public.widgets for delete to authenticated
  using (public.can_write_dashboard(dashboard_id));

-- metrics -----------------------------------------------------------------------
create policy "metrics_select_members"
  on public.metrics for select to authenticated
  using (public.is_team_member(team_id));

create policy "metrics_insert_writers"
  on public.metrics for insert to authenticated
  with check (public.can_write_team(team_id));

create policy "metrics_update_writers"
  on public.metrics for update to authenticated
  using (public.can_write_team(team_id))
  with check (public.can_write_team(team_id));

create policy "metrics_delete_writers"
  on public.metrics for delete to authenticated
  using (public.can_write_team(team_id));
