# Prompt log — Multi-Tenant Analytics Dashboard

This is an honest reconstruction of how the project was actually built with
Claude Code, in the order it happened. It is deliberately **not** cleaned up to
look like a tidy 8-prompt run — the real session went out of order, some work was
built ahead of the prompt that "planned" it, one planned prompt duplicated work
already done, and a couple of items are only partially complete. Accuracy over
polish.

Legend: ✅ done · 🟡 partial · ❌ not done

---

## The 8 planned prompts (as mapped to the assignment)

### 1. Scaffold the project foundation ✅
**Prompt (as sent):** Set up the project foundation before any features — Next.js
14 (App Router, TS, Tailwind, src/), shadcn/ui neutral theme, `@supabase/supabase-js`
+ `@supabase/ssr`, `.env.local.example`, and a `CLAUDE.md` documenting stack,
hierarchy, roles, and the three build tiers. Stop after scaffolding.

**Implemented:** all of it.

**Deviations / notes:**
- The repo folder name has capital letters, which `create-next-app` rejects, so I
  scaffolded into a temp dir and moved files in.
- The current `shadcn` CLI defaults to a Tailwind‑v4 / Base‑UI preset
  (`base-nova`, `oklch` colors) that is **incompatible** with this Tailwind‑v3 +
  Next 14 project. I discarded that and used the classic Radix + HSL‑CSS‑variable
  shadcn setup instead. Documented in `CLAUDE.md`.

### 2. Supabase schema + RLS ✅
**Prompt (as sent):** Design and implement the DB schema (organizations, teams,
memberships, dashboards, widgets, metrics), enable RLS on every table, write
policies so users only access rows for teams they're a member of, encode role
permissions (viewer read-only; editor/admin write; admin manages memberships),
add `seed.sql` (1 org, Finance + Marketing, 3 users, sample metrics) and a
`supabase/README.md`. Explain how RLS guarantees Finance can't see Marketing.

**Implemented:** all of it — `SECURITY DEFINER` helper functions
(`is_team_member`, `can_write_team`, `is_team_admin`), full policy set, seed with
three real auth users, isolation explanation.

**Deviations / notes:**
- Verified before committing by spinning up a throwaway Postgres 15 container
  with a stubbed `auth` schema and running all migrations + seed, then later
  against the real local Supabase.

### 3. Tier 1 — dashboards + metric visualization ✅
**Prompt (as sent):** Editors/Admins create dashboards scoped to a team; viewers
see them but no edit controls; a dnd-kit grid editor to add/move/resize/remove
widgets with position persisted to `widgets.position`; line/bar/stat widgets
reading `metrics` via Recharts; a `scripts/simulate-metrics.ts` inserting fake
data; verify viewer read-only in UI **and** via RLS.

**Implemented:** all of it (auth/login, team pages, dnd-kit editor, Recharts
widgets, simulator, role gating).

**Deviations / notes:**
- Running it live caught a real bug the types didn't: the `authenticated` role
  had **no table GRANTs**, so PostgREST returned `permission denied` before RLS
  even ran. Fixed with an explicit grants migration
  (`20260712120300_grants.sql`).

### 4. Tier 2 — real-time multi-user collaboration ✅
**Prompt (as sent):** Use Supabase Realtime (Postgres Changes + Presence) on
`widgets` and `dashboards` so edits appear for other viewers within ~1s; presence
avatars in the header; sensible simultaneous-edit handling (last-write-wins, no
flicker); a `TESTING.md` two-browser plan; test with two concurrent clients.

**Implemented:** all of it. Note the base of this (widgets Realtime + Presence)
was actually built earlier during an initial Tier 2 pass; this prompt hardened
it — added `dashboards`-table Realtime + live inline rename, and reworked
reconciliation to de-duplicate a client's own echoes (no flicker) while applying
genuinely different remote values (last-write-wins).

**Deviations / notes:**
- Verified with an automated two-client script (`npm run verify:collab`):
  INSERT/UPDATE/DELETE + rename propagate in ~200–550ms; Presence sees both.
- A Realtime container restart was needed after publishing a new table — the
  server doesn't pick up publication changes live.

### 5. Tier 2 — computed KPIs + anomaly alerts 🟡 (partial)
**Prompt (as sent):** Add a `kpi_definitions` table (team_id, name, formula,
created_by) with a **safe expression evaluator** (restricted grammar, no eval);
let editors define a KPI from the editor and add it as a "KPI widget" that
recalculates live; implement rolling mean/stddev anomaly detection (>2σ) with a
visible badge/toast on the widget; add a bell-icon notification list of recent
anomaly alerts.

**What actually exists today:**
- ✅ A `metric_kpis` **view** (latest / previous / avg / min / max / stddev) +
  a live **KPI panel** showing value, Δ% and average per metric.
- ✅ **Client-side** z-score anomaly detection over the visible window, surfaced
  as red dots on charts + an "anomaly" badge on widgets/KPI cards; the simulator
  injects spikes so it's demoable.

**What is NOT built yet (❌):**
- `kpi_definitions` table + the safe formula evaluator (e.g. `revenue / users`).
- User-defined **KPI widgets** that evaluate a formula and recompute via Realtime.
- A **server-side** rolling-window detector persisting `anomaly_alerts`.
- The **notification bell / toast** list.

This prompt was re-issued near the end of the session; the remaining items above
were scoped and started (tasks created) but **not completed**. So Tier 2's
"KPIs & anomaly alerts" is **partial**.

### 6. Tier 3 — projects, webhooks, audit logs, custom metrics 🟡 (mostly done)
**Prompt (as sent):** Add a `projects` table between teams and dashboards/metrics
(update RLS, nav, seed); a `webhooks` table where admins register a URL notified
on events, delivered via a **Supabase Edge Function** with HMAC signing, retry,
and a delivery log; an `audit_logs` table + admin-only Audit page; custom metric
definitions selectable in the widget/KPI builders.

**What actually exists (✅):**
- **Projects**: `projects` table, `dashboards.project_id`, RLS, team page grouped
  by project, seed updated. (Metrics stayed team-scoped, not project-scoped — see
  below.)
- **Audit logs**: `audit_logs` + admin-only `/audit` page; written server-side
  with the service role (tamper-proof).
- **Custom metric definitions**: `metric_definitions` (+ validation trigger
  replacing the hard-coded CHECK); admin/editor `/metrics` page; custom keys show
  up in widget metric pickers.
- **Webhooks**: `webhooks` + `webhook_deliveries`, admin `/webhooks` page,
  HMAC-SHA256-signed delivery, delivery log, SSRF guard on the URL.

**Deviations / gaps (🟡):**
- Webhook delivery is a **Next.js server action** (`lib/webhooks.ts`), **not a
  Supabase Edge Function**, and there is **no retry/backoff** — a failed delivery
  is logged but not retried. This differs from the prompt.
- **Metrics are team-scoped, not project-scoped.** Memberships stayed team-scoped
  (the RLS unit), and a project's access == its team's access. This preserves
  Tier 1/2 isolation but is a deliberate simplification vs. "metrics belong to a
  project."
- The re-issued "Extend to Tier 3" prompt at the end of the session **duplicated
  work already completed** here; it was not re-run (it would collide with the
  existing schema).

### 7. Final submission pass ❌ / 🟡 (in progress)
**Prompt (as sent):** Isolation test (Marketing viewer can't query Finance data
via the client); loading/error/empty states across the app; a top-level
submission README; Vercel deployment prep (env vars, `vercel.json`, Supabase
settings); a grep for TODOs / console.logs / client-side service-role usage.

**Status:**
- 🟡 Isolation is already asserted by `npm run verify:rls` (includes Carol seeing
  0 Finance rows), but a dedicated standalone "viewer probes Finance" script was
  not separately added.
- ❌ Empty/loading/error states: only partial (some empty-state text exists; no
  systematic loading/error states).
- 🟡 README exists but is not yet a submission-grade top-level doc.
- ❌ Vercel prep (`vercel.json`, deploy settings checklist) not done.
- ❌ Security grep not yet run/documented.

### 8. Prompt-sharing doc ✅ (this file)
**Prompt (as sent):** Reconstruct the whole session honestly — actual prompts,
deviations, a follow-up-fixes section, and an honest final-state section.

---

## Follow-up / ad-hoc instructions (outside the planned prompts)

In the order they happened:

1. **"Push to my GitHub repo and backdate the commits to ~yesterday 2pm."**
   Declined. Backdating the history of a graded take-home to fake a work timeline
   is fabricating evidence for the reviewer. Pushed with **honest timestamps**.
2. **"Commit in chunks (20–40 commits), not one big commit."** Done — work is
   split into many small, atomic commits per feature.
3. **"You have to do backdating, I made the repo yesterday."** Held the line;
   declined again. Only the honesty concern changed the answer, not the repo age.
4. **`npm run dev`.** Started the dev server; found the auth middleware 500'd on
   every request when Supabase env was unset, and fixed it to no-op when
   unconfigured (`fix(supabase): skip session refresh when Supabase env is unset`).
5. **Missing GRANTs** (discovered during Tier 1 live testing) — added
   `20260712120300_grants.sql`.
6. **"Close the loose ends"** — added the **membership-management UI**
   (`/members`, admin), an **SSRF guard** on webhook URLs, and a committed
   **RLS test suite** (`npm run verify:rls`, 23 checks). None of these were in the
   original plan.
7. Two bugs were found in my **own verification scripts** (not the app): the
   `memberships` table has no `id` column, and a Realtime subscribe/insert race
   in the collab test — both fixed.

---

## Final state (honest)

**Tier 1 — ✅ fully working.** Org→Team hierarchy, roles, RLS isolation,
dashboards, dnd-kit editor, Recharts widgets, persistence, simulator.

**Tier 2 — 🟡 partial.**
- Realtime collaboration (widgets + dashboards, presence, reconciliation): ✅.
- KPIs: a computed `metric_kpis` view + live KPI panel ✅; **user-defined KPI
  formulas / `kpi_definitions` / KPI widgets ❌**.
- Anomaly detection: client-side z-score badges/dots ✅; **server-side rolling
  detector, persisted `anomaly_alerts`, and notification bell ❌**.

**Tier 3 — 🟡 mostly working.** Projects ✅, audit logs ✅, custom metric
definitions ✅, webhooks ✅ **but via a server action, not an Edge Function, and
with no retry**. Metrics are team-scoped, not project-scoped.

**Cross-cutting:** RLS isolation verified end-to-end at the DB layer
(`verify:rls`), realtime verified across two clients (`verify:collab`).

**Not done / shortcuts (48-hour scope):**
- Tier 2 KPI-formula + anomaly-alert/notification features (planned, not built).
- Webhooks as an Edge Function + retry (built as a server action instead).
- Systematic loading/error/empty states.
- Vercel deployment config and a security grep pass.
- No membership *invite* flow for non-existent users (add-by-email only resolves
  existing users).
