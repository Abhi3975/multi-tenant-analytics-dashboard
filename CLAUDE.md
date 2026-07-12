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

Project foundation scaffolded (Next.js + Tailwind + shadcn/ui + Supabase helpers).
No features implemented yet — start with Tier 1.
