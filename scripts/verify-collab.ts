/**
 * verify-collab.ts
 *
 * Automated check of real-time collaboration using TWO concurrent, authenticated
 * Supabase connections (Alice = Finance admin, Bob = Finance editor). It proves,
 * end-to-end through Realtime + RLS:
 *   - widget INSERT / UPDATE / DELETE propagate between the two clients (~<1s)
 *   - a dashboard rename propagates
 *   - Presence reports both users on the dashboard
 *
 * Run (with the local stack up and .env.local populated):
 *   npm run verify:collab
 *
 * Exits non-zero if any check fails. Cleans up the widget it creates.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DASH = "d0000000-0000-0000-0000-000000000001"; // Finance seed dashboard

if (!url || !anon) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const results: string[] = [];
let failures = 0;
function record(name: string, ok: boolean, extra = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failures++;
}

/** One-shot latch: captures a value even if fired before awaited; its timeout
 *  only starts when wait() is called. */
function latch<T>() {
  let value: T | undefined;
  let done = false;
  let cb: ((v: T) => void) | null = null;
  return {
    fire(v: T) {
      if (done) return;
      value = v;
      done = true;
      cb?.(v);
    },
    wait(ms: number): Promise<T> {
      return new Promise<T>((res, rej) => {
        if (done) return res(value as T);
        cb = res;
        setTimeout(() => (done ? undefined : rej(new Error("timeout"))), ms);
      });
    },
  };
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "password123" });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  const { data } = await c.auth.getSession();
  await c.realtime.setAuth(data.session!.access_token);
  return c;
}

async function main() {
  const alice = await signedInClient("alice@example.com"); // Finance admin
  const bob = await signedInClient("bob@example.com"); // Finance editor

  const insertW = latch<{ id: string; t: number }>();
  const deleteW = latch<{ t: number }>();
  const renameD = latch<{ name: string; t: number }>();
  const aliceUpdate = latch<{ t: number }>();

  await new Promise<void>((resolve) => {
    bob
      .channel(`widgets:${DASH}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "widgets", filter: `dashboard_id=eq.${DASH}` },
        (p) => {
          if (p.eventType === "INSERT") insertW.fire({ id: (p.new as { id: string }).id, t: Date.now() });
          if (p.eventType === "DELETE") deleteW.fire({ t: Date.now() });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dashboards", filter: `id=eq.${DASH}` },
        (p) => renameD.fire({ name: (p.new as { name: string }).name, t: Date.now() })
      )
      .subscribe((s) => s === "SUBSCRIBED" && resolve());
  });

  await new Promise<void>((resolve) => {
    alice
      .channel(`widgets-a:${DASH}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "widgets", filter: `dashboard_id=eq.${DASH}` },
        () => aliceUpdate.fire({ t: Date.now() })
      )
      .subscribe((s) => s === "SUBSCRIBED" && resolve());
  });

  // Give the server a moment to fully register the postgres_changes
  // subscriptions — SUBSCRIBED can fire just before the first event would be
  // captured, which would drop an INSERT sent in the same instant.
  await new Promise((r) => setTimeout(r, 800));

  // 1. Alice adds a widget -> Bob receives it
  const t1 = Date.now();
  const { data: ins, error: insErr } = await alice
    .from("widgets")
    .insert({ dashboard_id: DASH, type: "stat", config: { metric: "revenue" }, position: { x: 0, y: 9, w: 3, h: 2 } })
    .select("id")
    .single();
  let insertedId = "";
  if (insErr) record("alice(admin) inserts widget", false, insErr.message);
  else {
    insertedId = ins.id;
    try {
      const r = await insertW.wait(5000);
      record("widget INSERT propagates alice->bob", r.id === insertedId, `${r.t - t1}ms`);
    } catch {
      record("widget INSERT propagates alice->bob", false, "timeout");
    }
  }

  // 2. Bob moves the widget -> Alice receives it
  if (insertedId) {
    const t2 = Date.now();
    await bob.from("widgets").update({ position: { x: 4, y: 9, w: 3, h: 2 } }).eq("id", insertedId);
    try {
      const r = await aliceUpdate.wait(5000);
      record("widget UPDATE propagates bob->alice", true, `${r.t - t2}ms`);
    } catch {
      record("widget UPDATE propagates bob->alice", false, "timeout");
    }
  }

  // 3. Alice renames the dashboard -> Bob receives it
  const t3 = Date.now();
  await alice.from("dashboards").update({ name: "Finance Overview (live)" }).eq("id", DASH);
  try {
    const r = await renameD.wait(5000);
    record("dashboard rename propagates alice->bob", r.name === "Finance Overview (live)", `${r.t - t3}ms`);
  } catch {
    record("dashboard rename propagates alice->bob", false, "timeout");
  }
  await alice.from("dashboards").update({ name: "Finance Overview" }).eq("id", DASH); // restore

  // 4. Presence: both join, Alice's channel should see 2 participants
  const presence = latch<number>();
  const chA = alice.channel(`presence:dashboard:${DASH}`, { config: { presence: { key: "alice@example.com" } } });
  const chB = bob.channel(`presence:dashboard:${DASH}`, { config: { presence: { key: "bob@example.com" } } });
  chA.on("presence", { event: "sync" }, () => {
    const n = Object.keys(chA.presenceState()).length;
    if (n >= 2) presence.fire(n);
  });
  await new Promise<void>((r) => chA.subscribe(async (s) => { if (s === "SUBSCRIBED") { await chA.track({ email: "alice@example.com" }); r(); } }));
  await new Promise<void>((r) => chB.subscribe(async (s) => { if (s === "SUBSCRIBED") { await chB.track({ email: "bob@example.com" }); r(); } }));
  try {
    const n = await presence.wait(5000);
    record("presence shows both users", n >= 2, `${n} present`);
  } catch {
    record("presence shows both users", false, "timeout");
  }

  // 5. Alice removes the widget -> Bob receives DELETE
  if (insertedId) {
    const t5 = Date.now();
    await alice.from("widgets").delete().eq("id", insertedId);
    try {
      const r = await deleteW.wait(5000);
      record("widget DELETE propagates alice->bob", true, `${r.t - t5}ms`);
    } catch {
      record("widget DELETE propagates alice->bob", false, "timeout");
      await alice.from("widgets").delete().eq("id", insertedId); // best-effort cleanup
    }
  }

  console.log("\n" + results.join("\n") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
