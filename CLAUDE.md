# CLAUDE.md

Context for AI coding sessions in this repository. Read this first.

## What this is

**Hierarchical Multi-Tenant Analytics Dashboard with Collaboration** — a take-home
assignment. Multiple organizations each manage a hierarchy of teams/projects and
build real-time, collaborative analytics dashboards, with strict data isolation
between tenants enforced at the database level.

## Tech stack

| Concern            | Choice                                                        |
| ------------------ | ------------------------------------------------------------- |
| Framework          | Next.js 14 (App Router, React Server Components), TypeScript   |
| Styling            | Tailwind CSS v3                                                |
| UI components       | shadcn/ui (New York style, **neutral** base, Radix primitives) |
| Backend / DB       | Supabase — Postgres, Auth, Realtime, Row Level Security (RLS)  |
| Drag & drop        | dnd-kit (`@dnd-kit/core`, `/sortable`, `/utilities`)          |
| Charts             | Recharts                                                       |
| Icons              | lucide-react                                                  |

### Project layout

```
src/
  app/                 App Router routes, layout, globals.css
  components/ui/        shadcn/ui components (button, …)
  lib/
    utils.ts           cn() class-name helper
    supabase/
      client.ts        browser client (Client Components)
      server.ts        server client (Server Components / Actions / Route Handlers)
      admin.ts         service-role client — bypasses RLS, server-only
      middleware.ts    updateSession() — refreshes auth on every request
  middleware.ts        wires updateSession() into the request pipeline
```

### Environment

Copy `.env.local.example` → `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (public; RLS enforces access)
- `SUPABASE_SERVICE_ROLE_KEY` — **secret**, server-only, bypasses RLS

### Conventions

- Add shadcn components with the **New York / neutral** config in `components.json`.
  Note: the latest `shadcn` CLI defaults to a Tailwind-v4 / Base-UI preset that is
  **incompatible** with this Tailwind-v3 project — this repo intentionally uses the
  classic Radix + HSL-CSS-variable setup. Add components against that style.
- Never import `lib/supabase/admin.ts` into client code.
- All tenant data access goes through RLS-protected queries by default; the
  service-role client is reserved for trusted server tasks (webhooks, audit logs).

## Data hierarchy

```
Organization  (tenant boundary — the root of isolation)
  └── Team
        └── Project
              └── Member   (a user's membership + role within a scope)
```

- An **Organization** is the tenant. Data must never leak across organizations.
- A **Team** groups projects and members inside one organization.
- A **Project** owns dashboards and metrics (introduced in Tier 3).
- A **Member** is a user associated with a scope (org/team/project) and carries a
  role. A single user may belong to multiple organizations.

## Permission levels

Three roles, granted per scope. Higher roles inherit lower-role abilities.

| Role       | Can do                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| **Admin**  | Full control: manage members & roles, create/delete teams/projects/dashboards, edit all metrics & settings, configure webhooks, view audit logs. |
| **Editor** | Create and edit dashboards, widgets, and metric definitions; edit dashboard data. Cannot manage members/roles or delete top-level scopes. |
| **Viewer** | Read-only: view dashboards, metrics, and charts. No edits, no member management.         |

RLS policies must enforce these roles server-side; the UI reflects them but is not
the security boundary.

## Build tiers

Implement in order. Each tier builds on the previous.

### Tier 1 — Foundation

- Organization → Team hierarchy.
- Roles (Admin / Editor / Viewer) with membership.
- Dashboards containing metrics.
- Persistence in Supabase Postgres.
- **RLS isolation** so tenants cannot see each other's data.

### Tier 2 — Collaboration & intelligence

- Real-time multi-user dashboard editing (Supabase Realtime).
- KPI calculations.
- Anomaly detection on metrics.

### Tier 3 — Advanced

- Three-level hierarchy: add **Project** under Team.
- Webhooks.
- Audit logs.
- Custom metric definitions.

## Status

**Tier 1 complete.** Implemented:

- Auth (email/password via Supabase) with login page and route protection.
- `/org` team list, `/org/[teamId]` dashboard list with role-gated
  "New Dashboard", `/org/[teamId]/dashboards/[dashboardId]` editor.
- dnd-kit grid editor: add / move / resize / remove widgets; widget
  position/size debounced-persisted to `widgets.position`.
- Widget types line_chart / bar_chart / stat via Recharts, reading `metrics`
  by team_id + metric_name, live-polling.
- Role gating in UI (viewers get no edit controls) backed by RLS on all writes.
- `scripts/simulate-metrics.ts` (`npm run simulate`) streams demo metrics.

Verified end-to-end against a live local Supabase: SELECT isolation
(Finance/Marketing disjoint), and write enforcement (viewer 403, editor 201,
cross-team 403) through real Auth + PostgREST + RLS.

**Tier 2 complete.** Implemented:

- Realtime co-editing: grid editor subscribes to `widgets` postgres_changes
  (RLS-scoped) so add/move/resize/remove sync across clients; the widget the
  local user is actively dragging is shielded from remote echoes.
- Presence bar (Supabase Realtime Presence) showing who's on a dashboard, with
  a "can edit" ring for editors/admins.
- KPI calculations: `metric_kpis` view (`security_invoker`, RLS-respecting) with
  latest/previous/avg/min/max/stddev; live `KpiPanel` shows value, Δ% and avg.
- Anomaly detection: z-score util (`src/lib/anomaly.ts`); red anomaly dots on
  line/bar charts, a count badge, and an "anomaly" flag on KPI cards. The
  simulator injects occasional spikes so it's demoable.

Verified live: `metric_kpis` stays RLS-isolated (Carol sees only Marketing), and
a Realtime `widgets` INSERT is delivered to an authorized subscriber over the
filtered channel.

**Tier 3 complete.** Implemented:

- **Projects**: Team → Project → Dashboard. `projects` table; dashboards carry
  `project_id`; team page groups dashboards by project with New Project / New
  Dashboard (writers). Memberships stay team-scoped — a project's access is its
  team's access (documented tradeoff, keeps Tier 1/2 RLS intact).
- **Custom metric definitions**: `metric_definitions` (global built-ins +
  per-team custom); the `metrics.metric_name` CHECK was replaced by a
  definition-backed validation trigger. `/org/[teamId]/metrics` (writers) manages
  them; widget metric pickers read them.
- **Webhooks**: `webhooks` + `webhook_deliveries`; admin-only `/webhooks` page.
  `lib/webhooks.ts dispatchWebhook` (service role) fires HMAC-SHA256-signed POSTs
  on dashboard/widget events and logs every delivery.
- **Audit logs**: `audit_logs` written server-side via `lib/audit.ts recordAudit`
  (service role; no user INSERT policy — tamper-proof). Admin-only `/audit` page.

Verified live via API: RLS on every new table (projects member-scoped; metric
defs global+own with writer-only writes and no global creation; webhooks &
audit admin-only, editor blocked); the metric validation trigger rejects unknown
keys (400); and webhook delivery round-trips with a valid HMAC signature +
delivery log.

All three tiers complete.

**Collaboration hardening (post-Tier 3).** Realtime now also covers the
`dashboards` table (rename syncs live via an inline-editable `DashboardTitle`).
The grid editor's reconciliation was tightened: it records a signature of each
locally-written widget value and ignores its own Realtime echoes (no flicker),
never overwrites the widget under active drag/resize, and applies genuinely
different remote values as last-write-wins (converges). Verified with two
concurrent authenticated clients via `npm run verify:collab` (INSERT/UPDATE/
DELETE + rename propagate in ~200–550ms; Presence sees both). Manual + automated
plan in `TESTING.md`.

**Loose ends closed (post-collaboration).**
- **Membership management UI** — `/org/[teamId]/members` (admin): add by email
  (service-role email→id lookup), change role, remove; self-lockout guards;
  RLS-enforced and audit-logged.
- **SSRF guard** — `lib/url-safety.ts isSafeWebhookUrl` blocks non-http(s) and
  loopback/private/link-local/metadata targets, enforced at webhook creation and
  again at dispatch. `WEBHOOK_ALLOW_LOCAL=true` permits local targets in dev.
- **Committed RLS test suite** — `npm run verify:rls` (`scripts/verify-rls.ts`),
  23 assertions covering isolation, role writes, admin-only surfaces, custom
  metric rules, and the validation trigger.

Note: table GRANTs for `authenticated`/`service_role` live in
`supabase/migrations/20260712120300_grants.sql` — required or PostgREST returns
"permission denied" before RLS runs. Default privileges cover future tables.
