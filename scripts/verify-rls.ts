/**
 * verify-rls.ts
 *
 * Committed, repeatable check of the Row Level Security guarantees, using real
 * authenticated Supabase clients for the three seeded users (Alice = Finance
 * admin, Bob = Finance editor, Carol = Marketing viewer). Asserts tenant
 * isolation, role-based writes, admin-only surfaces, custom-metric rules, and
 * the metric-name validation trigger.
 *
 * Run (local stack up, .env.local populated):
 *   npm run verify:rls
 *
 * Exits non-zero if any assertion fails. Cleans up rows it creates.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FIN = "b0000000-0000-0000-0000-000000000001";
const MKT = "b0000000-0000-0000-0000-000000000002";
const CAROL_ID = "c0000000-0000-0000-0000-0000000000c3";

let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failures++;
}

async function authed(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "password123" });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

async function count(c: SupabaseClient, table: string, col: string, val: string): Promise<number> {
  const { data } = await c.from(table).select("id").eq(col, val);
  return data?.length ?? 0;
}

/** Returns true if the insert was allowed. Cleans up when it succeeds. */
async function canInsert(
  c: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  admin: SupabaseClient
): Promise<boolean> {
  const { data, error } = await c.from(table).insert(row).select("id").single();
  if (error) return false;
  if (data?.id) await admin.from(table).delete().eq("id", data.id);
  return true;
}

async function main() {
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const alice = await authed("alice@example.com");
  const bob = await authed("bob@example.com");
  const carol = await authed("carol@example.com");

  // --- Tenant isolation (SELECT) ---
  check("alice sees Finance metrics", (await count(alice, "metrics", "team_id", FIN)) > 0);
  check("alice sees 0 Marketing metrics", (await count(alice, "metrics", "team_id", MKT)) === 0);
  check("carol sees Marketing metrics", (await count(carol, "metrics", "team_id", MKT)) > 0);
  check("carol sees 0 Finance metrics", (await count(carol, "metrics", "team_id", FIN)) === 0);
  check("carol sees 0 Finance projects", (await count(carol, "projects", "team_id", FIN)) === 0);

  // --- Role-based writes ---
  check(
    "viewer cannot insert metric",
    !(await canInsert(carol, "metrics", { team_id: MKT, metric_name: "clicks", value: 1 }, admin))
  );
  check(
    "editor can insert metric (own team)",
    await canInsert(bob, "metrics", { team_id: FIN, metric_name: "clicks", value: 1 }, admin)
  );
  check(
    "editor cannot write cross-team",
    !(await canInsert(bob, "metrics", { team_id: MKT, metric_name: "clicks", value: 1 }, admin))
  );
  check(
    "viewer cannot insert dashboard",
    !(await canInsert(carol, "dashboards", { team_id: MKT, name: "x", created_by: CAROL_ID }, admin))
  );

  // --- Membership management is admin-only ---
  // (memberships has no `id` column — PK is (user_id, team_id) — so check inline.)
  const cleanupMembership = () =>
    admin.from("memberships").delete().eq("user_id", CAROL_ID).eq("team_id", FIN);
  await cleanupMembership(); // ensure a clean slate

  const editorAdd = await bob
    .from("memberships")
    .insert({ user_id: CAROL_ID, team_id: FIN, role: "viewer" });
  check("editor cannot add membership", !!editorAdd.error);
  await cleanupMembership();

  const adminAdd = await alice
    .from("memberships")
    .insert({ user_id: CAROL_ID, team_id: FIN, role: "viewer" });
  check("admin can add membership (own team)", !adminAdd.error);
  await cleanupMembership();

  // --- Custom metric definitions ---
  check("alice sees 6 metric defs (5 builtin + signups)", (await (await alice.from("metric_definitions").select("id")).data?.length) === 6);
  check("carol sees 5 metric defs (builtins)", (await (await carol.from("metric_definitions").select("id")).data?.length) === 5);
  check(
    "editor can define custom metric",
    await canInsert(bob, "metric_definitions", { team_id: FIN, key: "trials_test", label: "T" }, admin)
  );
  check(
    "viewer cannot define metric",
    !(await canInsert(carol, "metric_definitions", { team_id: MKT, key: "x", label: "X" }, admin))
  );
  check(
    "nobody can define a GLOBAL metric",
    !(await canInsert(alice, "metric_definitions", { team_id: null, key: "g", label: "G" }, admin))
  );

  // --- Validation trigger ---
  const { error: badMetric } = await bob
    .from("metrics")
    .insert({ team_id: FIN, metric_name: "not_a_metric", value: 1 });
  check("validation trigger rejects unknown metric_name", !!badMetric);

  // --- Webhooks + audit are admin-only ---
  const { data: hook } = await admin
    .from("webhooks")
    .insert({ team_id: FIN, url: "https://example.com/h", events: ["widget.added"] })
    .select("id")
    .single();
  check("admin sees webhooks", (await count(alice, "webhooks", "team_id", FIN)) >= 1);
  check("editor cannot see webhooks", (await count(bob, "webhooks", "team_id", FIN)) === 0);
  check(
    "editor cannot create webhook",
    !(await canInsert(bob, "webhooks", { team_id: FIN, url: "https://e.com/x", events: [] }, admin))
  );
  if (hook?.id) await admin.from("webhooks").delete().eq("id", hook.id);

  const { data: log } = await admin
    .from("audit_logs")
    .insert({ team_id: FIN, action: "test.rls", actor_email: "verifier" })
    .select("id")
    .single();
  check("admin can read audit log", (await count(alice, "audit_logs", "team_id", FIN)) >= 1);
  check("editor cannot read audit log", (await count(bob, "audit_logs", "team_id", FIN)) === 0);
  check(
    "user cannot write audit log",
    !(await canInsert(bob, "audit_logs", { team_id: FIN, action: "x" }, admin))
  );
  if (log?.id) await admin.from("audit_logs").delete().eq("id", log.id);

  console.log("");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
