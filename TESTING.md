# Testing — real-time collaboration

Two ways to verify: an automated two-client script, and a manual two-browser
walkthrough.

## Prerequisites

```bash
supabase start            # local stack (applies migrations + seed)
# copy keys from `supabase status` into .env.local
npm install
npm run dev               # http://localhost:3000
npm run simulate          # (optional) live metric data in a second terminal
```

Seeded users (password **`password123`**):

| User                | Team      | Role   |
| ------------------- | --------- | ------ |
| `alice@example.com` | Finance   | admin  |
| `bob@example.com`   | Finance   | editor |
| `carol@example.com` | Marketing | viewer |

## Automated check (two concurrent connections)

```bash
npm run verify:collab
```

Signs in as Alice and Bob (two authenticated Supabase clients) and asserts, over
Realtime + RLS, that widget INSERT/UPDATE/DELETE and a dashboard rename propagate
between them, and that Presence reports both users. Prints PASS/FAIL with
latencies and exits non-zero on failure. Example:

```
PASS  widget INSERT propagates alice->bob  (186ms)
PASS  widget UPDATE propagates bob->alice  (528ms)
PASS  dashboard rename propagates alice->bob  (531ms)
PASS  presence shows both users  (2 present)
PASS  widget DELETE propagates alice->bob  (488ms)
```

## Manual check (two browser windows)

Use two windows/profiles (or one normal + one incognito) so each has its own
session.

1. **Sign in as two users on the same dashboard.**
   - Window A: sign in as `alice@example.com` → Finance → project **General** →
     open **Finance Overview**.
   - Window B: sign in as `bob@example.com` → open the same **Finance Overview**.

2. **Presence.** Both headers show two avatars (`AL`, `BO`) with a green "can
   edit" ring. Close Window B → A's count drops to 1 within a second or two.
   Reopen it → it comes back.

3. **Add a widget (A → B).** In A, use *Add widget* → **Add**. Within ~1s the new
   widget appears in B — no refresh.

4. **Move a widget (A → B).** In A, drag a widget by its grip handle to a new
   spot. B reflects the new position within ~1s.

5. **Resize a widget (B → A).** In B, drag a widget's bottom-right handle. A
   reflects the new size within ~1s.

6. **Remove a widget (A → B).** In A, click a widget's ✕. It disappears in B.

7. **Rename the dashboard (A → B).** In A, click the title, type a new name,
   press Enter. B's title updates within ~1s.

8. **Simultaneous edit (last-write-wins, no flicker).** Drag the *same* widget in
   both windows at nearly the same time. Expected: it settles to whichever drop
   landed last; the widget you are actively holding is never yanked mid-drag, and
   neither window flickers back and forth. (Your own saved move never reverts —
   own Realtime echoes are de-duplicated; only a genuinely different remote value
   is applied.)

9. **Viewer is passive but live.** Sign in as `carol@example.com` in a third
   window (Marketing). She cannot see Finance dashboards at all (RLS). On a
   Marketing dashboard she sees edits from Marketing editors live, but has no
   edit controls herself.

## What enforces this

- Realtime **Postgres Changes** on `widgets` and `dashboards` (both in the
  `supabase_realtime` publication, `replica identity full`), filtered per
  dashboard and RLS-scoped so only team members receive events.
- Realtime **Presence** on a per-dashboard channel.
- Client reconciliation in `grid-editor.tsx`: the widget under active
  drag/resize is never overwritten by remote events, and the client ignores the
  echo of its own writes (signature match) while applying genuinely different
  remote values — last-write-wins that converges without flicker.
