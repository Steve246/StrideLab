import fs from "node:fs/promises";
import path from "node:path";
import {
  buildAcr,
  buildDailyAnalyzer,
  buildOverview,
  buildOverviewDecision,
  buildWeekly,
  buildYourBestPayload,
} from "./data";
import { zoneLabel } from "./loadMath";
import { AGENT_DATA_ROOT } from "./paths";
import { athleteTimeZone } from "./timezone";

export const BRIEFS_DIR = path.join(AGENT_DATA_ROOT, "briefs");

export type BriefFormat = "markdown" | "html";

export type WeeklyBriefResult = {
  ok: true;
  brief_id: string;
  as_of: string;
  week_start: string | null;
  week_end: string | null;
  format: BriefFormat;
  path_md: string;
  path_html: string;
  download_md: string;
  download_html: string;
  summary: string;
  sections: string[];
  sources: Array<{ title: string; url: string }>;
};

export type WeeklyBriefSource = { title: string; url: string; content?: string };

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}

function stampId(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Deterministic weekly training brief from builders — no invented metrics.
 */
export async function generateWeeklyBrief(opts?: {
  week_start?: string | null;
  format?: BriefFormat;
  sources?: WeeklyBriefSource[];
}): Promise<WeeklyBriefResult> {
  const format: BriefFormat =
    opts?.format === "html" ? "html" : "markdown";
  const sources = opts?.sources ?? [];

  const [overview, insights, weekly, acr, daily, best] = await Promise.all([
    buildOverview(12),
    buildOverviewDecision(12),
    buildWeekly(12),
    buildAcr(12),
    buildDailyAnalyzer(7),
    buildYourBestPayload(),
  ]);

  const weekStart =
    (opts?.week_start?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(opts.week_start.trim())
      ? opts.week_start.trim()
      : null) ||
    overview.week_start ||
    overview.as_of;
  const weekEnd = weekStart ? addDaysIso(weekStart, 6) : null;
  const tz = athleteTimeZone();

  const weeks = weekly.weeks;
  const thisWeek = weeks[weeks.length - 1];
  const prevWeek = weeks[weeks.length - 2];
  const hrvLast = weekly.hrv[weekly.hrv.length - 1];

  const recovery = overview.recovery;
  const highlights: string[] = [];
  const risks: string[] = [];

  highlights.push(
    `Week status: ${insights.week_status_label} — ${insights.week_status_reason}`,
  );
  if (insights.form.form_label !== "Unknown") {
    highlights.push(
      `Form ${insights.form.form_label} (fitness ${insights.form.fitness}, fatigue ${insights.form.fatigue}, form ${insights.form.form >= 0 ? "+" : ""}${insights.form.form})`,
    );
  }
  highlights.push(
    `Consistency: ${insights.consistency.active_days_7}/7 active days · ${insights.consistency.sessions_this_week} sessions`,
  );
  if (best.highlights?.length) {
    for (const h of best.highlights.slice(0, 2)) {
      highlights.push(`${h.title}: ${h.value}`);
    }
  }

  if (insights.week_status !== "green") {
    risks.push(insights.week_status_reason);
  }
  if (
    overview.acr_trimp_zone === "caution" ||
    overview.acr_trimp_zone === "high_risk"
  ) {
    risks.push(
      `Effort ACR ${overview.acr_trimp?.toFixed(2) ?? "—"} · ${zoneLabel(overview.acr_trimp_zone)}`,
    );
  }
  if (
    overview.acr_km_zone === "caution" ||
    overview.acr_km_zone === "high_risk"
  ) {
    risks.push(
      `Mileage ACR ${overview.acr_km?.toFixed(2) ?? "—"} · ${zoneLabel(overview.acr_km_zone)}`,
    );
  }
  if (
    insights.sleep_consistency.label.toLowerCase().includes("short") ||
    insights.sleep_consistency.label.toLowerCase().includes("variable")
  ) {
    risks.push(`Sleep: ${insights.sleep_consistency.label}`);
  }
  if (best.lowlights?.length) {
    for (const l of best.lowlights.slice(0, 2)) {
      risks.push(`${l.title}: ${l.value}`);
    }
  }
  if (!risks.length) {
    risks.push("No major red flags in the current tool snapshot.");
  }

  const nextTargets: string[] = [];
  nextTargets.push(insights.next_action);
  if (overview.forecast_next_week_km != null) {
    nextTargets.push(
      `Forecast next week ≈ ${overview.forecast_next_week_km} km / TRIMP ${overview.forecast_next_week_trimp ?? "—"} (model expectation — not a prescription).`,
    );
  }
  if (acr.current?.alignment) {
    nextTargets.push(`Volume vs intensity: ${acr.current.alignment}`);
  }

  const sleepLine = [
    insights.sleep_consistency.avg_hours != null
      ? `avg ${insights.sleep_consistency.avg_hours} h`
      : null,
    insights.sleep_consistency.avg_score != null
      ? `score ${insights.sleep_consistency.avg_score}`
      : null,
    insights.sleep_consistency.hours_spread != null
      ? `spread ${insights.sleep_consistency.hours_spread} h`
      : null,
    recovery.sleep_hours != null ? `last night ${recovery.sleep_hours} h` : null,
    recovery.resting_hr != null ? `RHR ${recovery.resting_hr}` : null,
    hrvLast?.avg_hrv != null ? `HRV week avg ${hrvLast.avg_hrv}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const md = [
    `# Weekly Training Brief`,
    ``,
    `- **as_of:** ${overview.as_of}`,
    `- **week:** ${weekStart ?? "—"} → ${weekEnd ?? "—"}`,
    `- **timezone:** ${tz}`,
    `- **generated:** ${new Date().toISOString()}`,
    ``,
    `## Load & volume`,
    ``,
    `| Metric | This week | Prior week |`,
    `| --- | --- | --- |`,
    `| Distance | ${overview.distance_km} km | ${prevWeek?.distance_km ?? "—"} km |`,
    `| TRIMP | ${overview.trimp} | ${prevWeek?.trimp ?? "—"} |`,
    `| Sessions | ${overview.sessions} | ${prevWeek?.sessions ?? "—"} |`,
    `| WoW distance | ${fmtPct(overview.wow_distance_pct)} | — |`,
    ``,
    thisWeek
      ? `_Week bucket start ${thisWeek.week_start}._`
      : `_Week bucket from overview._`,
    ``,
    `## ACR / form`,
    ``,
    `- **Effort ACR:** ${overview.acr_trimp?.toFixed(2) ?? "—"} · ${zoneLabel(overview.acr_trimp_zone)}`,
    `- **Mileage ACR:** ${overview.acr_km?.toFixed(2) ?? "—"} · ${zoneLabel(overview.acr_km_zone)}`,
    `- **Alignment:** ${overview.alignment}`,
    `- **Form:** ${insights.form.form_label} (fitness ${insights.form.fitness} · fatigue ${insights.form.fatigue} · form ${insights.form.form >= 0 ? "+" : ""}${insights.form.form})`,
    ``,
    `## Recovery`,
    ``,
    `- **Sleep consistency:** ${insights.sleep_consistency.label}${sleepLine ? ` (${sleepLine})` : ""}`,
    `- **Recovery snapshot:** RHR ${recovery.resting_hr ?? "—"} · sleep score ${recovery.sleep_score ?? "—"} · recovery score ${recovery.recovery_score ?? "—"} · stress ${recovery.avg_stress ?? "—"}`,
    `- **Daily analyzer nights:** ${daily.days.filter((d) => d.sleep.total_hours).length} with sleep in lookback`,
    ``,
    `## Highlights`,
    ``,
    ...highlights.map((h) => `- ${h}`),
    ``,
    `## Risks`,
    ``,
    ...risks.map((r) => `- ${r}`),
    ``,
    `## Next-week targets`,
    ``,
    ...nextTargets.map((t) => `- ${t}`),
    ``,
  ];

  if (sources.length) {
    md.push(`## Sources`, ``);
    for (const s of sources) {
      md.push(`- [${s.title || s.url}](${s.url})`);
    }
    md.push(``);
  }

  md.push(
    `---`,
    ``,
    `_Deterministic brief from Training Lab builders. Not medical advice._`,
    ``,
  );

  const markdown = md.join("\n");
  const html = renderBriefHtml({
    asOf: overview.as_of,
    weekStart,
    weekEnd,
    tz,
    overview,
    insights,
    prevWeek: prevWeek
      ? {
          distance_km: prevWeek.distance_km,
          trimp: prevWeek.trimp,
          sessions: prevWeek.sessions,
        }
      : null,
    sleepLine,
    highlights,
    risks,
    nextTargets,
    sources,
    recovery,
  });

  const briefId = `weekly-${weekStart ?? overview.as_of}-${stampId()}`;
  await fs.mkdir(BRIEFS_DIR, { recursive: true });
  const pathMd = path.join(BRIEFS_DIR, `${briefId}.md`);
  const pathHtml = path.join(BRIEFS_DIR, `${briefId}.html`);
  const pathMeta = path.join(BRIEFS_DIR, `${briefId}.meta.json`);

  await Promise.all([
    fs.writeFile(pathMd, markdown, "utf8"),
    fs.writeFile(pathHtml, html, "utf8"),
    fs.writeFile(
      pathMeta,
      JSON.stringify(
        {
          brief_id: briefId,
          as_of: overview.as_of,
          week_start: weekStart,
          week_end: weekEnd,
          created_at: new Date().toISOString(),
          format_requested: format,
          path_md: pathMd,
          path_html: pathHtml,
        },
        null,
        2,
      ),
      "utf8",
    ),
  ]);

  const summary = `${insights.week_status_label} · ${overview.distance_km} km · TRIMP ${overview.trimp} · ${overview.sessions} sessions`;

  return {
    ok: true,
    brief_id: briefId,
    as_of: overview.as_of,
    week_start: weekStart,
    week_end: weekEnd,
    format,
    path_md: pathMd,
    path_html: pathHtml,
    download_md: `/api/briefs/${encodeURIComponent(briefId)}?format=md`,
    download_html: `/api/briefs/${encodeURIComponent(briefId)}?format=html`,
    summary,
    sections: [
      "as_of",
      "load_volume",
      "acr_form",
      "recovery",
      "highlights",
      "risks",
      "next_week",
      ...(sources.length ? ["sources"] : []),
    ],
    sources: sources.map((s) => ({ title: s.title, url: s.url })),
  };
}

function renderBriefHtml(opts: {
  asOf: string;
  weekStart: string | null;
  weekEnd: string | null;
  tz: string;
  overview: Awaited<ReturnType<typeof buildOverview>>;
  insights: Awaited<ReturnType<typeof buildOverviewDecision>>;
  prevWeek: {
    distance_km: number;
    trimp: number;
    sessions: number;
  } | null;
  sleepLine: string;
  highlights: string[];
  risks: string[];
  nextTargets: string[];
  sources: WeeklyBriefSource[];
  recovery: Awaited<ReturnType<typeof buildOverview>>["recovery"];
}): string {
  const {
    asOf,
    weekStart,
    weekEnd,
    tz,
    overview,
    insights,
    prevWeek,
    sleepLine,
    highlights,
    risks,
    nextTargets,
    sources,
    recovery,
  } = opts;

  const li = (items: string[]) =>
    items.map((i) => `<li>${escHtml(i)}</li>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Weekly Training Brief · ${escHtml(weekStart ?? asOf)}</title>
<style>
  :root { color-scheme: light; --ink:#0f172a; --mute:#64748b; --rule:#e2e8f0; --teal:#21918c; --mist:#f1f5f9; }
  body { margin:0; font:15px/1.5 system-ui,sans-serif; color:var(--ink); background:var(--mist); }
  main { max-width:720px; margin:0 auto; padding:2rem 1.25rem 3rem; background:#fff; border:1px solid var(--rule); }
  h1 { font-size:1.5rem; letter-spacing:-0.02em; margin:0 0 .5rem; }
  h2 { font-size:1rem; margin:1.75rem 0 .5rem; border-bottom:1px solid var(--rule); padding-bottom:.35rem; }
  .meta { color:var(--mute); font-size:.875rem; }
  table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
  th, td { text-align:left; padding:.4rem .5rem; border-bottom:1px solid var(--rule); }
  th { color:var(--mute); font-weight:500; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; }
  ul { margin:.4rem 0 0; padding-left:1.1rem; }
  .accent { color:var(--teal); }
  footer { margin-top:2rem; font-size:.75rem; color:var(--mute); }
</style>
</head>
<body>
<main>
  <h1>Weekly Training Brief</h1>
  <p class="meta">as_of <strong>${escHtml(asOf)}</strong> · week ${escHtml(weekStart ?? "—")} → ${escHtml(weekEnd ?? "—")} · ${escHtml(tz)} · generated ${escHtml(new Date().toISOString())}</p>

  <h2>Load &amp; volume</h2>
  <table>
    <thead><tr><th>Metric</th><th>This week</th><th>Prior week</th></tr></thead>
    <tbody>
      <tr><td>Distance</td><td>${overview.distance_km} km</td><td>${prevWeek ? `${prevWeek.distance_km} km` : "—"}</td></tr>
      <tr><td>TRIMP</td><td>${overview.trimp}</td><td>${prevWeek?.trimp ?? "—"}</td></tr>
      <tr><td>Sessions</td><td>${overview.sessions}</td><td>${prevWeek?.sessions ?? "—"}</td></tr>
      <tr><td>WoW distance</td><td>${escHtml(fmtPct(overview.wow_distance_pct))}</td><td>—</td></tr>
    </tbody>
  </table>

  <h2>ACR / form</h2>
  <ul>
    <li>Effort ACR: ${overview.acr_trimp?.toFixed(2) ?? "—"} · ${escHtml(zoneLabel(overview.acr_trimp_zone))}</li>
    <li>Mileage ACR: ${overview.acr_km?.toFixed(2) ?? "—"} · ${escHtml(zoneLabel(overview.acr_km_zone))}</li>
    <li>Alignment: ${escHtml(overview.alignment)}</li>
    <li>Form: <span class="accent">${escHtml(insights.form.form_label)}</span> (fitness ${insights.form.fitness} · fatigue ${insights.form.fatigue} · form ${insights.form.form >= 0 ? "+" : ""}${insights.form.form})</li>
  </ul>

  <h2>Recovery</h2>
  <ul>
    <li>Sleep consistency: ${escHtml(insights.sleep_consistency.label)}${sleepLine ? ` (${escHtml(sleepLine)})` : ""}</li>
    <li>RHR ${recovery.resting_hr ?? "—"} · sleep score ${recovery.sleep_score ?? "—"} · recovery ${recovery.recovery_score ?? "—"} · stress ${recovery.avg_stress ?? "—"}</li>
  </ul>

  <h2>Highlights</h2>
  <ul>${li(highlights)}</ul>

  <h2>Risks</h2>
  <ul>${li(risks)}</ul>

  <h2>Next-week targets</h2>
  <ul>${li(nextTargets)}</ul>

  ${
    sources.length
      ? `<h2>Sources</h2><ul>${sources
          .map(
            (s) =>
              `<li><a href="${escHtml(s.url)}">${escHtml(s.title || s.url)}</a></li>`,
          )
          .join("")}</ul>`
      : ""
  }

  <footer>Deterministic brief from Training Lab builders. Not medical advice.</footer>
</main>
</body>
</html>
`;
}

/** Resolve a brief file safely inside BRIEFS_DIR. */
export async function readBriefFile(
  briefId: string,
  format: "md" | "html",
): Promise<{ body: string; contentType: string; filename: string } | null> {
  const safe = path.basename(briefId);
  if (!safe || safe !== briefId || safe.includes("..")) return null;
  const ext = format === "html" ? "html" : "md";
  const filePath = path.join(BRIEFS_DIR, `${safe}.${ext}`);
  try {
    const body = await fs.readFile(filePath, "utf8");
    return {
      body,
      contentType:
        format === "html"
          ? "text/html; charset=utf-8"
          : "text/markdown; charset=utf-8",
      filename: `${safe}.${ext}`,
    };
  } catch {
    return null;
  }
}
