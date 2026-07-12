# Pre-submit checklist

Live URL: **https://multi-tenant-analytics-dashboard.vercel.app**
Repo: **https://github.com/Abhi3975/multi-tenant-analytics-dashboard** (public)
Prompt log: **PROMPTS.md**

Everything below was verified against the live production deployment on
2026-07-13. ✓ = verified now.

---

## 1. Production configuration (env vars + Supabase settings)

### Vercel environment variables (Project → Settings → Environment Variables)
Check: `vercel env ls production`

| Variable | Value / role | Exposure | Status |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://miqaomahoxdtqesgstjc.supabase.co` | public | ✓ set (Production) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT with `role: anon` | public (safe) | ✓ set; decoded role = `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT with `role: service_role` | **secret** | ✓ set, encrypted; **never** `NEXT_PUBLIC` |

`NEXT_PUBLIC_*` are inlined into the client bundle at build time — that's why the
URL + anon key must be set **before** deploying. If you rotate keys, re-deploy.

### Supabase settings (Dashboard → project `miqaomahoxdtqesgstjc`)

| Setting | Required | How to check | Status |
| --- | --- | --- | --- |
| **RLS enabled on every public table** | yes | Dashboard → Database → Tables (shield icon), or the SQL in "How to re-verify" below | ✓ all 13 tables |
| **Realtime** on `widgets`, `dashboards`, `metrics`, `anomaly_alerts` | yes | Dashboard → Database → Replication → `supabase_realtime` | ✓ all 4 present |
| **Auth: Email provider enabled**, confirmations off (seeded users pre-confirmed) | yes | Dashboard → Authentication → Providers → Email | ✓ users log in |
| **Auth redirect URLs** | **not required** | — | n/a — app uses email/password `signInWithPassword` (no OAuth/magic-link redirect) |
| **Connection pooling** | **not required** | — | n/a — the app talks to Supabase over PostgREST (HTTP) + Realtime (WebSocket); it never opens a direct Postgres connection, so pooler config is irrelevant |
| **Seeded users exist** | yes | Dashboard → Authentication → Users | ✓ alice/bob/carol, confirmed |

### How to re-verify RLS + Realtime (one command each)
```bash
# RLS on all public tables (expect every row true)
curl -s -X POST "https://api.supabase.com/v1/projects/miqaomahoxdtqesgstjc/database/query" \
  -H "Authorization: Bearer <YOUR_SUPABASE_PAT>" -H "Content-Type: application/json" -H "User-Agent: curl/8" \
  -d '{"query":"select relname, relrowsecurity from pg_class where relnamespace='\''public'\''::regnamespace and relkind='\''r'\'';"}'

# Realtime publication tables (expect widgets, dashboards, metrics, anomaly_alerts)
#   ...same curl with:
#   {"query":"select tablename from pg_publication_tables where pubname='supabase_realtime';"}
```

---

## 2. Manual reviewer test (incognito, zero prior state)

Open an **incognito / private window** (no cookies, no cache). Repeat per role.

### A. Isolation — Marketing viewer (Carol)
1. Go to the live URL → you're redirected to `/login`.
2. Click **`carol@example.com`** (email fills in; password is prefilled `password123`) → **Sign in**.
3. Expect: **only the Marketing team** is listed. No Finance team anywhere.
4. Open Marketing → a dashboard → charts render. There are **no** drag handles,
   no "Add widget", no metric selectors, no Members/Webhooks/Audit nav (viewer =
   read-only).
5. Open DevTools → Console: expect **no red errors** on load.

### B. Editor (Bob) — build + isolation
1. New incognito window → sign in as **`bob@example.com`**.
2. Expect: **only Finance** (not Marketing).
3. Open **Finance Overview** → you see the ARPU KPI tile + revenue chart with data.
4. As an editor you get **Add widget**, drag handles, resize handles, a metric
   dropdown, and a **Metrics** page — but **no** Members/Webhooks/Audit (those are
   admin-only).
5. Add a line-chart widget → it persists (reload to confirm).

### C. Admin (Alice) — full control
1. New incognito window → sign in as **`alice@example.com`**.
2. Finance team → header shows **Members**, **Webhooks**, **Audit** nav.
3. Open a dashboard: KPI panel + widgets load; the 🔔 bell is present.
4. Members page lists alice/bob with role dropdowns; Audit page shows entries.

### D. Real-time collaboration (two windows)
1. Two windows, both signed in on the **same Finance dashboard** (alice + bob).
2. In one, drag/add a widget → the other reflects it within ~1s; presence avatars
   show both.

### E. Live-updating metrics + anomalies — **action required**
The deployed DB has **seeded (static) data**, so charts won't animate on their own.
To demo live updates + anomaly bell/toasts against production, run the simulator
pointed at the hosted project from your machine:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://miqaomahoxdtqesgstjc.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Settings → API> \
npm run simulate
```
Then watch a dashboard update live; after a minute or two a spike fires the 🔔.
(Realtime transport itself is verified working on hosted — ~1s delivery.)

---

## 3. Code scan — local-only / leakage (all clear ✓)

| Check | Result |
| --- | --- |
| Hardcoded `localhost` / `127.0.0.1` in `src/` | ✓ only in the SSRF **blocklist** (`url-safety.ts`) — intentional |
| Dev-only `NODE_ENV` branches in `src/` | ✓ none |
| Service-role client imported in any `"use client"` file | ✓ none |
| Service-role **key value** in the client bundle (`.next/static`) | ✓ 0 matches (the `service_role` string found is supabase-js's own warning text, not the key) |
| `SUPABASE_SERVICE_ROLE_KEY` name in client bundle | ✓ 0 matches |
| Admin client confined to `server-only` modules | ✓ `admin.ts` (imports `server-only`), used only by `audit.ts` / `webhooks.ts` / `admin-users.ts` |
| Supabase URL/keys hardcoded in `src/` | ✓ none — all read from env |

Note: `scripts/*.ts` contain local dev keys/refs — those are developer tools, not
shipped in the app bundle.

---

## 4. Final tick-list before you send

- [ ] **Repo is public** — ✓ confirmed public
- [ ] **PROMPTS.md** committed and honest — ✓
- [ ] **Live URL loads** and redirects to `/login` in incognito — ✓
- [ ] Ran manual tests A–D above (isolation, roles, collaboration) — **you**
- [ ] (Optional) Ran the hosted simulator (E) to show live updates — **you**
- [ ] **Revoke the Supabase personal access token** used for deploy →
      supabase.com/dashboard/account/tokens — **you** (⚠️ it was pasted in chat)
- [ ] (Optional, thorough) Rotate the `service_role` key in Supabase → Settings →
      API and update the Vercel env var + redeploy (it also appeared in chat)
- [ ] Submission contains: **repo URL + PROMPTS.md + live URL**
- [ ] README `Known limitations` section is accurate (webhooks = server action not
      Edge Function; metrics team-scoped; seed users local-only) — ✓
