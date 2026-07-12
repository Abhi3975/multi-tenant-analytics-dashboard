-- =============================================================================
-- Table privileges for the API roles.
--
-- RLS decides which ROWS a user may touch, but Postgres still needs table-level
-- GRANTs first — without them PostgREST returns "permission denied for table"
-- (SQLSTATE 42501) before any policy is evaluated. Hosted Supabase wires these
-- up via default privileges; we make them explicit so the local stack and any
-- fresh database behave identically.
--
-- `authenticated` gets full DML (RLS narrows it to their own teams).
-- `anon` gets only schema usage (no policies target it => no data access).
-- `service_role` bypasses RLS and is used by trusted backend jobs.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant all on all tables in schema public to service_role;

-- Make the same grants apply to any tables added by future migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
