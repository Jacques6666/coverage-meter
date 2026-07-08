import express from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { rasterize } from "./rasterize.js";
import { analyzePixels, classify, buildReport } from "./coverage.js";
import { record, recent, recentDb } from "./telemetry.js";
import { releaseToPrint } from "./eip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
app.use(express.json({ limit: "2mb" }));

const ICON_B64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAACNklEQVR42u3dUXaDIBBG4crJjrL/HaRrsg99zzFGmB/87nMbYO4MSKK4vX5QSRMCAggAAQSAAAJAAAEggAAQQAAIIAAEEAACCAABBIAAAkAAASCAAFzHY7oeP/f9/R/8bttEw9le80d8ah+5Ar6M+ywmEgVcHvpkDVkCuoY+U0OKgGGhT9PQbhv9wnazBNRGodxB5RSUkIDl01ET/dr+NNGv7VUT/dq+jV4DLhnhm/m69+fPLeCb6JwIyuDmzjHBt6GnY/H/j8kz3tAKOBGIC9OwtvV6AZ+Ov9PgQ7ox+iooZ9iffvKA6SvuJ8neSZf2dXSLSv8x0fmold5F0O6T+5l10ELSf3xEjrfYtQja3XI/rQ5aQvrn028sj9umf0gRuDNu0SnoYM3OdRebCiBg6U2pCiAAawhYaQewbAVYAExBBIAAAggAAQSAAAIGY7fcUYBdrimIAOQLsAyogHUFHFyHFYEKKKb+xqznvhdetpbfvdqxAlbaDfQbi8M6ll4DQm4Bz5x84hbhkQ5yrr66C4h6HuhEK71XsrjL0N4O0nYeIwTkPBwa+JywJ+WLL6MnOKzjy0CUNDrTTvhgBAefljIM5wUV7+ELDu0LT8zB36C05UcY3rd2k3HG9srzAcX9qT87unxJqE2FdtvUCylEh3XcbB8QMh15f0CZBm/QKNPgHTI1JrxFabQP7xHDbJehBIAAAkAAASCAABBAAAggAAQQAAIIAAEEgAACQAABIIAAEEAALuMPKZTgG6zepFYAAAAASUVORK5CYII=";
try { const ip = path.join(__dirname, "icon.png"); if (!fs.existsSync(ip)) fs.writeFileSync(ip, Buffer.from(ICON_B64, "base64")); } catch (e) {}

const sendFile = (res, file, type) => { res.type(type); fs.createReadStream(path.join(__dirname, file)).on("error", () => res.status(404).end()).pipe(res); };

// Billing dashboard is the default page; the manual tool lives at /tool
app.get(["/", "/dashboard"], (_q, res) => sendFile(res, "dashboard.html", "html"));
app.get("/tool", (_q, res) => sendFile(res, "index.html", "html"));
app.get("/description.xml", (_q, res) => sendFile(res, "description.xml", "application/xml"));
app.get("/icon.png", (_q, res) => sendFile(res, "icon.png", "image/png"));
app.get("/healthz", (_q, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post("/api/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file uploaded (field name: file)" });
  const dpi = Math.min(300, Math.max(72, parseInt(req.body.dpi, 10) || 150));
  try {
    const frames = rasterize(req.file.path, req.file.mimetype, dpi);
    const pages = frames.map((f, i) => { const c = analyzePixels(f.width, f.height, f.data, f.channels); return { page: i + 1, ...c, type: classify(c) }; });
    const report = buildReport(pages, { model: req.body.model, serialNumber: req.body.serial, source: req.file.originalname, dpi });
    if (req.body.report !== "false") record(report);
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { fs.rm(req.file.path, { force: true }, () => {}); }
});
app.post("/api/telemetry", (req, res) => { try { res.json(record(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/telemetry/recent", (req, res) => res.json(recent(parseInt(req.query.limit, 10) || 50)));
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
    record(report); res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Billing summary: devices grouped by site, with site totals vs contract ---
const CONTRACT_PCT = 5;
const SEED = [
  {device:{serialNumber:"3776005117",model:"Xerox AltaLink C8135",site:"Altron - Woodmead"},job:{pages:12},coverage:{avgTotalAreaCoveragePct:7.8}},
  {device:{serialNumber:"3776005117",model:"Xerox AltaLink C8135",site:"Altron - Woodmead"},job:{pages:3},coverage:{avgTotalAreaCoveragePct:6.2}},
  {device:{serialNumber:"XRX-8145-0042",model:"Xerox AltaLink C8145",site:"Altron - Woodmead"},job:{pages:40},coverage:{avgTotalAreaCoveragePct:3.1}},
  {device:{serialNumber:"XRX-C7025-0113",model:"Xerox VersaLink C7025",site:"Acme Attorneys - Sandton"},job:{pages:60},coverage:{avgTotalAreaCoveragePct:11.5}},
  {device:{serialNumber:"XRX-C8155-0210",model:"Xerox AltaLink C8155",site:"Acme Attorneys - Sandton"},job:{pages:30},coverage:{avgTotalAreaCoveragePct:9.2}},
  {device:{serialNumber:"XRX-B8055-0009",model:"Xerox AltaLink B8055",site:"Metro Clinic - Durban"},job:{pages:120},coverage:{avgTotalAreaCoveragePct:2.4}},
  {device:{serialNumber:"XRX-B7035-0044",model:"Xerox VersaLink B7035",site:"Metro Clinic - Durban"},job:{pages:80},coverage:{avgTotalAreaCoveragePct:3.8}}
];
async function summarize(){
  let recs; try { recs = await recentDb(3000); } catch(e){ recs = []; }
  const all = SEED.concat(recs); const dmap = {};
  all.forEach(r=>{
    const s=(r.device&&r.device.serialNumber)||"unknown";
    const site=(r.device&&r.device.site)||"Unassigned";
    const cov=(r.coverage&&r.coverage.avgTotalAreaCoveragePct)||0;
    const pages=(r.job&&r.job.pages)||1;
    const d=dmap[s]||(dmap[s]={serial:s,model:(r.device&&r.device.model)||"",site:site,jobs:0,pages:0,covPages:0});
    d.jobs++; d.pages+=pages; d.covPages+=cov*pages; if(r.device&&r.device.model)d.model=r.device.model; d.site=site;
  });
  const devices = Object.keys(dmap).map(s=>{const d=dmap[s];const avg=d.pages?d.covPages/d.pages:0;
    return {serial:d.serial,model:d.model,site:d.site,jobs:d.jobs,pages:d.pages,avgCoverage:+avg.toFixed(2),delta:+(avg-CONTRACT_PCT).toFixed(2),over:avg>CONTRACT_PCT};});
  const smap={};
  devices.forEach(d=>{const g=smap[d.site]||(smap[d.site]={site:d.site,devices:[],pages:0,covPages:0});g.devices.push(d);g.pages+=d.pages;g.covPages+=d.avgCoverage*d.pages;});
  const sites=Object.keys(smap).map(k=>{const g=smap[k];const avg=g.pages?g.covPages/g.pages:0;
    g.devices.sort((a,b)=>b.avgCoverage-a.avgCoverage);
    return {site:g.site,deviceCount:g.devices.length,pages:g.pages,avgCoverage:+avg.toFixed(2),delta:+(avg-CONTRACT_PCT).toFixed(2),over:avg>CONTRACT_PCT,devices:g.devices};});
  sites.sort((a,b)=>b.avgCoverage-a.avgCoverage);
  return {contractPct:CONTRACT_PCT, siteCount:sites.length, deviceCount:devices.length, sites:sites};
}
app.get("/api/summary", async (_q,res)=>{ try{ res.json(await summarize()); }catch(e){ res.status(500).json({error:e.message}); } });

// Ingest endpoint: the on-site metering proxy posts each job's coverage here.
app.post("/api/ingest",(req,res)=>{ try{ const b=req.body||{}; record({reportType:"pageCoverage",schemaVersion:"1.0",device:b.device||{},job:b.job||{},coverage:b.coverage||{},generatedAt:new Date().toISOString()}); res.json({ok:true}); }catch(e){ res.status(500).json({error:e.message}); } });
// Keep-alive: ping own public URL so the free instance does not sleep.
const SELF_URL=(process.env.SELF_URL||"https://coverage-meter.onrender.com").replace(/\/+$/,"");
setInterval(()=>{ fetch(SELF_URL+"/healthz").catch(()=>{}); }, 10*60*1000);

app.listen(PORT, () => console.log(`Coverage Meter backend on http://localhost:${PORT}`));
