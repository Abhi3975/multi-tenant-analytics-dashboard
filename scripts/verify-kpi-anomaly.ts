/**
 * verify-kpi-anomaly.ts
 *
 * End-to-end check of Tier 2's computed KPIs and server-side anomaly alerts:
 *   - the ARPU KPI (revenue / users) evaluates against live metrics
 *   - the rolling-window detector trigger fires on a spike and the alert is
 *     delivered to an authorized subscriber via Realtime (~<1s)
 *   - anomaly_alerts + kpi_definitions are RLS-isolated (Carol/Marketing can't
 *     read Finance's)
 *
 * Run: npm run verify:kpi   (local stack up, .env.local populated)
 * Cleans up the metrics + alerts it creates.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateFormula } from "../src/lib/kpi-formula";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FIN = "b0000000-0000-0000-0000-000000000001";

let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) failures++;
}
async function authed(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: "password123" });
  const { data } = await c.auth.getSession();
  await c.realtime.setAuth(data.session!.access_token);
  return c;
}
function latch<T>() {
  let v: T | undefined, done = false, cb: ((x: T) => void) | null = null;
  return {
    fire(x: T) { if (!done) { v = x; done = true; cb?.(x); } },
    wait(ms: number) {
      return new Promise<T>((res, rej) => {
        if (done) return res(v as T);
        cb = res;
        setTimeout(() => (done ? undefined : rej(new Error("timeout"))), ms);
      });
    },
  };
}

async function main() {
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const alice = await authed("alice@example.com");
  const carol = await authed("carol@example.com");

  // --- KPI: ARPU = revenue / users evaluates from live metrics ---
  const { data: kpi } = await alice
    .from("kpi_definitions")
    .select("formula")
    .eq("team_id", FIN)
    .eq("name", "ARPU")
    .single();
  const latest = async (m: string) =>
    (
      await alice
        .from("metrics")
        .select("value")
        .eq("team_id", FIN)
        .eq("metric_name", m)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.value as number;
  const revenue = await latest("revenue");
  const users = await latest("users");
  const arpu = evaluateFormula(kpi!.formula, { revenue, users });
  check(
    "ARPU KPI evaluates from live metrics",
    arpu !== null && Math.abs(arpu - revenue / users) < 1e-6,
    `revenue/users = ${arpu?.toFixed(2)}`
  );

  // --- Anomaly: subscribe as Alice, spike a metric, expect an alert ---
  const gotAlert = latch<{ metric: string; z: number; t: number }>();
  await new Promise<void>((resolve) => {
    alice
      .channel(`alerts-test:${FIN}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "anomaly_alerts", filter: `team_id=eq.${FIN}` },
        (p) => {
          const a = p.new as { metric_name: string; z_score: number };
          if (a.metric_name === "clicks")
            gotAlert.fire({ metric: a.metric_name, z: a.z_score, t: Date.now() });
        }
      )
      .subscribe((s) => s === "SUBSCRIBED" && resolve());
  });
  await new Promise((r) => setTimeout(r, 600));

  // 10 normal readings then a spike (service role; the trigger runs regardless).
  for (const v of [1000, 1010, 990, 1005, 995, 1015, 1002, 1008, 998, 1003]) {
    await admin.from("metrics").insert({ team_id: FIN, metric_name: "clicks", value: v });
  }
  const t0 = Date.now();
  await admin.from("metrics").insert({ team_id: FIN, metric_name: "clicks", value: 250000 });
  try {
    const a = await gotAlert.wait(6000);
    check("anomaly alert fires + delivered via Realtime", a.z > 2, `z=${a.z.toFixed(1)}, ${a.t - t0}ms`);
  } catch {
    check("anomaly alert fires + delivered via Realtime", false, "timeout");
  }

  // --- RLS isolation of the new tables ---
  const carolAlerts = (await carol.from("anomaly_alerts").select("id").eq("team_id", FIN)).data ?? [];
  check("carol sees 0 Finance anomaly_alerts", carolAlerts.length === 0);
  const carolKpis = (await carol.from("kpi_definitions").select("id").eq("team_id", FIN)).data ?? [];
  check("carol sees 0 Finance KPIs", carolKpis.length === 0);

  // --- cleanup ---
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await admin.from("metrics").delete().eq("metric_name", "clicks").eq("team_id", FIN).gte("recorded_at", since);
  await admin.from("anomaly_alerts").delete().eq("team_id", FIN).gte("created_at", since);

  console.log("");
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
