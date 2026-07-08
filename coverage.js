// coverage.js — core toner/ink coverage engine.
// Given a raster pixel buffer, compute per-channel area coverage the way
// coverage-based billing tools do: composite over white paper, convert each
// pixel RGB -> CMYK, and average each channel across the page.
//
// Verified against known inputs: white->0, black->K100, 50% gray->K~49.8,
// solid cyan->C100, solid red->M+Y100, half black/white->K50.

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Buffer} data  pixel bytes
 * @param {3|4} channels  3 = RGB (e.g. PPM), 4 = RGBA (e.g. PNG)
 */
export function analyzePixels(width, height, data, channels) {
  const n = width * height;
  if (n === 0) throw new Error("empty raster");
  let sc = 0, sm = 0, sy = 0, sk = 0, nonWhite = 0;
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    let r, g, b;
    if (channels === 4) {
      const a = data[p + 3] / 255;                 // composite over white paper
      r = (data[p]     * a + 255 * (1 - a)) / 255;
      g = (data[p + 1] * a + 255 * (1 - a)) / 255;
      b = (data[p + 2] * a + 255 * (1 - a)) / 255;
    } else {
      r = data[p] / 255; g = data[p + 1] / 255; b = data[p + 2] / 255;
    }
    const k = 1 - Math.max(r, g, b);
    let c = 0, m = 0, yy = 0;
    if (k < 0.999999) { const t = 1 - k; c = (1 - r - k) / t; m = (1 - g - k) / t; yy = (1 - b - k) / t; }
    sc += c; sm += m; sy += yy; sk += k;
    if (k > 0.01 || c > 0.01 || m > 0.01 || yy > 0.01) nonWhite++;
  }
  const pct = x => +(x / n * 100).toFixed(3);
  const cyanPct = pct(sc), magentaPct = pct(sm), yellowPct = pct(sy), blackPct = pct(sk);
  return {
    cyanPct, magentaPct, yellowPct, blackPct,
    totalAreaPct: +(cyanPct + magentaPct + yellowPct + blackPct).toFixed(3),
    inkDensityPct: pct(nonWhite),
    pixels: n
  };
}

/** Classify a page as Color or Mono from its coverage. */
export function classify(cov, threshold = 0.3) {
  return (cov.cyanPct + cov.magentaPct + cov.yellowPct) > threshold ? "Color" : "Mono";
}

/**
 * Aggregate per-page coverage into a job-level report + fleet telemetry payload.
 * @param {Array} pages  array of coverage objects (with .page, channels, type)
 * @param {object} meta  { model, serialNumber, source, dpi }
 */
export function buildReport(pages, meta) {
  const avg = key => +(pages.reduce((s, p) => s + p[key], 0) / pages.length).toFixed(3);
  const colorPages = pages.filter(p => p.type === "Color").length;
  // standard-page equivalents: a "page" = 5% coverage of one channel
  const eq = key => +(pages.reduce((s, p) => s + p[key], 0) / 5).toFixed(2);
  return {
    reportType: "pageCoverage",
    schemaVersion: "1.0",
    device: { model: meta.model || "unknown", serialNumber: meta.serialNumber || "unknown" },
    generatedAt: new Date().toISOString(),
    job: {
      id: "job-" + Date.now().toString(36),
      source: meta.source || "unknown",
      pages: pages.length,
      colorPages,
      monoPages: pages.length - colorPages,
      renderDpi: meta.dpi || 150
    },
    coverage: {
      avgTotalAreaCoveragePct: avg("totalAreaPct"),
      avgInkDensityPct: avg("inkDensityPct"),
      avgCyanPct: avg("cyanPct"),
      avgMagentaPct: avg("magentaPct"),
      avgYellowPct: avg("yellowPct"),
      avgBlackPct: avg("blackPct")
    },
    tonerStandardPageEquivalents: {
      cyan: eq("cyanPct"), magenta: eq("magentaPct"), yellow: eq("yellowPct"), black: eq("blackPct")
    },
    pages: pages.map(p => ({
      page: p.page, type: p.type,
      cyanPct: p.cyanPct, magentaPct: p.magentaPct, yellowPct: p.yellowPct,
      blackPct: p.blackPct, totalAreaPct: p.totalAreaPct, inkDensityPct: p.inkDensityPct
    }))
  };
}
