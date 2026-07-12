# Multi-Tenant Analytics Dashboard

**🔗 Live demo: https://multi-tenant-analytics-dashboard.vercel.app**
Log in with a seeded user below (e.g. `alice@example.com` / `password123`).

A hierarchical, multi-tenant analytics platform with real-time collaboration.
Organizations contain teams; teams contain projects; projects contain dashboards
built from live metrics. Access is isolated per tenant and enforced at the
database level with Postgres Row Level Security.

**Stack:** Next.js 14 (App Router, TypeScript) · Tailwind + shadcn/ui · Supabase
(Postgres, Auth, Realtime, RLS) · dnd-kit · Recharts.

- Architecture & conventions: [`CLAUDE.md`](./CLAUDE.md)
- How it was built (honest prompt log): [`PROMPTS.md`](./PROMPTS.md)
- Manual + automated test plan: [`TESTING.md`](./TESTING.md)
- Deploying to Vercel + hosted Supabase: [`DEPLOY.md`](./DEPLOY.md)

---

## Demo users

Three seeded users (password **`password123`**) demonstrate isolation and roles:

| Email | Team | Role | Can… |
| --- | --- | --- | --- |
| `alice@example.com` | Finance | **admin** | everything: manage members, webhooks, audit, build dashboards |
| `bob@example.com` | Finance | **editor** | build/edit dashboards, widgets, KPIs, metrics |
| `carol@example.com` | Marketing | **viewer** | read Marketing only; no edit controls |

Alice/Bob see **only Finance**; Carol sees **only Marketing** — enforced by RLS.

## Quick start (local)

Requires Docker + the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
supabase start                 # applies migrations + seed
# copy the printed keys into .env.local (see .env.local.example)
npm install
npm run dev                    # http://localhost:3000
npm run simulate               # (2nd terminal) live metric data + anomalies
```

Sign in at `/login` (the demo users are listed there).

## Tier breakdown

Legend: ✅ done · 🟡 partial / deviation · ❌ not done

### Tier 1 — Foundation ✅
- ✅ Organization → Team hierarchy, three roles (admin/editor/viewer)
- ✅ Dashboards with line/bar/stat widgets (Recharts), dnd-kit add/move/resize/remove
- ✅ Persistence (`widgets.position` jsonb), metric simulator
- ✅ **RLS tenant isolation** on every table

### Tier 2 — Collaboration & intelligence ✅
- ✅ Real-time multi-user editing (Realtime Postgres Changes on `widgets` +
  `dashboards`) with presence and flicker-free reconciliation (last-write-wins)
- ✅ **Computed KPIs**: `kpi_definitions` + a **safe formula evaluator**
  (restricted grammar, no `eval`), KPI widgets that recompute live via metrics
  Realtime (e.g. ARPU = `revenue / users`)
- ✅ **Anomaly detection**: a server-side rolling-window z-score detector
  (Postgres trigger) writing `anomaly_alerts`, surfaced as widget badges and a
  **notification bell** with live toasts

### Tier 3 — Advanced 🟡 (mostly done)
- ✅ Three-level hierarchy: **Projects** between teams and dashboards
- ✅ **Audit logs** (`audit_logs`, admin-only page, tamper-proof/service-written)
- ✅ **Custom metric definitions** (admin/editor), selectable in widget/KPI builders
- ✅ **Webhooks**: admin registration, HMAC-SHA256 signing, **retry with backoff**,
  delivery log, SSRF guard
- 🟡 **Deviation:** webhook delivery is a Next.js **server action**, not a Supabase
  **Edge Function** triggered on DB events
- 🟡 **Deviation:** metrics are **team-scoped**, not project-scoped (memberships
  stay team-scoped as the RLS unit; a project's access == its team's access)

## Verification

Committed suites that run against the live local stack (no mocks):

| Command | Checks |
| --- | --- |
| `npm run verify:isolation` | Marketing viewer directly querying Finance returns **0 rows** + write denied |
| `npm run verify:rls` | 23 RLS assertions (isolation, role writes, admin-only surfaces, custom metrics) |
| `npm run verify:collab` | 2 clients: widget add/move/remove + rename propagate <1s, presence |
| `npm run verify:kpi` | ARPU KPI evaluates live; anomaly trigger fires + alert delivered <1s |

## Known limitations / shortcuts (48-hour scope)

- **Webhooks are a server action, not an Edge Function**, and there's no invite
  email for non-existent users (add-member resolves existing users only).
- **Metrics are team-scoped**, not project-scoped.
- **Seed users are local-only** — `seed.sql` inserts into `auth.users` directly,
  which works for `supabase start` but not `db push`; hosted deploys must create
  the users via the Auth API (see `DEPLOY.md`).
- Anomaly detection is a **fixed rolling window (last 20 readings, >2σ)** — simple
  and explainable, not seasonal/trend-aware.
- No automated component/E2E UI tests; verification is at the data/realtime layer
  via the scripts above plus a manual browser pass (`TESTING.md`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` / `build` / `lint` | standard Next.js |
| `npm run simulate` | stream live demo metrics (with occasional spikes) |
| `npm run verify:isolation` / `:rls` / `:collab` / `:kpi` | verification suites |
