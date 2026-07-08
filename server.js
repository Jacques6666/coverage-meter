import express from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { rasterize } from "./rasterize.js";
import { analyzePixels, classify, buildReport } from "./coverage.js";
import * as store from "./telemetry.js";
import { releaseToPrint } from "./eip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
app.use(express.json({ limit: "2mb" }));

const send = (res, file, type) => { res.type(type); fs.createReadStream(path.join(__dirname, file)).on("error", () => res.status(404).end()).pipe(res); };
app.get(["/", "/dashboard"], (_q, res) => send(res, "dashboard.html", "html"));
app.get("/tool", (_q, res) => send(res, "index.html", "html"));
app.get("/logo.svg", (_q, res) => send(res, "logo.svg", "image/svg+xml"));
app.get("/description.xml", (_q, res) => send(res, "description.xml", "application/xml"));
app.get("/icon.png", (_q, res) => send(res, "icon.png", "image/png"));
app.get("/healthz", (_q, res) => res.json({ ok: true, pg: store.usingPg(), time: new Date().toISOString() }));

// ---- ingest: on-site metering proxy posts each job here ----
app.post("/api/ingest", (req, res) => {
  try { const b = req.body || {}; store.record({ reportType: "pageCoverage", schemaVersion: "1.0", device: b.device || {}, job: b.job || {}, coverage: b.coverage || {}, generatedAt: b.generatedAt || new Date().toISOString() }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- coverage tool endpoints (kept, used by /tool) ----
app.post("/api/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file uploaded (field name: file)" });
  const dpi = Math.min(300, Math.max(72, parseInt(req.body.dpi, 10) || 150));
  try {
    const frames = rasterize(req.file.path, req.file.mimetype, dpi);
    const pages = frames.map((f, i) => { const c = analyzePixels(f.width, f.height, f.data, f.channels); return { page: i + 1, ...c, type: classify(c) }; });
    const report = buildReport(pages, { model: req.body.model, serialNumber: req.body.serial, source: req.file.originalname, dpi });
    if (req.body.report !== "false") store.record(report);
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { fs.rm(req.file.path, { force: true }, () => {}); }
});
app.post("/api/telemetry", (req, res) => { try { res.json(store.record(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/telemetry/recent", (req, res) => res.json(store.recent(parseInt(req.query.limit, 10) || 50)));
app.post("/api/release-print", async (req, res) => { try { res.json(await releaseToPrint({ deviceUrl: req.body.deviceUrl, filePath: req.body.filePath, dryRun: req.body.dryRun !== false })); } catch (e) { res.status(500).json({ error: e.message }); } });
function makeSamplePage() {
  const W = 1000, H = 1400, ch = 4; const data = new Uint8Array(W * H * ch); data.fill(255);
  const rect = (x0, y0, x1, y1, r, g, b) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255; } };
  rect(60, 50, 260, 130, 0, 174, 239); rect(270, 50, 470, 130, 236, 0, 140);
  for (let l = 0; l < 34; l++) { const y = 180 + l*32, w = 60 + ((l*67) % 520); rect(80, y, 80+w, y+16, 30, 30, 30); }
  return { width: W, height: H, data, channels: ch };
}
app.get("/api/analyze-sample", (req, res) => {
  try { const f = makeSamplePage(); const c = analyzePixels(f.width, f.height, f.data, f.channels);
    const report = buildReport([{ page: 1, ...c, type: classify(c) }], { model: req.query.model || "Xerox AltaLink C8135", serialNumber: req.query.serial || "panel-test", source: "sample", dpi: 150 });
    store.record(report); res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- dashboard data API ----
const range = req => ({ from: req.query.from, to: req.query.to });
const clampSize = v => Math.min(200, Math.max(1, parseInt(v, 10) || 25));
app.get("/api/stats",  async (req, res) => { try { res.json(await store.stats(range(req))); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/sites",  async (req, res) => { try { res.json(await store.sites({ ...range(req), search: req.query.search, page: +req.query.page || 1, pageSize: clampSize(req.query.pageSize), sort: req.query.sort, order: req.query.order })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/devices",async (req, res) => { try { res.json(await store.devices({ ...range(req), search: req.query.search, page: +req.query.page || 1, pageSize: clampSize(req.query.pageSize), sort: req.query.sort, order: req.query.order })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/site/:site",     async (req, res) => { try { res.json(await store.siteDetail({ site: req.params.site, ...range(req) })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/device/:serial", async (req, res) => { try { res.json(await store.deviceDetail({ serial: req.params.serial, ...range(req), limit: Math.min(500, +req.query.limit || 50) })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/search", async (req, res) => { try { res.json(await store.search({ q: req.query.q })); } catch (e) { res.status(500).json({ error: e.message }); } });

// ---- CSV export ----
const csvCell = v => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
app.get("/api/export", async (req, res) => {
  try {
    const scope = req.query.scope === "devices" ? "devices" : "sites"; const r = range(req);
    let header, rows;
    if (scope === "devices") {
      const d = await store.devices({ ...r, search: req.query.search, page: 1, pageSize: 100000, sort: req.query.sort, order: req.query.order });
      header = ["Serial", "Model", "Site", "Jobs", "Pages", "AvgCoverage%", "DeltaVsContract", "Status", "LastJob%", "LastSeen"];
      rows = d.devices.map(x => [x.serial, x.model, x.site, x.jobs, x.pages, x.avgCoverage, x.delta, x.over ? "OVER" : "ok", x.lastCoverage, x.lastAt]);
    } else {
      const s = await store.sites({ ...r, search: req.query.search, page: 1, pageSize: 100000, sort: req.query.sort, order: req.query.order });
      header = ["Site", "Devices", "Pages", "AvgCoverage%", "DeltaVsContract", "Status", "LastSeen"];
      rows = s.sites.map(x => [x.site, x.deviceCount, x.pages, x.avgCoverage, x.delta, x.over ? "OVER" : "ok", x.lastSeen]);
    }
    const csv = [header.join(",")].concat(rows.map(r => r.map(csvCell).join(","))).join("\n");
    res.type("text/csv"); res.set("Content-Disposition", `attachment; filename="optiyield-${scope}.csv"`); res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- demo seed (until real data flows). Disable with DEMO_SEED=0 ----
async function seedIfEmpty() {
  await store.ready();
  if (process.env.DEMO_SEED === "0") return;
  const s = await store.stats();
  if (s.devices > 0) return;
  const base = [
    ["3776005117", "Xerox AltaLink C8135", "Altron - Woodmead", 7.6],
    ["XRX-8145-0042", "Xerox AltaLink C8145", "Altron - Woodmead", 3.1],
    ["XRX-C7025-0113", "Xerox VersaLink C7025", "Acme Attorneys - Sandton", 11.4],
    ["XRX-C8155-0210", "Xerox AltaLink C8155", "Acme Attorneys - Sandton", 9.1],
    ["XRX-B8055-0009", "Xerox AltaLink B8055", "Metro Clinic - Durban", 2.4],
    ["XRX-B7035-0044", "Xerox VersaLink B7035", "Metro Clinic - Durban", 3.8],
    ["XRX-C7130-7781", "Xerox VersaLink C7130", "Cape Legal - Cape Town", 6.3],
    ["XRX-B8145-2200", "Xerox AltaLink B8145", "Cape Legal - Cape Town", 4.2]
  ];
  const now = Date.now();
  for (const [serial, model, site, mean] of base) {
    for (let d = 20; d >= 0; d--) {
      if (Math.random() < 0.25) continue;
      const ts = new Date(now - d * 864e5 - Math.random() * 6e7).toISOString();
      const cov = Math.max(0.3, +(mean + (Math.random() - 0.5) * 3).toFixed(2));
      store.record({ device: { serialNumber: serial, model, site }, job: { pages: 1 + Math.floor(Math.random() * 12) }, coverage: { avgTotalAreaCoveragePct: cov }, generatedAt: ts });
    }
  }
  console.log("[seed] demo data inserted");
}
seedIfEmpty().catch(e => console.warn("[seed]", e.message));

// keep the free instance awake
const SELF_URL = (process.env.SELF_URL || "https://coverage-meter.onrender.com").replace(/\/+$/, "");
setInterval(() => { fetch(SELF_URL + "/healthz").catch(() => {}); }, 10 * 60 * 1000);

app.listen(PORT, () => console.log(`OptiYield Fleet Coverage Monitor on http://localhost:${PORT}`));
