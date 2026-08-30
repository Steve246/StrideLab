import { z } from "zod";
import { createTool } from "@anvia/core";
import { VIZ_TOOLS_INSTRUCTION } from "../prompt/instruction.js";
import { DATA_DIR, VIZ_DIR } from "../providers/dataDirectory.js";
import { safeJsonBasename } from "../utils/safeFile.js";
import fs from "node:fs/promises";
import path from "node:path";

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");

type ActivityRow = {
  date?: string;
  distance_km?: number;
  duration_min?: number;
  sport?: string;
  trimp?: number | null;
  load_score?: number | null;
};

type WeekBucket = {
  week_start: string;
  distance_km: number;
  duration_min: number;
  sessions: number;
  trimp: number;
};

type AcrPoint = {
  date: string;
  acute: number;
  chronic: number;
  acr: number | null;
  zone: LoadZone;
};

type LoadZone =
  | "undertraining"
  | "optimal"
  | "caution"
  | "high_risk"
  | "unknown";

function mondayOf(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sessionLoad(a: ActivityRow, metric: "km" | "trimp"): number {
  if (metric === "km") {
    return typeof a.distance_km === "number" ? a.distance_km : 0;
  }
  if (typeof a.trimp === "number") return a.trimp;
  if (typeof a.load_score === "number") return a.load_score;
  return 0;
}

function classifyAcr(acr: number | null): LoadZone {
  if (acr == null || !Number.isFinite(acr)) return "unknown";
  if (acr < 0.8) return "undertraining";
  if (acr <= 1.3) return "optimal";
  if (acr <= 1.5) return "caution";
  return "high_risk";
}

function zoneLabel(z: LoadZone): string {
  switch (z) {
    case "undertraining":
      return "Undertraining (<0.8)";
    case "optimal":
      return "Optimal / sweet spot (0.8–1.3)";
    case "caution":
      return "Caution spike (1.3–1.5)";
    case "high_risk":
      return "High risk spike (>1.5)";
    default:
      return "Unknown (need more history)";
  }
}

function zoneColor(z: LoadZone): string {
  switch (z) {
    case "undertraining":
      return "#5b7c99";
    case "optimal":
      return "#2f7d4a";
    case "caution":
      return "#c47f17";
    case "high_risk":
      return "#b33a3a";
    default:
      return "#888";
  }
}

function buildWeeklySeries(
  activities: ActivityRow[],
  weeks: number,
  asOf: Date,
): WeekBucket[] {
  const thisMonday = mondayOf(asOf);
  const oldestMonday = addDays(thisMonday, -(weeks - 1) * 7);
  const map = new Map<string, WeekBucket>();

  for (let i = 0; i < weeks; i++) {
    const start = addDays(oldestMonday, i * 7);
    const key = isoDate(start);
    map.set(key, {
      week_start: key,
      distance_km: 0,
      duration_min: 0,
      sessions: 0,
      trimp: 0,
    });
  }

  for (const a of activities) {
    if (!a.date) continue;
    const t = Date.parse(a.date);
    if (Number.isNaN(t)) continue;
    const weekKey = isoDate(mondayOf(new Date(t)));
    const bucket = map.get(weekKey);
    if (!bucket) continue;
    bucket.distance_km += typeof a.distance_km === "number" ? a.distance_km : 0;
    bucket.duration_min +=
      typeof a.duration_min === "number" ? a.duration_min : 0;
    bucket.trimp += sessionLoad(a, "trimp");
    bucket.sessions += 1;
  }

  return [...map.values()].map((b) => ({
    ...b,
    distance_km: round1(b.distance_km),
    duration_min: round1(b.duration_min),
    trimp: round1(b.trimp),
  }));
}

/**
 * myTrainingForecast-style ACR:
 * acute = load in last 7 days ending on day D
 * chronic = (load in last 28 days ending on D) / 4
 * ACR = acute / chronic
 */
function buildAcrSeries(
  activities: ActivityRow[],
  weeks: number,
  metric: "km" | "trimp",
  asOf: Date,
): AcrPoint[] {
  const days = weeks * 7;
  const start = addDays(asOf, -(days - 1));
  const points: AcrPoint[] = [];
  const msDay = 24 * 60 * 60 * 1000;

  const loads = activities
    .map((a) => {
      const t = Date.parse(a.date ?? "");
      if (Number.isNaN(t)) return null;
      return { t, load: sessionLoad(a, metric) };
    })
    .filter((x): x is { t: number; load: number } => x != null);

  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const end = day.getTime() + msDay; // exclusive end of calendar day UTC
    const acuteStart = end - 7 * msDay;
    const chronicStart = end - 28 * msDay;

    let acute = 0;
    let chronic28 = 0;
    for (const row of loads) {
      if (row.t >= acuteStart && row.t < end) acute += row.load;
      if (row.t >= chronicStart && row.t < end) chronic28 += row.load;
    }
    const chronic = chronic28 / 4;
    const acr = chronic > 0.05 ? acute / chronic : null;
    const zone = classifyAcr(acr);
    points.push({
      date: isoDate(day),
      acute: round1(acute),
      chronic: round1(chronic),
      acr: acr != null ? round2(acr) : null,
      zone,
    });
  }
  return points;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBarChartHtml(opts: {
  title: string;
  subtitle: string;
  series: { label: string; value: number }[];
  yUnit: string;
  notes: string[];
}): string {
  const width = 720;
  const height = 360;
  const padL = 48;
  const padR = 24;
  const padT = 32;
  const padB = 56;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxV = Math.max(...opts.series.map((s) => s.value), 1);
  const n = opts.series.length || 1;
  const gap = 8;
  const barW = Math.max(8, (chartW - gap * (n + 1)) / n);

  const bars = opts.series
    .map((s, i) => {
      const h = (s.value / maxV) * chartH;
      const x = padL + gap + i * (barW + gap);
      const y = padT + chartH - h;
      const label = escapeHtml(s.label.slice(5));
      return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="#1d6f5a" rx="3"/>
      <text x="${x + barW / 2}" y="${height - 28}" text-anchor="middle" font-size="10" fill="#444">${label}</text>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#222">${s.value}</text>`;
    })
    .join("");

  return pageShell({
    title: opts.title,
    subtitle: opts.subtitle,
    body: `
    <svg viewBox="0 0 ${width} ${height}" width="100%" role="img">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#ccc"/>
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" stroke="#ccc"/>
      <text x="12" y="${padT + 8}" font-size="11" fill="#666">${escapeHtml(opts.yUnit)}</text>
      ${bars}
    </svg>
    <ul>${opts.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`,
  });
}

/** myTrainingForecast-like ACR chart with colored risk bands. */
function renderAcrLevelHtml(opts: {
  title: string;
  subtitle: string;
  points: AcrPoint[];
  metric: "km" | "trimp";
  current: AcrPoint;
  notes: string[];
}): string {
  const width = 780;
  const height = 420;
  const padL = 52;
  const padR = 28;
  const padT = 28;
  const padB = 48;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const yMax = 2.2; // ACR axis

  const yScale = (acr: number) =>
    padT + chartH - (Math.min(acr, yMax) / yMax) * chartH;
  const xScale = (i: number, n: number) =>
    padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);

  const bands = [
    { lo: 0, hi: 0.8, color: "rgba(91,124,153,0.22)", label: "<0.8 under" },
    { lo: 0.8, hi: 1.3, color: "rgba(47,125,74,0.28)", label: "0.8–1.3 optimal" },
    { lo: 1.3, hi: 1.5, color: "rgba(196,127,23,0.28)", label: "1.3–1.5 caution" },
    { lo: 1.5, hi: yMax, color: "rgba(179,58,58,0.25)", label: ">1.5 high risk" },
  ];

  const bandRects = bands
    .map((b) => {
      const y1 = yScale(b.hi);
      const y2 = yScale(b.lo);
      return `<rect x="${padL}" y="${y1}" width="${chartW}" height="${Math.max(0, y2 - y1)}" fill="${b.color}"/>`;
    })
    .join("");

  const n = opts.points.length;
  const linePts = opts.points
    .map((p, i) => {
      const acr = p.acr ?? 0;
      return `${xScale(i, n)},${yScale(acr)}`;
    })
    .join(" ");

  const dots = opts.points
    .filter((p) => p.acr != null)
    .map((p) => {
      const i = opts.points.indexOf(p);
      return `<circle cx="${xScale(i, n)}" cy="${yScale(p.acr!)}" r="2.2" fill="${zoneColor(p.zone)}"/>`;
    })
    .join("");

  const yTicks = [0, 0.8, 1.3, 1.5, 2.0]
    .map(
      (v) =>
        `<line x1="${padL}" y1="${yScale(v)}" x2="${width - padR}" y2="${yScale(v)}" stroke="#ddd" stroke-dasharray="3 3"/>
         <text x="${padL - 6}" y="${yScale(v) + 3}" text-anchor="end" font-size="10" fill="#555">${v}</text>`,
    )
    .join("");

  const xLabels = opts.points
    .filter((_, i) => i % 7 === 0 || i === n - 1)
    .map((p) => {
      const i = opts.points.indexOf(p);
      return `<text x="${xScale(i, n)}" y="${height - 18}" text-anchor="middle" font-size="10" fill="#555">${escapeHtml(p.date.slice(5))}</text>`;
    })
    .join("");

  const cur = opts.current;
  const badge = `
    <div class="level" style="border-color:${zoneColor(cur.zone)};">
      <div class="level-label">Current load level</div>
      <div class="level-value" style="color:${zoneColor(cur.zone)};">${
        cur.acr != null ? cur.acr.toFixed(2) : "n/a"
      }</div>
      <div class="level-zone">${escapeHtml(zoneLabel(cur.zone))}</div>
      <div class="level-meta">Acute 7d: ${cur.acute} ${opts.metric === "km" ? "km" : "TRIMP"} · Chronic weekly avg: ${cur.chronic} ${opts.metric === "km" ? "km" : "TRIMP"}</div>
    </div>`;

  return pageShell({
    title: opts.title,
    subtitle: opts.subtitle,
    body: `
    ${badge}
    <p class="legend">
      <span style="background:rgba(91,124,153,0.35)">Under &lt;0.8</span>
      <span style="background:rgba(47,125,74,0.4)">Optimal 0.8–1.3</span>
      <span style="background:rgba(196,127,23,0.4)">Caution 1.3–1.5</span>
      <span style="background:rgba(179,58,58,0.35)">High risk &gt;1.5</span>
    </p>
    <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Acute chronic workload ratio">
      ${bandRects}
      ${yTicks}
      <polyline fill="none" stroke="#1a1a1a" stroke-width="2" points="${linePts}"/>
      ${dots}
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" stroke="#999"/>
      <text x="14" y="${padT + 10}" font-size="11" fill="#666">ACR</text>
      ${xLabels}
    </svg>
    <ul>${opts.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
    <p class="foot">Method inspired by myTrainingForecast / Blanch &amp; Gabbett ACR: acute (7d) ÷ chronic weekly average (28d÷4). Load metric: ${opts.metric === "km" ? "distance (km)" : "Banister TRIMP"}.</p>`,
  });
}

function pageShell(opts: {
  title: string;
  subtitle: string;
  body: string;
  wide?: boolean;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(opts.title)}</title>
  <style>
    body { font-family: "IBM Plex Sans", system-ui, sans-serif; margin: 2rem; background: #f3f1ec; color: #1a1a1a; }
    h1 { font-size: 1.4rem; margin: 0 0 0.25rem; }
    h2 { font-size: 1.05rem; margin: 1.35rem 0 0.4rem; font-weight: 600; }
    p.sub { color: #555; margin: 0 0 1rem; }
    p.panel-note { color: #666; font-size: 0.88rem; margin: 0 0 0.6rem; }
    .card { background: #fff; border: 1px solid #ddd5c8; padding: 1rem 1.25rem 1.5rem; max-width: ${opts.wide ? "920px" : "860px"}; }
    ul { margin: 1rem 0 0; padding-left: 1.2rem; color: #444; }
    .level { border: 3px solid; border-radius: 10px; padding: 0.85rem 1rem; margin: 0 0 1rem; background: #fafafa; }
    .level-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
    .level-value { font-size: 2.4rem; font-weight: 700; line-height: 1.1; }
    .level-zone { font-weight: 600; margin-top: 0.15rem; }
    .level-meta { margin-top: 0.35rem; color: #555; font-size: 0.92rem; }
    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.65rem; margin: 0 0 1rem; }
    .kpi { border: 1px solid #ddd5c8; border-radius: 8px; padding: 0.65rem 0.75rem; background: #fafafa; }
    .kpi .k { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
    .kpi .v { font-size: 1.45rem; font-weight: 700; line-height: 1.15; margin-top: 0.15rem; }
    .kpi .s { font-size: 0.82rem; color: #555; margin-top: 0.2rem; }
    .legend { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 0.75rem; }
    .legend span { font-size: 0.78rem; padding: 0.2rem 0.45rem; border-radius: 4px; }
    .foot { margin-top: 1rem; font-size: 0.8rem; color: #777; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(opts.title)}</h1>
    <p class="sub">${escapeHtml(opts.subtitle)}</p>
    ${opts.body}
  </div>
</body>
</html>`;
}

function alignmentLabel(kmAcr: number | null, trimpAcr: number | null): string {
  if (kmAcr == null || trimpAcr == null) return "Need more history for ACR compare";
  const d = trimpAcr - kmAcr;
  if (Math.abs(d) < 0.15) return "Aligned — volume and intensity move together";
  if (d > 0.15) return "Intensity spike — load up vs mileage (hard sessions / race)";
  return "Volume spike — mileage up vs internal load (mostly easy km)";
}

/** Weekly km + TRIMP as small multiples (shared X), plus dual ACR on one ratio scale. */
function renderMileageLoadHtml(opts: {
  title: string;
  subtitle: string;
  weekly: WeekBucket[];
  acrKm: AcrPoint[];
  acrTrimp: AcrPoint[];
  notes: string[];
}): string {
  const last = opts.weekly[opts.weekly.length - 1];
  const curKm = opts.acrKm[opts.acrKm.length - 1];
  const curTrimp = opts.acrTrimp[opts.acrTrimp.length - 1];
  const efficiency =
    last && last.distance_km > 0.05
      ? round1(last.trimp / last.distance_km)
      : null;

  const width = 780;
  const barH = 220;
  const acrH = 320;
  const padL = 52;
  const padR = 28;
  const padT = 20;
  const padB = 40;
  const chartW = width - padL - padR;
  const chartHBar = barH - padT - padB;
  const chartHAcr = acrH - padT - padB;
  const n = Math.max(opts.weekly.length, 1);
  const gap = 6;
  const pairW = Math.max(10, (chartW - gap * (n + 1)) / n);
  const half = pairW / 2 - 1;

  const maxKm = Math.max(...opts.weekly.map((w) => w.distance_km), 1);
  const maxTrimp = Math.max(...opts.weekly.map((w) => w.trimp), 1);

  const twinBars = opts.weekly
    .map((w, i) => {
      const x0 = padL + gap + i * (pairW + gap);
      const hKm = (w.distance_km / maxKm) * chartHBar;
      const hTr = (w.trimp / maxTrimp) * chartHBar;
      const yKm = padT + chartHBar - hKm;
      const yTr = padT + chartHBar - hTr;
      const label = escapeHtml(w.week_start.slice(5));
      return `
      <rect x="${x0}" y="${yKm}" width="${half}" height="${hKm}" fill="#1d6f5a" rx="2"/>
      <rect x="${x0 + half + 2}" y="${yTr}" width="${half}" height="${hTr}" fill="#2c5282" rx="2"/>
      <text x="${x0 + pairW / 2}" y="${barH - 14}" text-anchor="middle" font-size="9" fill="#555">${label}</text>`;
    })
    .join("");

  // Indexed overlay (0–100): same axis, trend shapes comparable — avoids dual-Y misuse
  const idxH = 200;
  const chartHIdx = idxH - padT - padB;
  const idxKm = opts.weekly
    .map((w, i) => {
      const x =
        padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
      const y =
        padT + chartHIdx - (w.distance_km / maxKm) * chartHIdx;
      return `${x},${y}`;
    })
    .join(" ");
  const idxTr = opts.weekly
    .map((w, i) => {
      const x =
        padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
      const y = padT + chartHIdx - (w.trimp / maxTrimp) * chartHIdx;
      return `${x},${y}`;
    })
    .join(" ");
  const idxLabels = opts.weekly
    .filter((_, i) => i % 2 === 0 || i === n - 1)
    .map((w) => {
      const i = opts.weekly.indexOf(w);
      const x =
        padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
      return `<text x="${x}" y="${idxH - 12}" text-anchor="middle" font-size="9" fill="#555">${escapeHtml(w.week_start.slice(5))}</text>`;
    })
    .join("");

  const yMax = 2.2;
  const yScale = (acr: number) =>
    padT + chartHAcr - (Math.min(acr, yMax) / yMax) * chartHAcr;
  const xScaleAcr = (i: number, len: number) =>
    padL + (len <= 1 ? chartW / 2 : (i / (len - 1)) * chartW);

  const bands = [
    { lo: 0, hi: 0.8, color: "rgba(91,124,153,0.22)" },
    { lo: 0.8, hi: 1.3, color: "rgba(47,125,74,0.28)" },
    { lo: 1.3, hi: 1.5, color: "rgba(196,127,23,0.28)" },
    { lo: 1.5, hi: yMax, color: "rgba(179,58,58,0.25)" },
  ];
  const bandRects = bands
    .map((b) => {
      const y1 = yScale(b.hi);
      const y2 = yScale(b.lo);
      return `<rect x="${padL}" y="${y1}" width="${chartW}" height="${Math.max(0, y2 - y1)}" fill="${b.color}"/>`;
    })
    .join("");

  const nA = opts.acrKm.length;
  const lineKm = opts.acrKm
    .map((p, i) => `${xScaleAcr(i, nA)},${yScale(p.acr ?? 0)}`)
    .join(" ");
  const lineTr = opts.acrTrimp
    .map((p, i) => `${xScaleAcr(i, nA)},${yScale(p.acr ?? 0)}`)
    .join(" ");
  const yTicks = [0, 0.8, 1.3, 1.5, 2.0]
    .map(
      (v) =>
        `<line x1="${padL}" y1="${yScale(v)}" x2="${width - padR}" y2="${yScale(v)}" stroke="#ddd" stroke-dasharray="3 3"/>
         <text x="${padL - 6}" y="${yScale(v) + 3}" text-anchor="end" font-size="10" fill="#555">${v}</text>`,
    )
    .join("");
  const xLabelsAcr = opts.acrKm
    .filter((_, i) => i % 7 === 0 || i === nA - 1)
    .map((p) => {
      const i = opts.acrKm.indexOf(p);
      return `<text x="${xScaleAcr(i, nA)}" y="${acrH - 12}" text-anchor="middle" font-size="10" fill="#555">${escapeHtml(p.date.slice(5))}</text>`;
    })
    .join("");

  const kpi = `
    <div class="kpi-row">
      <div class="kpi"><div class="k">This week km</div><div class="v">${last?.distance_km ?? 0}</div><div class="s">${last?.sessions ?? 0} sessions</div></div>
      <div class="kpi"><div class="k">This week TRIMP</div><div class="v">${last?.trimp ?? 0}</div><div class="s">internal load</div></div>
      <div class="kpi" style="border-color:${zoneColor(curKm?.zone ?? "unknown")}"><div class="k">ACR mileage</div><div class="v" style="color:${zoneColor(curKm?.zone ?? "unknown")}">${curKm?.acr != null ? curKm.acr.toFixed(2) : "n/a"}</div><div class="s">${escapeHtml(zoneLabel(curKm?.zone ?? "unknown"))}</div></div>
      <div class="kpi" style="border-color:${zoneColor(curTrimp?.zone ?? "unknown")}"><div class="k">ACR load</div><div class="v" style="color:${zoneColor(curTrimp?.zone ?? "unknown")}">${curTrimp?.acr != null ? curTrimp.acr.toFixed(2) : "n/a"}</div><div class="s">${escapeHtml(zoneLabel(curTrimp?.zone ?? "unknown"))}</div></div>
      <div class="kpi"><div class="k">Efficiency</div><div class="v">${efficiency != null ? efficiency : "n/a"}</div><div class="s">TRIMP / km (higher = costlier)</div></div>
    </div>
    <p class="panel-note"><strong>Read:</strong> ${escapeHtml(alignmentLabel(curKm?.acr ?? null, curTrimp?.acr ?? null))}</p>`;

  return pageShell({
    title: opts.title,
    subtitle: opts.subtitle,
    wide: true,
    body: `
    ${kpi}

    <h2>1. Weekly mileage + load (paired bars)</h2>
    <p class="panel-note">External (km, teal) and internal (TRIMP, blue) side-by-side each week — same X-axis, own scales (small-multiples style; not a dual Y-axis).</p>
    <p class="legend">
      <span style="background:#1d6f5a;color:#fff">km</span>
      <span style="background:#2c5282;color:#fff">TRIMP</span>
    </p>
    <svg viewBox="0 0 ${width} ${barH}" width="100%" role="img" aria-label="Weekly km and TRIMP paired bars">
      <line x1="${padL}" y1="${padT + chartHBar}" x2="${width - padR}" y2="${padT + chartHBar}" stroke="#ccc"/>
      ${twinBars}
    </svg>

    <h2>2. Indexed trend (one graph, same 0–100 scale)</h2>
    <p class="panel-note">Each series scaled to its own max in this window — compare shapes without mixing km and TRIMP units (indexed / normalized overlay).</p>
    <p class="legend">
      <span style="background:#1d6f5a;color:#fff">km (indexed)</span>
      <span style="background:#2c5282;color:#fff">TRIMP (indexed)</span>
    </p>
    <svg viewBox="0 0 ${width} ${idxH}" width="100%" role="img" aria-label="Indexed weekly km vs TRIMP">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartHIdx}" stroke="#ccc"/>
      <line x1="${padL}" y1="${padT + chartHIdx}" x2="${width - padR}" y2="${padT + chartHIdx}" stroke="#ccc"/>
      <text x="14" y="${padT + 8}" font-size="10" fill="#666">% of max</text>
      <polyline fill="none" stroke="#1d6f5a" stroke-width="2.2" points="${idxKm}"/>
      <polyline fill="none" stroke="#2c5282" stroke-width="2.2" stroke-dasharray="5 3" points="${idxTr}"/>
      ${idxLabels}
    </svg>

    <h2>3. Dual ACR (same ratio scale)</h2>
    <p class="panel-note">Mileage ACR vs TRIMP ACR — both dimensionless, so two lines on one chart is valid.</p>
    <p class="legend">
      <span style="background:#1a1a1a;color:#fff">ACR km</span>
      <span style="background:#2c5282;color:#fff">ACR TRIMP (dashed)</span>
      <span style="background:rgba(47,125,74,0.4)">Optimal 0.8–1.3</span>
    </p>
    <svg viewBox="0 0 ${width} ${acrH}" width="100%" role="img" aria-label="Dual acute chronic workload ratio">
      ${bandRects}
      ${yTicks}
      <polyline fill="none" stroke="#1a1a1a" stroke-width="2.2" points="${lineKm}"/>
      <polyline fill="none" stroke="#2c5282" stroke-width="2.2" stroke-dasharray="6 4" points="${lineTr}"/>
      <line x1="${padL}" y1="${padT + chartHAcr}" x2="${width - padR}" y2="${padT + chartHAcr}" stroke="#999"/>
      <text x="14" y="${padT + 10}" font-size="11" fill="#666">ACR</text>
      ${xLabelsAcr}
    </svg>

    <ul>${opts.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
    <p class="foot">Layout follows coaching practice: show external (km) and internal (TRIMP) separately, combine via indexed trends + dual ACR — not a dual Y-axis of absolute km vs TRIMP. ACR = acute 7d ÷ chronic weekly avg (28d÷4).</p>`,
  });
}

export const vizTools = createTool({
  name: "viz_chart",
  description: VIZ_TOOLS_INSTRUCTION,
  input: z.object({
    kind: z
      .enum([
        "weekly_distance",
        "training_load",
        "weekly_trimp",
        "mileage_load",
      ])
      .describe(
        "mileage_load = one HTML combining weekly km+TRIMP + dual ACR; training_load = ACR zones only; weekly_distance / weekly_trimp = single bar charts",
      ),
    weeks: z.number().min(4).max(26).optional(),
    /** For training_load ACR: use km (myTF default) or Banister TRIMP. Ignored for mileage_load (shows both). */
    load_metric: z.enum(["km", "trimp"]).optional(),
  }),
  execute: async ({
    kind,
    weeks = 12,
    load_metric = "km",
  }) => {
    const text = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const payload = JSON.parse(text) as { activities?: ActivityRow[] };
    const activities = Array.isArray(payload.activities)
      ? payload.activities
      : [];

    // Anchor "today" to last activity if recent days are empty (export lag)
    const dated = activities
      .map((a) => Date.parse(a.date ?? ""))
      .filter((t) => !Number.isNaN(t));
    const lastActMs = dated.length ? Math.max(...dated) : Date.now();
    const nowMs = Date.now();
    const asOf = new Date(
      nowMs - lastActMs > 3 * 24 * 60 * 60 * 1000 ? lastActMs : nowMs,
    );

    await fs.mkdir(VIZ_DIR, { recursive: true });
    const stamp = isoDate(new Date());
    const subtitle = `Steven Personal Running Lab · as of ${isoDate(asOf)} · generated ${new Date().toISOString()}`;

    if (kind === "mileage_load") {
      const weekly = buildWeeklySeries(activities, weeks, asOf);
      const acrKm = buildAcrSeries(activities, weeks, "km", asOf);
      const acrTrimp = buildAcrSeries(activities, weeks, "trimp", asOf);
      const last = weekly[weekly.length - 1];
      const curKm = acrKm[acrKm.length - 1];
      const curTrimp = acrTrimp[acrTrimp.length - 1];
      const efficiency =
        last && last.distance_km > 0.05
          ? round1(last.trimp / last.distance_km)
          : null;

      const notes = [
        `Combined view: mileage (external) + Banister TRIMP (internal) in one file.`,
        `Latest week (${last?.week_start ?? "n/a"}): ${last?.distance_km ?? 0} km, TRIMP ${last?.trimp ?? 0}${efficiency != null ? `, efficiency ${efficiency} TRIMP/km` : ""}.`,
        `ACR km ${curKm?.acr ?? "n/a"} (${zoneLabel(curKm?.zone ?? "unknown")}) vs ACR TRIMP ${curTrimp?.acr ?? "n/a"} (${zoneLabel(curTrimp?.zone ?? "unknown")}).`,
        alignmentLabel(curKm?.acr ?? null, curTrimp?.acr ?? null),
        `As-of ${isoDate(asOf)}${
          asOf.getTime() < nowMs - 24 * 60 * 60 * 1000
            ? " (anchored to latest activity)"
            : ""
        }.`,
      ];

      const html = renderMileageLoadHtml({
        title: "Mileage + load (combined)",
        subtitle,
        weekly,
        acrKm,
        acrTrimp,
        notes,
      });

      const fileName = safeJsonBasename(
        `mileage_load_${stamp}`,
        "viz",
      ).replace(/\.json$/i, ".html");
      const out = path.join(VIZ_DIR, fileName);
      await fs.writeFile(out, html, "utf8");

      return {
        saved: out,
        kind,
        weeks,
        open_in_browser: out,
        summary: {
          week_start: last?.week_start ?? null,
          distance_km: last?.distance_km ?? 0,
          trimp: last?.trimp ?? 0,
          efficiency_trimp_per_km: efficiency,
          acr_km: curKm?.acr ?? null,
          acr_km_zone: curKm?.zone ?? "unknown",
          acr_trimp: curTrimp?.acr ?? null,
          acr_trimp_zone: curTrimp?.zone ?? "unknown",
          alignment: alignmentLabel(curKm?.acr ?? null, curTrimp?.acr ?? null),
          as_of: isoDate(asOf),
        },
      };
    }

    if (kind === "training_load") {
      const metric = load_metric;
      const points = buildAcrSeries(activities, weeks, metric, asOf);
      const current = points[points.length - 1] ?? {
        date: isoDate(asOf),
        acute: 0,
        chronic: 0,
        acr: null,
        zone: "unknown" as const,
      };

      const notes = [
        `Ask: "is my training load too high?" → look at Current load level badge and zone color.`,
        `Green (0.8–1.3) = generally sustainable; orange/red = spike vs last 4 weeks.`,
        current.acr == null
          ? "ACR unavailable — need ~4 weeks of history with load > 0."
          : `Today's ACR ${current.acr} is ${zoneLabel(current.zone)}.`,
        `As-of date ${isoDate(asOf)}${
          asOf.getTime() < nowMs - 24 * 60 * 60 * 1000
            ? " (anchored to latest activity — little/no volume in the last few calendar days)"
            : ""
        }.`,
      ];

      const html = renderAcrLevelHtml({
        title: "Training load level (Acute:Chronic)",
        subtitle,
        points,
        metric,
        current,
        notes,
      });

      const fileName = safeJsonBasename(
        `load_level_${metric}_${stamp}`,
        "viz",
      ).replace(/\.json$/i, ".html");
      const out = path.join(VIZ_DIR, fileName);
      await fs.writeFile(out, html, "utf8");

      return {
        saved: out,
        kind,
        weeks,
        load_metric: metric,
        current_level: {
          acr: current.acr,
          zone: current.zone,
          zone_label: zoneLabel(current.zone),
          acute_7d: current.acute,
          chronic_weekly_avg: current.chronic,
          as_of: current.date,
        },
        open_in_browser: out,
      };
    }

    const weekly = buildWeeklySeries(activities, weeks, asOf);
    const series =
      kind === "weekly_distance"
        ? weekly.map((w) => ({ label: w.week_start, value: w.distance_km }))
        : weekly.map((w) => ({ label: w.week_start, value: w.trimp }));

    const last = weekly[weekly.length - 1];
    const avg =
      weekly.length > 0
        ? round1(weekly.reduce((s, w) => s + w.distance_km, 0) / weekly.length)
        : 0;

    const title =
      kind === "weekly_distance"
        ? "Weekly training distance"
        : "Weekly Banister TRIMP";
    const notes = [
      `Latest week (${last?.week_start ?? "n/a"}): ${last?.distance_km ?? 0} km, TRIMP ${last?.trimp ?? 0}`,
      `Average weekly distance: ${avg} km`,
      `For load LEVEL (green/orange/red like myTrainingForecast), use kind=training_load.`,
    ];

    const html = renderBarChartHtml({
      title,
      subtitle,
      series,
      yUnit: kind === "weekly_distance" ? "km" : "TRIMP",
      notes,
    });

    const fileName = safeJsonBasename(`${kind}_${stamp}`, "viz").replace(
      /\.json$/i,
      ".html",
    );
    const out = path.join(VIZ_DIR, fileName);
    await fs.writeFile(out, html, "utf8");

    return {
      saved: out,
      kind,
      weeks,
      seriesSummary: { weeks: weekly, average_weekly_km: avg },
      open_in_browser: out,
    };
  },
});
