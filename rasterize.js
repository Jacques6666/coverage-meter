// rasterize.js — turn an incoming document into raster frames for analysis.
//
// PDFs are rasterised with poppler's `pdftoppm` (fast, exact, no native npm
// dependency). Its raw PPM (P6) output is parsed directly. Raster images
// (PNG/JPG) are decoded with pure-JS libraries.
//
// The rasteriser is deliberately isolated: to remove the poppler system
// dependency (e.g. for a pure-npm Windows install) swap `rasterizePdf` for a
// WASM pdfium build — nothing else changes.

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

/** @returns {Array<{width:number,height:number,data:Uint8Array,channels:3|4}>} */
export function rasterize(filePath, mime, dpi = 150) {
  const isPdf = mime === "application/pdf" || filePath.toLowerCase().endsWith(".pdf");
  if (isPdf) return rasterizePdf(filePath, dpi);
  return [decodeImage(filePath, mime)];
}

function rasterizePdf(filePath, dpi) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-"));
  try {
    const prefix = path.join(dir, "pg");
    const r = spawnSync("pdftoppm", ["-r", String(dpi), filePath, prefix], { maxBuffer: 1 << 30 });
    if (r.error) throw new Error("pdftoppm not found on PATH — install poppler-utils. (" + r.error.message + ")");
    if (r.status !== 0) throw new Error("pdftoppm failed: " + (r.stderr ? r.stderr.toString() : "unknown"));
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith(".ppm"))
      .sort((a, b) => pageNum(a) - pageNum(b));
    if (!files.length) throw new Error("pdftoppm produced no pages");
    return files.map(f => parsePPM(fs.readFileSync(path.join(dir, f))));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function pageNum(name) { const m = name.match(/(\d+)\.ppm$/); return m ? parseInt(m[1], 10) : 0; }

// Parse a binary PPM (P6). Handles arbitrary whitespace and comment lines.
function parsePPM(buf) {
  let pos = 0;
  const isWS = c => c === 32 || c === 9 || c === 10 || c === 13;
  function token() {
    while (pos < buf.length && isWS(buf[pos])) pos++;
    while (pos < buf.length && buf[pos] === 35 /* # */) { while (pos < buf.length && buf[pos] !== 10) pos++; while (pos < buf.length && isWS(buf[pos])) pos++; }
    const s = pos;
    while (pos < buf.length && !isWS(buf[pos])) pos++;
    return buf.toString("ascii", s, pos);
  }
  const magic = token();
  if (magic !== "P6") throw new Error("unexpected PPM magic: " + magic);
  const width = +token(), height = +token(), maxval = +token();
  pos++; // single whitespace byte after maxval, then pixel data
  const data = buf.subarray(pos, pos + width * height * 3);
  return { width, height, data, channels: 3, maxval };
}

function decodeImage(filePath, mime) {
  const buf = fs.readFileSync(filePath);
  const isPng = mime === "image/png" || filePath.toLowerCase().endsWith(".png");
  if (isPng) {
    const p = PNG.sync.read(buf);
    return { width: p.width, height: p.height, data: p.data, channels: 4 };
  }
  const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
  return { width: j.width, height: j.height, data: j.data, channels: 4 };
}
