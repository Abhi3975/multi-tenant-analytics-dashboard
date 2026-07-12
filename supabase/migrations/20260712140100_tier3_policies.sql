-- =============================================================================
-- Tier 3 RLS policies
--
-- Reuses the Tier 1 helper functions (is_team_member / can_write_team /
-- is_team_admin), so the same tenant isolation applies to every new table.
-- =============================================================================

-- projects ----------------------------------------------------------------------
create policy "projects_select_members"
  on public.projects for select to authenticated
  using (public.is_team_member(team_id));

create policy "projects_insert_writers"
  on public.projects for insert to authenticated
  with check (public.can_write_team(team_id));

create policy "projects_update_writers"
  on public.projects for update to authenticated
  using (public.can_write_team(team_id))
  with check (public.can_write_team(team_id));

create policy "projects_delete_admin"
  on public.projects for delete to authenticated
  using (public.is_team_admin(team_id));

-- metric_definitions ------------------------------------------------------------
-- Everyone sees the global built-ins plus their own team's custom metrics.
create policy "metric_definitions_select"
  on public.metric_definitions for select to authenticated
  using (team_id is null or public.is_team_member(team_id));

-- Writers manage their team's custom metrics; nobody edits built-ins/globals.
create policy "metric_definitions_insert_writers"
  on public.metric_definitions for insert to authenticated
  with check (
    team_id is not null and is_builtin = false and public.can_write_team(team_id)
  );

create policy "metric_definitions_update_writers"
  on public.metric_definitions for update to authenticated
  using (team_id is not null and is_builtin = false and public.can_write_team(team_id))
  with check (team_id is not null and is_builtin = false and public.can_write_team(team_id));

create policy "metric_definitions_delete_writers"
  on public.metric_definitions for delete to authenticated
  using (team_id is not null and is_builtin = false and public.can_write_team(team_id));

-- webhooks (admin-managed) ------------------------------------------------------
create policy "webhooks_select_admin"
  on public.webhooks for select to authenticated
  using (public.is_team_admin(team_id));

create policy "webhooks_insert_admin"
  on public.webhooks for insert to authenticated
  with check (public.is_team_admin(team_id));

create policy "webhooks_update_admin"
  on public.webhooks for update to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "webhooks_delete_admin"
  on public.webhooks for delete to authenticated
  using (public.is_team_admin(team_id));

-- webhook_deliveries (read-only for admins; only the service role writes) --------
create policy "webhook_deliveries_select_admin"
  on public.webhook_deliveries for select to authenticated
  using (public.is_team_admin(team_id));

-- audit_logs (read-only for admins; only the service role writes) ----------------
create policy "audit_logs_select_admin"
  on public.audit_logs for select to authenticated
  using (public.is_team_admin(team_id));
