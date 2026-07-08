// telemetry.js — persist coverage records and (optionally) forward them to
// your cloud, the same channel you already use for meter reads and toner levels.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const LOG = path.join(DATA_DIR, "telemetry.jsonl");

export function record(report) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify(report) + "\n");

  // Forward to a fleet endpoint if configured. Kept as an explicit integration
  // point; set FLEET_WEBHOOK_URL to your ingest service. (No secrets in code.)
  const url = process.env.FLEET_WEBHOOK_URL;
  if (url) {
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) })
      .catch(err => console.warn("[telemetry] forward failed:", err.message));
  }
  return { stored: LOG, forwarded: !!url };
}

export function recent(limit = 50) {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean)
    .slice(-limit).map(l => JSON.parse(l));
}
