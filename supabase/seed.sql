-- =============================================================================
-- Seed data (runs on `supabase db reset` / after `supabase start`).
--
-- Mirrors the assignment example:
--   Org  "Acme Analytics"
--     Team "Finance"    -> alice = admin,  bob = editor
--     Team "Marketing"  -> carol = viewer
--
-- All three users share the password:  password123
-- Emails: alice@example.com / bob@example.com / carol@example.com
--
-- This script runs as a superuser, so it BYPASSES RLS on purpose to lay down
-- the initial tenant. In the running app, the same rows would be created
-- through RLS-guarded flows.
-- =============================================================================

-- pgcrypto (crypt/gen_salt) lives in the `extensions` schema on Supabase.
create extension if not exists pgcrypto with schema extensions;

-- Fixed UUIDs so the data is deterministic and easy to reference in tests.
-- users
--   alice c0000000-0000-0000-0000-0000000000a1  (Finance admin)
--   bob   c0000000-0000-0000-0000-0000000000b2  (Finance editor)
--   carol c0000000-0000-0000-0000-0000000000c3  (Marketing viewer)

-- --- Auth users -----------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'alice@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Alice (Finance Admin)"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000b2',
   'authenticated', 'authenticated', 'bob@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Bob (Finance Editor)"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000c3',
   'authenticated', 'authenticated', 'carol@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Carol (Marketing Viewer)"}',
   '', '', '', '');

-- Matching identities (required for email/password sign-in).
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  (gen_random_uuid(), 'c0000000-0000-0000-0000-0000000000a1',
   'c0000000-0000-0000-0000-0000000000a1',
   '{"sub":"c0000000-0000-0000-0000-0000000000a1","email":"alice@example.com"}',
   'email', now(), now(), now()),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-0000000000b2',
   'c0000000-0000-0000-0000-0000000000b2',
   '{"sub":"c0000000-0000-0000-0000-0000000000b2","email":"bob@example.com"}',
   'email', now(), now(), now()),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-0000000000c3',
   'c0000000-0000-0000-0000-0000000000c3',
   '{"sub":"c0000000-0000-0000-0000-0000000000c3","email":"carol@example.com"}',
   'email', now(), now(), now());

-- --- Organization + teams -------------------------------------------------------
insert into public.organizations (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Acme Analytics');

insert into public.teams (id, org_id, name) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Finance'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Marketing');

-- --- Memberships (the assignment's example) ------------------------------------
insert into public.memberships (user_id, team_id, role) values
  ('c0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', 'admin'),   -- alice: Finance admin
  ('c0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-000000000001', 'editor'),  -- bob:   Finance editor
  ('c0000000-0000-0000-0000-0000000000c3', 'b0000000-0000-0000-0000-000000000002', 'viewer');  -- carol: Marketing viewer

-- --- Projects (Tier 3: Team -> Project -> Dashboard) ---------------------------
insert into public.projects (id, team_id, name) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'General'),  -- Finance
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Growth'),   -- Finance
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'General');  -- Marketing

-- --- Custom metric definition (Tier 3) -----------------------------------------
insert into public.metric_definitions (team_id, key, label, unit, is_builtin) values
  ('b0000000-0000-0000-0000-000000000001', 'signups', 'Signups', null, false);  -- Finance custom

-- --- Sample dashboard + widget for Finance -------------------------------------
insert into public.dashboards (id, team_id, project_id, name, layout, created_by) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001',
   'Finance Overview', '{"columns":12}'::jsonb, 'c0000000-0000-0000-0000-0000000000a1');

insert into public.widgets (dashboard_id, type, config, position) values
  ('d0000000-0000-0000-0000-000000000001', 'line_chart',
   '{"metric":"revenue","title":"Revenue (7d)"}'::jsonb,
   '{"x":0,"y":0,"w":6,"h":4}'::jsonb);

-- --- Sample metrics (a few rows per team, across all four metric types) ---------
insert into public.metrics (team_id, metric_name, value, recorded_at) values
  -- Finance
  ('b0000000-0000-0000-0000-000000000001', 'revenue',    12000, now() - interval '2 days'),
  ('b0000000-0000-0000-0000-000000000001', 'revenue',    13500, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000001', 'errors',        12, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000001', 'page_views',  4300, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000001', 'clicks',        890, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000001', 'signups',        42, now() - interval '2 days'),
  ('b0000000-0000-0000-0000-000000000001', 'signups',        57, now() - interval '1 day'),
  -- Marketing
  ('b0000000-0000-0000-0000-000000000002', 'revenue',     8000, now() - interval '2 days'),
  ('b0000000-0000-0000-0000-000000000002', 'revenue',     9200, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000002', 'errors',         5, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000002', 'page_views', 15200, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000002', 'clicks',       2100, now() - interval '1 day'),
  -- users (built-in; enables the ARPU = revenue / users KPI)
  ('b0000000-0000-0000-0000-000000000001', 'users',        2400, now() - interval '2 days'),
  ('b0000000-0000-0000-0000-000000000001', 'users',        2550, now() - interval '1 day'),
  ('b0000000-0000-0000-0000-000000000002', 'users',        9100, now() - interval '2 days'),
  ('b0000000-0000-0000-0000-000000000002', 'users',        9600, now() - interval '1 day');

-- --- KPI definition + KPI widget (Tier 2) --------------------------------------
insert into public.kpi_definitions (id, team_id, name, formula, created_by) values
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'ARPU', 'revenue / users', 'c0000000-0000-0000-0000-0000000000a1');

insert into public.widgets (dashboard_id, type, config, position) values
  ('d0000000-0000-0000-0000-000000000001', 'kpi',
   '{"kpiDefinitionId":"f0000000-0000-0000-0000-000000000001","title":"ARPU"}'::jsonb,
   '{"x":6,"y":0,"w":3,"h":2}'::jsonb);
