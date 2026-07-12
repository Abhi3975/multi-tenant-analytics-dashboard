# Deploying to Vercel + hosted Supabase

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Exposure | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Hosted project URL, e.g. `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key; access is enforced by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Server-only. Bypasses RLS. Never mark as `NEXT_PUBLIC`. |
| `WEBHOOK_ALLOW_LOCAL` | Optional | Leave unset in prod (blocks SSRF to private hosts). |

`SUPABASE_SERVICE_ROLE_KEY` is used only in `server-only` modules
(`lib/supabase/admin.ts`, `audit.ts`, `webhooks.ts`, `admin-users.ts`) — verified
by `npm run` build and a grep for client-side usage (none).

## `vercel.json`

**Not required.** This is a standard Next.js App Router app; Vercel auto-detects
the framework, build command (`next build`), and output. No `vercel.json` is
included on purpose.

## Supabase project settings to configure

1. **Apply the schema** (migrations):
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push        # runs everything in supabase/migrations
   ```
2. **RLS**: every table already ships with `enable row level security` + policies
   in the migrations. After `db push`, confirm in Dashboard → Authentication →
   Policies that RLS is **on** for `organizations, teams, memberships, projects,
   dashboards, widgets, metrics, metric_definitions, kpi_definitions,
   anomaly_alerts, webhooks, webhook_deliveries, audit_logs`.
3. **Realtime**: the migrations add `widgets`, `dashboards`, `metrics`, and
   `anomaly_alerts` to the `supabase_realtime` publication. Confirm in
   Dashboard → Database → Replication that these are enabled.
4. **Auth redirect URLs**: Dashboard → Authentication → URL Configuration →
   set **Site URL** to your Vercel URL (e.g. `https://your-app.vercel.app`) and
   add it under **Redirect URLs**.
5. **Seed users**: `supabase/seed.sql` inserts the three demo users directly into
   `auth.users` — that works for the **local** stack but not via `db push`. For a
   hosted demo, create `alice@example.com`, `bob@example.com`,
   `carol@example.com` (password `password123`) via Dashboard → Authentication →
   Add user, then run the non-auth parts of `seed.sql` (org, teams, memberships,
   projects, metric defs, dashboard/widgets) against the hosted DB, substituting
   the real user UUIDs. (This is a known local/hosted seam — see README
   limitations.)

## Deploy

```bash
# option A: dashboard — import the GitHub repo, add env vars, deploy
# option B: CLI
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

After deploy, set the Auth Site URL/redirects (step 4) to the production URL.
