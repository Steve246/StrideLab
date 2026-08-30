/**
 * Banister TRIMP (1991) — internal training load from duration × HR reserve.
 * Prefer this over Garmin Training Effect (0–5), which is session *effect*, not load units.
 *
 * TRIMP = t_min * HR_ratio * 0.64 * exp(k * HR_ratio)
 * HR_ratio = (HR_avg - HR_rest) / (HR_max - HR_rest)
 * k = 1.92 (male) | 1.67 (female)
 *
 * HR profile resolution order (per field):
 * 1) .env ATHLETE_HR_REST / ATHLETE_HR_MAX / ATHLETE_SEX (if set and non-empty)
 * 2) Derived from synced Garmin data (daily RHR, activity max_hr)
 * 3) Safe defaults (50 / 190)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { ENRICHMENT_DIR } from "../providers/dataDirectory.js";

export type AthleteHrProfile = {
  hr_rest: number;
  hr_max: number;
  /** Banister exponential coefficient */
  k: number;
  source: string;
  /** Whether rest/max came from env vs data vs default */
  hr_rest_from: "env" | "garmin_daily" | "default";
  hr_max_from: "env" | "garmin_activities" | "default";
};

export function banisterKFromSex(sex?: string | null): number {
  const s = (sex ?? envString("ATHLETE_SEX") ?? "male").toLowerCase();
  return s.startsWith("f") ? 1.67 : 1.92;
}

/** Empty / blank env counts as unset so Garmin data can fill in. */
function envString(key: string): string | null {
  const v = process.env[key];
  if (v == null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function numEnv(key: string): number | null {
  const v = envString(key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve athlete HR for TRIMP.
 * Configure in .env when you want a fixed profile; leave empty to use Garmin sync data.
 */
export function resolveAthleteHrProfile(opts: {
  dailyRhrValues?: number[];
  /** ISO date + max_hr pairs preferred for recent-window HRmax */
  activityMaxHrs?: number[];
  activityMaxHrSamples?: { date: string; max_hr: number }[];
}): AthleteHrProfile {
  const envRest = numEnv("ATHLETE_HR_REST");
  const envMax = numEnv("ATHLETE_HR_MAX");
  const k = banisterKFromSex();

  const rhrFromDaily = median(
    (opts.dailyRhrValues ?? []).filter((n) => n >= 30 && n <= 100),
  );

  const maxFromActs = deriveHrMaxFromActivities(
    opts.activityMaxHrSamples,
    opts.activityMaxHrs,
  );

  let hr_rest: number;
  let hr_rest_from: AthleteHrProfile["hr_rest_from"];
  if (envRest != null) {
    hr_rest = envRest;
    hr_rest_from = "env";
  } else if (rhrFromDaily != null) {
    hr_rest = Math.round(rhrFromDaily);
    hr_rest_from = "garmin_daily";
  } else {
    hr_rest = 50;
    hr_rest_from = "default";
  }

  let hr_max: number;
  let hr_max_from: AthleteHrProfile["hr_max_from"];
  if (envMax != null) {
    hr_max = envMax;
    hr_max_from = "env";
  } else if (maxFromActs != null) {
    hr_max = maxFromActs;
    hr_max_from = "garmin_activities";
  } else {
    hr_max = 190;
    hr_max_from = "default";
  }

  hr_max = Math.max(hr_max, hr_rest + 40);

  const sources: string[] = [
    `rest:${hr_rest_from}=${hr_rest}`,
    `max:${hr_max_from}=${hr_max}`,
    `k:${k}`,
  ];

  return {
    hr_rest,
    hr_max,
    k,
    source: sources.join(","),
    hr_rest_from,
    hr_max_from,
  };
}

/** Prefer ~95th percentile of max_hr in last 180 days (avoids one-off spikes). */
function deriveHrMaxFromActivities(
  samples?: { date: string; max_hr: number }[],
  flat?: number[],
): number | null {
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const fromSamples = (samples ?? [])
    .filter((s) => {
      const t = Date.parse(s.date);
      return (
        !Number.isNaN(t) &&
        t >= cutoff &&
        s.max_hr >= 120 &&
        s.max_hr <= 220
      );
    })
    .map((s) => s.max_hr);

  const pool =
    fromSamples.length > 0
      ? fromSamples
      : (flat ?? []).filter((n) => n >= 120 && n <= 220);

  if (pool.length === 0) return null;
  return Math.round(percentile(pool, 0.95));
}

export async function loadDailyRhrValues(): Promise<number[]> {
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(ENRICHMENT_DIR, "daily.json"), "utf8"),
    ) as {
      days?: { calendarDate?: string; restingHeartRate?: number | null }[];
    };
    const days = Array.isArray(raw.days) ? raw.days : [];
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const cut = cutoff.toISOString().slice(0, 10);
    return days
      .filter((d) => (d.calendarDate ?? "") >= cut)
      .map((d) => d.restingHeartRate)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  } catch {
    return [];
  }
}

/** Persist resolved profile for dashboard / debugging (not used as override). */
export async function saveAthleteHrProfile(
  profile: AthleteHrProfile,
): Promise<string> {
  await fs.mkdir(ENRICHMENT_DIR, { recursive: true });
  const out = path.join(ENRICHMENT_DIR, "athlete_hr.json");
  await fs.writeFile(
    out,
    JSON.stringify(
      {
        updated_at: new Date().toISOString(),
        hr_rest: profile.hr_rest,
        hr_max: profile.hr_max,
        k: profile.k,
        hr_rest_from: profile.hr_rest_from,
        hr_max_from: profile.hr_max_from,
        source: profile.source,
        note:
          "Auto-filled from Garmin sync when ATHLETE_HR_REST / ATHLETE_HR_MAX are empty in .env. Set those env vars to override.",
      },
      null,
      2,
    ),
  );
  return out;
}

/** Session Banister TRIMP, or null if HR/duration insufficient. */
export function computeBanisterTrimp(
  durationMin: number,
  avgHr: number | null | undefined,
  profile: AthleteHrProfile,
): number | null {
  if (
    durationMin <= 0 ||
    avgHr == null ||
    !Number.isFinite(avgHr) ||
    avgHr <= profile.hr_rest
  ) {
    return null;
  }
  const span = profile.hr_max - profile.hr_rest;
  if (span <= 0) return null;
  const ratio = Math.min(1, Math.max(0, (avgHr - profile.hr_rest) / span));
  if (ratio <= 0) return null;
  const trimp = durationMin * ratio * 0.64 * Math.exp(profile.k * ratio);
  return Math.round(trimp * 10) / 10;
}

export type LoadWindows = {
  as_of: string;
  acute_7d: {
    distance_km: number;
    duration_min: number;
    elevation_gain_m: number;
    load_score: number | null;
    sessions: number;
  };
  chronic_28d: {
    distance_km: number;
    duration_min: number;
    elevation_gain_m: number;
    avg_weekly_distance_km: number;
    load_score: number | null;
    sessions: number;
  };
  acute_chronic_ratio: number | null;
  trend: "rising" | "stable" | "falling";
  risk_flags: string[];
  projection_next_4_weeks: {
    week_start: string;
    conservative_km: number;
    expected_km: number;
    aggressive_km: number;
    notes: string;
  }[];
  summary: string;
  method: string;
  athlete_hr: AthleteHrProfile;
};

type ActLike = {
  date?: string;
  distance_km?: number;
  duration_min?: number;
  elevation_gain_m?: number | null;
  trimp?: number | null;
  load_score?: number | null;
  aerobic_te?: number | null;
};

function sessionLoad(a: ActLike): number {
  if (typeof a.trimp === "number" && Number.isFinite(a.trimp)) return a.trimp;
  if (typeof a.load_score === "number" && Number.isFinite(a.load_score)) {
    return a.load_score;
  }
  return 0;
}

export function computeLoadWindows(
  activities: ActLike[],
  profile: AthleteHrProfile,
  now = new Date(),
): LoadWindows {
  const asOf = now.toISOString().slice(0, 10);
  const msDay = 24 * 60 * 60 * 1000;
  const t0 = now.getTime();

  const inWindow = (days: number) =>
    activities.filter((a) => {
      const t = Date.parse(a.date ?? "");
      return !Number.isNaN(t) && t >= t0 - days * msDay && t <= t0;
    });

  const sum = (rows: ActLike[]) => {
    let distance = 0;
    let duration = 0;
    let elev = 0;
    let load = 0;
    let loadN = 0;
    for (const a of rows) {
      distance += typeof a.distance_km === "number" ? a.distance_km : 0;
      duration += typeof a.duration_min === "number" ? a.duration_min : 0;
      elev += typeof a.elevation_gain_m === "number" ? a.elevation_gain_m : 0;
      const l = sessionLoad(a);
      if (l > 0) {
        load += l;
        loadN += 1;
      }
    }
    return {
      distance_km: round(distance, 1),
      duration_min: round(duration, 1),
      elevation_gain_m: round(elev, 1),
      load_score: loadN > 0 ? round(load, 1) : null,
      sessions: rows.length,
    };
  };

  const acuteRows = inWindow(7);
  const chronicRows = inWindow(28);
  const acute = sum(acuteRows);
  const chronic = sum(chronicRows);
  const avgWeeklyKm = round(chronic.distance_km / 4, 1);
  const chronicWeeklyLoad =
    chronic.load_score != null ? round(chronic.load_score / 4, 1) : null;

  let acute_chronic_ratio: number | null = null;
  if (
    acute.load_score != null &&
    chronicWeeklyLoad != null &&
    chronicWeeklyLoad > 0
  ) {
    acute_chronic_ratio = round(acute.load_score / chronicWeeklyLoad, 2);
  }

  const weekLoads: number[] = [];
  for (let w = 0; w < 4; w++) {
    const end = t0 - w * 7 * msDay;
    const start = end - 7 * msDay;
    const rows = activities.filter((a) => {
      const t = Date.parse(a.date ?? "");
      return !Number.isNaN(t) && t >= start && t < end;
    });
    weekLoads.push(sum(rows).distance_km);
  }
  // weekLoads[0]=most recent week
  const recent = weekLoads[0] ?? 0;
  const prior = weekLoads[1] ?? 0;
  let trend: LoadWindows["trend"] = "stable";
  if (prior > 0 && recent > prior * 1.1) trend = "rising";
  else if (prior > 0 && recent < prior * 0.9) trend = "falling";

  const risk_flags: string[] = [];
  if (acute_chronic_ratio != null && acute_chronic_ratio > 1.5) {
    risk_flags.push(
      `High acute:chronic TRIMP ratio (${acute_chronic_ratio}) — spike risk`,
    );
  }
  if (acute_chronic_ratio != null && acute_chronic_ratio < 0.8) {
    risk_flags.push(
      `Low acute:chronic TRIMP ratio (${acute_chronic_ratio}) — underloading vs chronic`,
    );
  }
  if (prior > 0 && recent > prior * 1.3) {
    risk_flags.push(
      `Weekly distance jump >30% (${prior} → ${recent} km)`,
    );
  }
  const hardTe = acuteRows.filter(
    (a) => typeof a.aerobic_te === "number" && a.aerobic_te >= 4,
  ).length;
  if (hardTe >= 3) {
    risk_flags.push(`${hardTe} sessions with aerobic TE ≥ 4 in last 7 days`);
  }

  const base = avgWeeklyKm > 0 ? avgWeeklyKm : recent;
  const monday = mondayUtc(now);
  const projection_next_4_weeks = [0, 1, 2, 3].map((i) => {
    const week_start = isoDate(addDays(monday, i * 7));
    const conservative = round(base * 0.9, 1);
    const expected = round(base, 1);
    const aggressive = round(Math.min(base * 1.1, base + 5), 1);
    return {
      week_start,
      conservative_km: conservative,
      expected_km: expected,
      aggressive_km: aggressive,
      notes:
        i === 0
          ? "Hold near chronic average; prefer TRIMP ACWR ~0.8–1.3"
          : "Progress only if recovery and ACWR stay in range",
    };
  });

  const summary = [
    `Load method: Banister TRIMP (HR×duration). Profile: RHR ${profile.hr_rest}, HRmax ${profile.hr_max} (${profile.source}).`,
    `Acute 7d: ${acute.distance_km} km, TRIMP ${acute.load_score ?? "n/a"}; chronic 28d avg ${avgWeeklyKm} km/wk, weekly TRIMP ~${chronicWeeklyLoad ?? "n/a"}.`,
    `ACWR: ${acute_chronic_ratio ?? "n/a"} (${trend}).`,
    risk_flags.length
      ? `Flags: ${risk_flags.join("; ")}.`
      : "No major load-spike flags.",
  ].join(" ");

  return {
    as_of: asOf,
    acute_7d: acute,
    chronic_28d: {
      distance_km: chronic.distance_km,
      duration_min: chronic.duration_min,
      elevation_gain_m: chronic.elevation_gain_m,
      avg_weekly_distance_km: avgWeeklyKm,
      load_score: chronicWeeklyLoad,
      sessions: chronic.sessions,
    },
    acute_chronic_ratio,
    trend,
    risk_flags,
    projection_next_4_weeks,
    summary,
    method: "banister_trimp",
    athlete_hr: profile,
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function mondayUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
