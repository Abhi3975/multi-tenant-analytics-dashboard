/**
 * verify-isolation.ts
 *
 * The core multi-tenant guarantee, demonstrated at the database layer (not the
 * UI): signs in as the Marketing VIEWER (Carol) and directly queries Finance's
 * dashboards, metrics, widgets, projects, KPIs, and anomaly alerts through the
 * Supabase client. Every Finance query must come back empty — RLS denies the
 * rows in Postgres, so there is nothing to leak even if the UI were bypassed.
 *
 * Run: npm run verify:isolation
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const FINANCE_TEAM = "b0000000-0000-0000-0000-000000000001";
const FINANCE_DASHBOARD = "d0000000-0000-0000-0000-000000000001";
const MARKETING_TEAM = "b0000000-0000-0000-0000-000000000002";

let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failures++;
}

async function main() {
  const carol = createClient(url, anon, { auth: { persistSession: false } });
  const { error: signInErr } = await carol.auth.signInWithPassword({
    email: "carol@example.com",
    password: "password123",
  });
  if (signInErr) throw new Error(`sign-in failed: ${signInErr.message}`);
  console.log("Signed in as carol@example.com (Marketing, viewer)\n");

  const empty = async (table: string, col: string, val: string) => {
    const { data, error } = await carol.from(table).select("id").eq(col, val);
    // RLS returns an empty set (not an error) — that's the expected behavior.
    return { n: data?.length ?? 0, error };
  };

  console.log("--- Direct queries against FINANCE data (must all be 0) ---");
  for (const [table, col, val] of [
    ["dashboards", "team_id", FINANCE_TEAM],
    ["metrics", "team_id", FINANCE_TEAM],
    ["widgets", "dashboard_id", FINANCE_DASHBOARD],
    ["projects", "team_id", FINANCE_TEAM],
    ["kpi_definitions", "team_id", FINANCE_TEAM],
    ["anomaly_alerts", "team_id", FINANCE_TEAM],
    ["memberships", "team_id", FINANCE_TEAM],
  ] as const) {
    const { n } = await empty(table, col, val);
    check(`carol → Finance ${table}: ${n} rows`, n === 0);
  }

  console.log("\n--- Sanity: she CAN see her own Marketing data ---");
  const mkt = await empty("metrics", "team_id", MARKETING_TEAM);
  check(`carol → Marketing metrics: ${mkt.n} rows`, mkt.n > 0);

  console.log("\n--- Write attempt into Finance is rejected, not just hidden ---");
  const { error: writeErr } = await carol
    .from("dashboards")
    .insert({ team_id: FINANCE_TEAM, name: "hack", created_by: null });
  check("carol → INSERT Finance dashboard is denied", !!writeErr, writeErr?.code);

  console.log("");
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
