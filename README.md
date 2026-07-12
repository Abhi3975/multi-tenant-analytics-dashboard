# Multi-Tenant Analytics Dashboard

Hierarchical, multi-tenant analytics dashboards with role-based collaboration.
Built with Next.js 14 (App Router), TypeScript, Tailwind + shadcn/ui, Supabase
(Postgres + Auth + RLS), dnd-kit, and Recharts.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture: data hierarchy
(Organization → Team → Project → Member), the three roles (Admin/Editor/Viewer),
and the build tiers.

## Getting started

### 1. Start the database (Supabase)

Requires Docker + the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
supabase start          # applies migrations in supabase/migrations + seed.sql
supabase status         # prints your local URL + keys
```

Details and reset instructions: [`supabase/README.md`](./supabase/README.md).

### 2. Configure env

Copy the values from `supabase status` into `.env.local`:

```bash
cp .env.local.example .env.local
# then set:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
#   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

### 3. Run the app

```bash
npm install
npm run dev             # http://localhost:3000
```

### 4. Stream live demo data (optional but recommended)

In a second terminal, insert plausible metrics every few seconds for every team:

```bash
npm run simulate        # reads .env.local, Ctrl+C to stop
```

Dashboards poll the `metrics` table, so charts animate while this runs.

## Tier 1 demo walkthrough

Three seeded users (password: **`password123`**) demonstrate tenant isolation and
role-based permissions. Sign in at `/login` (the login screen lists them):

| User                | Team      | Role   | What you can do                                     |
| ------------------- | --------- | ------ | --------------------------------------------------- |
| `alice@example.com` | Finance   | admin  | See Finance only; create/edit dashboards + widgets  |
| `bob@example.com`   | Finance   | editor | See Finance only; create/edit dashboards + widgets  |
| `carol@example.com` | Marketing | viewer | See Marketing only; **view only**, no edit controls |

Try it:

1. **Isolation** — Sign in as `alice`: you only see the **Finance** team and its
   data. Sign in as `carol`: you only see **Marketing**. Neither can see the
   other's data — enforced by Postgres RLS, not just the UI.
2. **Editor builds a dashboard** — As `alice`/`bob`, open the Finance team →
   **New Dashboard** → add line/bar/stat widgets, drag to move, drag the
   bottom-right handle to resize. Layout persists (position saved to
   `widgets.position`); reload to confirm.
3. **Viewer is read-only** — As `carol`, open a Marketing dashboard: charts
   render fully, but there are **no** drag handles, add/remove, or config
   controls. Even a hand-crafted write is rejected by RLS.

## How permissions are enforced

Every table has Row Level Security enabled. A user can only read/write rows for
teams they have a `memberships` row in; viewers get read-only, editors/admins can
write, and only admins manage memberships. The app UI hides controls by role, but
the **database is the security boundary** — see `supabase/migrations` and the
explanation in the task notes / `CLAUDE.md`.

## Scripts

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Next.js dev server                                 |
| `npm run build`    | Production build                                   |
| `npm run simulate` | Insert live demo metrics for every team            |
| `npm run lint`     | ESLint                                             |
