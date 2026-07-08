// telemetry.js -- storage + aggregation for OptiYield Fleet Coverage Monitor.
// Postgres when DATABASE_URL is set (durable, scales to the whole fleet);
// otherwise a local JSONL file (dev / single always-on server).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const LOG = path.join(DATA_DIR, "telemetry.jsonl");
const CONTRACT = +(process.env.CONTRACT_PCT || 5);

let pool = null, pgReady = false;
const initPromise = (async () => {
  if (!process.env.DATABASE_URL) return;
  const pg = (await import("pg")).default;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false }, max: 8 });
  pool.on("error", e => console.warn("[telemetry] idle pool error:", e.message));
  await pool.query(`CREATE TABLE IF NOT EXISTS coverage_reports (
    id BIGSERIAL PRIMARY KEY, ts TIMESTAMPTZ DEFAULT now(),
    serial TEXT, model TEXT, site TEXT, pages INT, coverage DOUBLE PRECISION, raw JSONB)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cov_ts ON coverage_reports(ts)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cov_serial ON coverage_reports(serial)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cov_site ON coverage_reports(site)`);
  pgReady = true; console.log("[telemetry] Postgres connected - durable storage on");
})().catch(e => console.warn("[telemetry] Postgres unavailable, using file store:", e.message));

export const ready = () => initPromise;
export const usingPg = () => pgReady;
export const contractPct = () => CONTRACT;

export function record(report) {
  const d = report.device || {}, j = report.job || {}, c = report.coverage || {};
  const ts = report.generatedAt || new Date().toISOString();
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ ...report, generatedAt: ts }) + "\n"); } catch (e) {}
  if (pgReady) pool.query(
    "INSERT INTO coverage_reports(ts,serial,model,site,pages,coverage,raw) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [ts, d.serialNumber || "unknown", d.model || "", d.site || "Unassigned", +j.pages || 0, +c.avgTotalAreaCoveragePct || 0, report]
  ).catch(e => console.warn("[telemetry] insert failed:", e.message));
  const url = process.env.FLEET_WEBHOOK_URL;
  if (url) fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) }).catch(() => {});
  return { stored: true, pg: pgReady };
}

export function recent(limit = 50) {
  if (!fs.existsSync(LOG)) return [];
  try { return fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).slice(-limit).map(l => JSON.parse(l)); } catch (e) { return []; }
}
export async function recentDb(limit = 5000) {
  if (!pgReady) return recent(limit);
  try { const r = await pool.query("SELECT raw FROM coverage_reports ORDER BY ts DESC LIMIT $1", [limit]); return r.rows.map(x => x.raw); }
  catch (e) { return recent(limit); }
}

/* ---- fallback helpers (JSONL) ---- */
function fileRows() {
  if (!fs.existsSync(LOG)) return [];
  try {
    return fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map(l => {
      const r = JSON.parse(l), d = r.device || {}, j = r.job || {}, c = r.coverage || {};
      return { ts: r.generatedAt || null, serial: d.serialNumber || "unknown", model: d.model || "", site: d.site || "Unassigned", pages: +j.pages || 0, coverage: +c.avgTotalAreaCoveragePct || 0 };
    });
  } catch (e) { return []; }
}
function inRange(rows, from, to) {
  const f = from ? Date.parse(from) : -Infinity, t = to ? Date.parse(to) : Infinity;
  return rows.filter(r => { const x = r.ts ? Date.parse(r.ts) : 0; return x >= f && x <= t; });
}
function pgWhere(from, to, extra = {}) {
  const parts = [], params = [];
  if (from) { params.push(from); parts.push(`ts >= $${params.length}`); }
  if (to)   { params.push(to);   parts.push(`ts <= $${params.length}`); }
  if (extra.site)   { params.push(extra.site);   parts.push(`site = $${params.length}`); }
  if (extra.serial) { params.push(extra.serial); parts.push(`serial = $${params.length}`); }
  if (extra.search) { params.push('%' + extra.search + '%'); const i = params.length; parts.push(`(serial ILIKE $${i} OR site ILIKE $${i} OR model ILIKE $${i})`); }
  return { sql: parts.length ? "WHERE " + parts.join(" AND ") : "", params };
}
const groupBy = (rows, k) => { const m = {}; rows.forEach(r => (m[r[k]] || (m[r[k]] = [])).push(r)); return m; };
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
function sortList(list, key, order) { list.sort((a, b) => { const av = a[key], bv = b[key]; let c = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av < bv ? -1 : av > bv ? 1 : 0); return order === "asc" ? c : -c; }); return list; }
function siteRow(site, deviceCount, pages, avgRaw, lastSeen) { const avg = avgRaw ? +(+avgRaw).toFixed(2) : 0; return { site, deviceCount, pages, avgCoverage: avg, delta: +(avg - CONTRACT).toFixed(2), over: avg > CONTRACT, lastSeen: lastSeen || "" }; }
function devRow(serial, model, site, jobs, pages, avgRaw, lastCov, lastAt) { const avg = avgRaw ? +(+avgRaw).toFixed(2) : 0; return { serial, model: model || "", site: site || "Unassigned", jobs, pages, avgCoverage: avg, delta: +(avg - CONTRACT).toFixed(2), over: avg > CONTRACT, lastCoverage: lastCov != null ? +(+lastCov).toFixed(2) : null, lastAt: lastAt || null }; }
function devFromRows(serial, rs) { const p = sum(rs, "pages"), cp = rs.reduce((a, r) => a + r.coverage * r.pages, 0); const last = rs.reduce((m, r) => (!m || (r.ts && r.ts > m.ts) ? r : m), null); return devRow(serial, rs[0] && rs[0].model, rs[0] && rs[0].site, rs.length, p, p ? cp / p : 0, last ? last.coverage : null, last && last.ts ? last.ts.slice(0, 16).replace("T", " ") : null); }

/* ---- fleet KPIs + daily trend ---- */
export async function stats({ from, to } = {}) {
  if (pgReady) {
    const w = pgWhere(from, to);
    const t = (await pool.query(`SELECT COUNT(DISTINCT serial)::int devices, COUNT(DISTINCT site)::int sites, COALESCE(SUM(pages),0)::bigint pages, COUNT(*)::bigint jobs, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg FROM coverage_reports ${w.sql}`, w.params)).rows[0];
    const over = (await pool.query(`SELECT COUNT(*)::int n FROM (SELECT serial FROM coverage_reports ${w.sql} GROUP BY serial HAVING SUM(coverage*pages)/NULLIF(SUM(pages),0) > ${CONTRACT}) q`, w.params)).rows[0];
    const s = (await pool.query(`SELECT to_char(date_trunc('day',ts),'YYYY-MM-DD') d, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg, SUM(pages)::bigint pages FROM coverage_reports ${w.sql} GROUP BY 1 ORDER BY 1`, w.params)).rows;
    return { contractPct: CONTRACT, devices: t.devices || 0, sites: t.sites || 0, pages: +t.pages || 0, jobs: +t.jobs || 0, avgCoverage: t.avg ? +(+t.avg).toFixed(2) : 0, devicesOver: over.n || 0, series: s.map(x => ({ date: x.d, avg: x.avg ? +(+x.avg).toFixed(2) : 0, pages: +x.pages })) };
  }
  const rows = inRange(fileRows(), from, to), byDev = groupBy(rows, "serial");
  let devices = 0, over = 0, pages = 0, covPages = 0; const sites = new Set();
  Object.values(byDev).forEach(rs => { devices++; const p = sum(rs, "pages"), cp = rs.reduce((a, r) => a + r.coverage * r.pages, 0); pages += p; covPages += cp; if (p && cp / p > CONTRACT) over++; });
  rows.forEach(r => sites.add(r.site));
  const days = {}; rows.forEach(r => { const d = (r.ts || "").slice(0, 10) || "?"; const g = days[d] || (days[d] = { pages: 0, cp: 0 }); g.pages += r.pages; g.cp += r.coverage * r.pages; });
  const series = Object.keys(days).sort().map(d => ({ date: d, avg: days[d].pages ? +(days[d].cp / days[d].pages).toFixed(2) : 0, pages: days[d].pages }));
  return { contractPct: CONTRACT, devices, sites: sites.size, pages, jobs: rows.length, avgCoverage: pages ? +(covPages / pages).toFixed(2) : 0, devicesOver: over, series };
}

/* ---- paginated site rollups ---- */
export async function sites({ from, to, search, page = 1, pageSize = 25, sort = "coverage", order = "desc" } = {}) {
  const off = (Math.max(1, page) - 1) * pageSize;
  const col = ({ coverage: "avg", pages: "pages", name: "site", devices: "device_count" })[sort] || "avg";
  const dir = order === "asc" ? "ASC" : "DESC";
  if (pgReady) {
    const w = pgWhere(from, to, search ? { search } : {});
    const total = (await pool.query(`SELECT COUNT(*)::int n FROM (SELECT site FROM coverage_reports ${w.sql} GROUP BY site) q`, w.params)).rows[0].n;
    const rows = (await pool.query(`SELECT site, COUNT(DISTINCT serial)::int device_count, SUM(pages)::bigint pages, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg, to_char(MAX(ts),'YYYY-MM-DD HH24:MI') last_seen FROM coverage_reports ${w.sql} GROUP BY site ORDER BY ${col} ${dir} NULLS LAST LIMIT ${pageSize} OFFSET ${off}`, w.params)).rows;
    return { total, page, pageSize, contractPct: CONTRACT, sites: rows.map(r => siteRow(r.site, r.device_count, +r.pages, r.avg, r.last_seen)) };
  }
  let rows = inRange(fileRows(), from, to);
  if (search) { const ql = search.toLowerCase(); rows = rows.filter(r => (r.site + r.serial + r.model).toLowerCase().includes(ql)); }
  const bySite = groupBy(rows, "site");
  let list = Object.keys(bySite).map(site => { const rs = bySite[site], serials = new Set(rs.map(r => r.serial)), p = sum(rs, "pages"), cp = rs.reduce((a, r) => a + r.coverage * r.pages, 0); const last = rs.reduce((m, r) => (!m || (r.ts && r.ts > m) ? r.ts : m), null); return siteRow(site, serials.size, p, p ? cp / p : 0, last ? last.slice(0, 16).replace("T", " ") : ""); });
  sortList(list, { coverage: "avgCoverage", pages: "pages", name: "site", devices: "deviceCount" }[sort] || "avgCoverage", order);
  return { total: list.length, page, pageSize, contractPct: CONTRACT, sites: list.slice(off, off + pageSize) };
}

/* ---- paginated fleet-wide device rollups ---- */
export async function devices({ from, to, search, page = 1, pageSize = 25, sort = "coverage", order = "desc" } = {}) {
  const off = (Math.max(1, page) - 1) * pageSize;
  const col = ({ coverage: "avg", pages: "pages", serial: "serial", site: "site" })[sort] || "avg";
  const dir = order === "asc" ? "ASC" : "DESC";
  if (pgReady) {
    const w = pgWhere(from, to, search ? { search } : {});
    const total = (await pool.query(`SELECT COUNT(*)::int n FROM (SELECT serial FROM coverage_reports ${w.sql} GROUP BY serial) q`, w.params)).rows[0].n;
    const rows = (await pool.query(`SELECT serial, MAX(model) model, MAX(site) site, COUNT(*)::int jobs, SUM(pages)::bigint pages, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg, (ARRAY_AGG(coverage ORDER BY ts DESC))[1] last_cov, to_char(MAX(ts),'YYYY-MM-DD HH24:MI') last_at FROM coverage_reports ${w.sql} GROUP BY serial ORDER BY ${col} ${dir} NULLS LAST LIMIT ${pageSize} OFFSET ${off}`, w.params)).rows;
    return { total, page, pageSize, contractPct: CONTRACT, devices: rows.map(r => devRow(r.serial, r.model, r.site, +r.jobs, +r.pages, r.avg, r.last_cov, r.last_at)) };
  }
  let rows = inRange(fileRows(), from, to);
  if (search) { const ql = search.toLowerCase(); rows = rows.filter(r => (r.serial + r.site + r.model).toLowerCase().includes(ql)); }
  const byDev = groupBy(rows, "serial");
  let list = Object.keys(byDev).map(s => devFromRows(s, byDev[s]));
  sortList(list, { coverage: "avgCoverage", pages: "pages", serial: "serial", site: "site" }[sort] || "avgCoverage", order);
  return { total: list.length, page, pageSize, contractPct: CONTRACT, devices: list.slice(off, off + pageSize) };
}

/* ---- devices within one site ---- */
export async function siteDetail({ site, from, to } = {}) {
  if (pgReady) {
    const w = pgWhere(from, to, { site });
    const rows = (await pool.query(`SELECT serial, MAX(model) model, COUNT(*)::int jobs, SUM(pages)::bigint pages, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg, (ARRAY_AGG(coverage ORDER BY ts DESC))[1] last_cov, to_char(MAX(ts),'YYYY-MM-DD HH24:MI') last_at FROM coverage_reports ${w.sql} GROUP BY serial ORDER BY avg DESC NULLS LAST`, w.params)).rows;
    return { site, contractPct: CONTRACT, devices: rows.map(r => devRow(r.serial, r.model, site, +r.jobs, +r.pages, r.avg, r.last_cov, r.last_at)) };
  }
  let rows = inRange(fileRows(), from, to).filter(r => r.site === site);
  const byDev = groupBy(rows, "serial");
  const list = sortList(Object.keys(byDev).map(s => devFromRows(s, byDev[s])), "avgCoverage", "desc");
  return { site, contractPct: CONTRACT, devices: list };
}

/* ---- one device: totals, last job, daily trend, recent jobs ---- */
export async function deviceDetail({ serial, from, to, limit = 50 } = {}) {
  if (pgReady) {
    const w = pgWhere(from, to, { serial });
    const a = (await pool.query(`SELECT MAX(model) model, MAX(site) site, COUNT(*)::int jobs, SUM(pages)::bigint pages, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg FROM coverage_reports ${w.sql}`, w.params)).rows[0];
    const s = (await pool.query(`SELECT to_char(date_trunc('day',ts),'YYYY-MM-DD') d, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg, SUM(pages)::bigint pages FROM coverage_reports ${w.sql} GROUP BY 1 ORDER BY 1`, w.params)).rows;
    const jobs = (await pool.query(`SELECT to_char(ts,'YYYY-MM-DD HH24:MI') at, pages, coverage FROM coverage_reports ${w.sql} ORDER BY ts DESC LIMIT ${limit}`, w.params)).rows;
    const d = devRow(serial, a.model, a.site, +a.jobs, +a.pages, a.avg, jobs[0] ? jobs[0].coverage : null, jobs[0] ? jobs[0].at : null);
    return { device: d, series: s.map(x => ({ date: x.d, avg: x.avg ? +(+x.avg).toFixed(2) : 0, pages: +x.pages })), jobs: jobs.map(j => ({ at: j.at, pages: j.pages, coverage: +(+j.coverage).toFixed(2) })) };
  }
  let rows = inRange(fileRows(), from, to).filter(r => r.serial === serial);
  const d = devFromRows(serial, rows);
  const days = {}; rows.forEach(r => { const dd = (r.ts || "").slice(0, 10) || "?"; const g = days[dd] || (days[dd] = { pages: 0, cp: 0 }); g.pages += r.pages; g.cp += r.coverage * r.pages; });
  const series = Object.keys(days).sort().map(dd => ({ date: dd, avg: days[dd].pages ? +(days[dd].cp / days[dd].pages).toFixed(2) : 0, pages: days[dd].pages }));
  const jobs = rows.slice().reverse().slice(0, limit).map(r => ({ at: (r.ts || "").slice(0, 16).replace("T", " "), pages: r.pages, coverage: +r.coverage.toFixed(2) }));
  return { device: d, series, jobs };
}

/* ---- search (jump to a serial / site) ---- */
export async function search({ q, limit = 20 } = {}) {
  if (!q) return { devices: [], sites: [] };
  if (pgReady) {
    const d = (await pool.query(`SELECT serial, MAX(model) model, MAX(site) site, SUM(coverage*pages)/NULLIF(SUM(pages),0) avg FROM coverage_reports WHERE serial ILIKE $1 OR model ILIKE $1 GROUP BY serial LIMIT ${limit}`, ['%' + q + '%'])).rows;
    const s = (await pool.query(`SELECT DISTINCT site FROM coverage_reports WHERE site ILIKE $1 LIMIT ${limit}`, ['%' + q + '%'])).rows;
    return { devices: d.map(r => ({ serial: r.serial, model: r.model, site: r.site, avgCoverage: r.avg ? +(+r.avg).toFixed(2) : 0 })), sites: s.map(r => r.site) };
  }
  const rows = fileRows(), ql = q.toLowerCase(), dev = {};
  rows.forEach(r => { if ((r.serial + r.model).toLowerCase().includes(ql)) dev[r.serial] = { serial: r.serial, model: r.model, site: r.site }; });
  const sites = [...new Set(rows.filter(r => r.site.toLowerCase().includes(ql)).map(r => r.site))].slice(0, limit);
  return { devices: Object.values(dev).slice(0, limit), sites };
}
