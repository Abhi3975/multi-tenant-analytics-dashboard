/**
 * simulate-metrics.ts
 *
 * Inserts fake-but-plausible metric rows for every team every few seconds so
 * dashboards have live-looking data. Uses the SERVICE ROLE key (bypasses RLS)
 * because it's a trusted backend job seeding data across all tenants.
 *
 * Run:
 *   npm run simulate
 * (loads env from .env.local automatically)
 *
 * Stop with Ctrl+C.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const INTERVAL_MS = 3000;

// metric -> [min, max, integer?] plausible ranges
const METRICS: Record<string, [number, number, boolean]> = {
  revenue: [8000, 16000, false],
  errors: [0, 30, true],
  page_views: [3000, 16000, true],
  clicks: [400, 2500, true],
};

// Per team+metric running value for a smooth random walk.
const state = new Map<string, number>();

function nextValue(key: string, [min, max, isInt]: [number, number, boolean]) {
  const prev = state.get(key) ?? min + Math.random() * (max - min);
  const span = max - min;
  const step = (Math.random() - 0.5) * span * 0.08; // +/- 4% of range
  let v = prev + step;
  if (v < min) v = min + Math.random() * span * 0.1;
  if (v > max) v = max - Math.random() * span * 0.1;
  state.set(key, v);
  return isInt ? Math.round(v) : Math.round(v * 100) / 100;
}

async function tick(teamIds: string[]) {
  const rows: {
    team_id: string;
    metric_name: string;
    value: number;
  }[] = [];
  for (const teamId of teamIds) {
    for (const [name, range] of Object.entries(METRICS)) {
      rows.push({
        team_id: teamId,
        metric_name: name,
        value: nextValue(`${teamId}:${name}`, range),
      });
    }
  }
  const { error } = await supabase.from("metrics").insert(rows);
  if (error) {
    console.error("insert failed:", error.message);
  } else {
    console.log(
      `${new Date().toLocaleTimeString()}  inserted ${rows.length} rows across ${teamIds.length} team(s)`
    );
  }
}

async function main() {
  const { data: teams, error } = await supabase.from("teams").select("id, name");
  if (error) {
    console.error("Could not load teams:", error.message);
    process.exit(1);
  }
  if (!teams || teams.length === 0) {
    console.error("No teams found. Did you run the migrations + seed?");
    process.exit(1);
  }

  const teamIds = teams.map((t) => t.id);
  console.log(
    `Simulating metrics for ${teams.length} team(s): ${teams
      .map((t) => t.name)
      .join(", ")}`
  );
  console.log(`Inserting every ${INTERVAL_MS / 1000}s. Ctrl+C to stop.\n`);

  await tick(teamIds);
  const interval = setInterval(() => void tick(teamIds), INTERVAL_MS);

  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\nStopped.");
    process.exit(0);
  });
}

void main();
