// telemetry.js -- stores each coverage report. Uses Postgres when DATABASE_URL
// is set (durable), otherwise a local JSONL file (fine for a real server; note
// that on ephemeral hosts like Render-free the file resets on restart).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const LOG = path.join(DATA_DIR, "telemetry.jsonl");

let pool = null, pgReady = false;
(async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    const pg = (await import("pg")).default;
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false } });
    await pool.query("CREATE TABLE IF NOT EXISTS coverage_reports (id SERIAL PRIMARY KEY, ts TIMESTAMPTZ DEFAULT now(), serial TEXT, model TEXT, site TEXT, pages INT, coverage DOUBLE PRECISION, raw JSONB)");
    pgReady = true; console.log("[telemetry] Postgres connected - durable storage on");
  } catch (e) { console.warn("[telemetry] Postgres unavailable, using file store:", e.message); }
})();

export function record(report) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.appendFileSync(LOG, JSON.stringify(report) + "\n"); } catch (e) {}
  if (pgReady) {
    const d = report.device || {}, j = report.job || {}, c = report.coverage || {};
    pool.query("INSERT INTO coverage_reports(serial,model,site,pages,coverage,raw) VALUES($1,$2,$3,$4,$5,$6)",
      [d.serialNumber || "unknown", d.model || "", d.site || "Unassigned", j.pages || 0, c.avgTotalAreaCoveragePct || 0, report])
      .catch(e => console.warn("[telemetry] insert failed:", e.message));
  }
  const url = process.env.FLEET_WEBHOOK_URL;
  if (url) fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) }).catch(() => {});
  return { stored: true, pg: pgReady };
}

export function recent(limit = 50) {
  if (!fs.existsSync(LOG)) return [];
  try { return fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).slice(-limit).map(l => JSON.parse(l)); } catch (e) { return []; }
}

// Preferred source for the dashboard: Postgres if available, else the file.
export async function recentDb(limit = 5000) {
  if (!pgReady) return recent(limit);
  try { const r = await pool.query("SELECT raw FROM coverage_reports ORDER BY ts DESC LIMIT $1", [limit]); return r.rows.map(x => x.raw); }
  catch (e) { return recent(limit); }
}
