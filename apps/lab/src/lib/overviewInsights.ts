import type { DailyAnalyzerDay } from "./insights";
import type {
  ActivityRow,
  AcrPoint,
  LoadZone,
  OverviewPayload,
} from "./loadMath";
import { isoDate, round1 } from "./loadMath";
import { athleteTimeZone, localDayKey } from "./timezone";

/**
 * Overview-only decision cards — distinct from Load / Weekly / ACR / Best tabs.
 * Inspired by coach weekly scorecards (readiness + compliance + form/TSB framing)
 * without repeating deep ACR charts, recovery grids, or PR lists.
 * Refs: qbit.fit weekly KPIs, TrainingPeaks Form/TSB, RUNALYZE form curve.
 */
export type OverviewInsights = {
  week_status: "green" | "yellow" | "red";
  week_status_label: string;
  week_status_reason: string;
  next_action: string;
  consistency: {
    active_days_7: number;
    rest_days_7: number;
    active_days_28: number;
    sessions_this_week: number;
  };
  form: {
    fitness: number;
    fatigue: number;
    form: number;
    form_label: "Recharging" | "Fresh" | "Maintaining" | "Pushing" | "Fatigued" | "Unknown";
  };
  sleep_consistency: {
    nights: number;
    avg_hours: number | null;
    avg_score: number | null;
    hours_spread: number | null;
    label: string;
  };
};

function formLabel(tsb: number | null): OverviewInsights["form"]["form_label"] {
  if (tsb == null || !Number.isFinite(tsb)) return "Unknown";
  // TrainingPeaks-style bands, scaled loosely to TRIMP units (not TSS).
  if (tsb >= 40) return "Recharging";
  if (tsb >= 10) return "Fresh";
  if (tsb >= -15) return "Maintaining";
  if (tsb >= -45) return "Pushing";
  return "Fatigued";
}

function zoneSeverity(z: LoadZone): number {
  switch (z) {
    case "high_risk":
      return 3;
    case "caution":
      return 2;
    case "undertraining":
      return 1;
    case "optimal":
      return 0;
    default:
      return 1;
  }
}

export function buildOverviewInsights(opts: {
  overview: OverviewPayload;
  activities: ActivityRow[];
  acrTrimp: AcrPoint[];
  dailyDays: DailyAnalyzerDay[];
  asOf: Date;
}): OverviewInsights {
  const { overview, activities, acrTrimp, dailyDays, asOf } = opts;
  const tz = athleteTimeZone();
  const daySet7 = new Set<string>();
  const daySet28 = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(asOf);
    d.setUTCDate(d.getUTCDate() - i);
    daySet7.add(localDayKey(d, tz) || isoDate(d));
  }
  for (let i = 0; i < 28; i++) {
    const d = new Date(asOf);
    d.setUTCDate(d.getUTCDate() - i);
    daySet28.add(localDayKey(d, tz) || isoDate(d));
  }

  const active7 = new Set<string>();
  const active28 = new Set<string>();
  for (const a of activities) {
    const key = a.date ? localDayKey(a.date, tz) : "";
    if (!key) continue;
    if (daySet7.has(key)) active7.add(key);
    if (daySet28.has(key)) active28.add(key);
  }

  const cur = acrTrimp[acrTrimp.length - 1] ?? null;
  const fitness = cur ? round1(cur.chronic) : 0;
  const fatigue = cur ? round1(cur.acute) : 0;
  const formVal = cur ? round1(cur.chronic - cur.acute) : 0;
  const fLabel = formLabel(cur ? cur.chronic - cur.acute : null);

  const sleepNights = dailyDays.filter(
    (d) => d.sleep.total_hours != null && d.sleep.total_hours > 0,
  );
  const hours = sleepNights.map((d) => d.sleep.total_hours as number);
  const scores = sleepNights
    .map((d) => d.sleep.sleep_score)
    .filter((s): s is number => typeof s === "number");
  const avgHours =
    hours.length > 0
      ? round1(hours.reduce((s, h) => s + h, 0) / hours.length)
      : null;
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
      : null;
  const hoursSpread =
    hours.length >= 2 ? round1(Math.max(...hours) - Math.min(...hours)) : null;

  let sleepLabel = "Need more sleep nights";
  if (avgHours != null && hoursSpread != null) {
    if (avgHours >= 7 && hoursSpread <= 1.5) sleepLabel = "Stable sleep";
    else if (avgHours >= 6.5 && hoursSpread <= 2.5) sleepLabel = "Mostly steady";
    else if (avgHours < 6) sleepLabel = "Short sleep week";
    else sleepLabel = "Variable sleep";
  } else if (avgHours != null) {
    sleepLabel = avgHours >= 7 ? "Adequate average" : "Below 7h average";
  }

  const sev = Math.max(
    zoneSeverity(overview.acr_trimp_zone),
    zoneSeverity(overview.acr_km_zone),
  );
  const sleepWeak =
    (avgHours != null && avgHours < 6.5) ||
    (avgScore != null && avgScore < 70) ||
    (hoursSpread != null && hoursSpread > 2.5);
  const consistencyWeak = active7.size <= 2 && overview.sessions <= 2;
  const wowDrop = (overview.wow_distance_pct ?? 0) < -25;
  const formHard = fLabel === "Fatigued" || fLabel === "Pushing";

  let flags = 0;
  if (sev >= 3) flags += 2;
  else if (sev === 2) flags += 1;
  if (sleepWeak) flags += 1;
  if (consistencyWeak) flags += 1;
  if (wowDrop && sev >= 2) flags += 1;
  if (formHard && sleepWeak) flags += 1;

  let week_status: OverviewInsights["week_status"] = "green";
  let week_status_label = "On track";
  if (flags >= 3) {
    week_status = "red";
    week_status_label = "Needs attention";
  } else if (flags >= 1) {
    week_status = "yellow";
    week_status_label = "Watch closely";
  }

  const reasons: string[] = [];
  if (sev >= 2)
    reasons.push(
      `load zone ${overview.acr_trimp_zone.replaceAll("_", " ")}`,
    );
  if (sleepWeak) reasons.push(sleepLabel.toLowerCase());
  if (consistencyWeak) reasons.push("low training frequency this week");
  if (formHard) reasons.push(`form ${fLabel.toLowerCase()}`);
  if (wowDrop) reasons.push("sharp volume drop vs prior week");
  if (!reasons.length) {
    reasons.push(
      overview.alignment.toLowerCase().includes("aligned")
        ? "volume and intensity aligned"
        : "metrics within a manageable band",
    );
  }
  const week_status_reason = reasons.slice(0, 3).join(" · ");

  let next_action: string;
  if (week_status === "red") {
    next_action =
      "Prioritize easy or rest until sleep and acute load settle — avoid stacking another hard day.";
  } else if (week_status === "yellow") {
    next_action =
      "Keep one quality session if you feel good; protect sleep and cap junk miles.";
  } else if (fLabel === "Fresh" || fLabel === "Recharging") {
    next_action =
      "Good window for a key session if the plan calls for it — fitness is available.";
  } else {
    next_action =
      "Continue progressive training; check Daily Analyzer tomorrow for sleep after today's load.";
  }

  return {
    week_status,
    week_status_label,
    week_status_reason,
    next_action,
    consistency: {
      active_days_7: active7.size,
      rest_days_7: Math.max(0, 7 - active7.size),
      active_days_28: active28.size,
      sessions_this_week: overview.sessions,
    },
    form: {
      fitness,
      fatigue,
      form: formVal,
      form_label: fLabel,
    },
    sleep_consistency: {
      nights: sleepNights.length,
      avg_hours: avgHours,
      avg_score: avgScore,
      hours_spread: hoursSpread,
      label: sleepLabel,
    },
  };
}
