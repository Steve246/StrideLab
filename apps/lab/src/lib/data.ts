import fs from "node:fs/promises";
import path from "node:path";
import {
  ACTIVITIES_FILE,
  ENRICHMENT_DIR,
} from "./paths";
import {
  type ActivityRow,
  type AcrPoint,
  type ForecastWeek,
  type HrvWeek,
  type OverviewPayload,
  type RecoverySnapshot,
  type WeekBucket,
  alignmentLabel,
  buildAcrSeries,
  buildForecastSeries,
  buildWeeklyHrv,
  buildWeeklySeries,
  isoDate,
  resolveAsOf,
  round1,
  zoneLabel,
} from "./loadMath";
import {
  buildDailyAnalyzerDays,
  buildYourBest,
  type DailyAnalyzerDay,
  type YourBestPayload,
} from "./insights";
import {
  buildOverviewInsights,
  type OverviewInsights,
} from "./overviewInsights";

export type { OverviewInsights };

export async function readActivities(): Promise<ActivityRow[]> {
  try {
    const text = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const payload = JSON.parse(text) as { activities?: ActivityRow[] };
    return Array.isArray(payload.activities) ? payload.activities : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function readLastSync(): Promise<string | null> {
  try {
    const text = await fs.readFile(path.join(ENRICHMENT_DIR, "meta.json"), "utf8");
    const meta = JSON.parse(text) as { updated_at?: string };
    return typeof meta.updated_at === "string" ? meta.updated_at : null;
  } catch {
    return null;
  }
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function buildRecoverySnapshot(): Promise<RecoverySnapshot> {
  const daily = await readJsonFile<{
    days?: Array<{
      calendarDate?: string;
      restingHeartRate?: number;
      bodyBatteryHigh?: number;
      bodyBatteryLow?: number;
      avgStress?: number;
    }>;
  }>(path.join(ENRICHMENT_DIR, "daily.json"));

  const sleep = await readJsonFile<{
    days?: Array<{
      calendarDate?: string;
      totalSleepSeconds?: number;
      overallSleepScore?: number;
      recoveryScore?: number;
    }>;
  }>(path.join(ENRICHMENT_DIR, "sleep.json"));

  const d = daily?.days?.[0];
  const s =
    sleep?.days?.find((x) => x.calendarDate === d?.calendarDate) ??
    sleep?.days?.[0];

  return {
    date: d?.calendarDate ?? s?.calendarDate ?? null,
    resting_hr:
      typeof d?.restingHeartRate === "number" ? d.restingHeartRate : null,
    body_battery_high:
      typeof d?.bodyBatteryHigh === "number" ? d.bodyBatteryHigh : null,
    body_battery_low:
      typeof d?.bodyBatteryLow === "number" ? d.bodyBatteryLow : null,
    avg_stress: typeof d?.avgStress === "number" ? d.avgStress : null,
    sleep_hours:
      typeof s?.totalSleepSeconds === "number"
        ? round1(s.totalSleepSeconds / 3600)
        : null,
    sleep_score:
      typeof s?.overallSleepScore === "number" ? s.overallSleepScore : null,
    recovery_score:
      typeof s?.recoveryScore === "number" ? s.recoveryScore : null,
  };
}

function longestRun28d(activities: ActivityRow[], asOf: Date): number | null {
  const start = asOf.getTime() - 28 * 24 * 60 * 60 * 1000;
  let max = 0;
  for (const a of activities) {
    const t = Date.parse(a.date ?? "");
    if (Number.isNaN(t) || t < start || t > asOf.getTime()) continue;
    const km = typeof a.distance_km === "number" ? a.distance_km : 0;
    if (km > max) max = km;
  }
  return max > 0 ? round1(max) : null;
}

export async function buildOverview(weeks = 12): Promise<OverviewPayload> {
  const activities = await readActivities();
  const asOf = resolveAsOf(activities);
  const weekly = buildWeeklySeries(activities, weeks, asOf);
  const last = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];
  const forecast = buildForecastSeries(weekly, asOf, 4);
  const next = forecast.find((f) => f.kind === "forecast");
  const acrKm = buildAcrSeries(activities, weeks, "km", asOf);
  const acrTrimp = buildAcrSeries(activities, weeks, "trimp", asOf);
  const curKm = acrKm[acrKm.length - 1];
  const curTrimp = acrTrimp[acrTrimp.length - 1];
  const efficiency =
    last && last.distance_km > 0.05
      ? round1(last.trimp / last.distance_km)
      : null;

  let wow: number | null = null;
  if (last && prev && prev.distance_km > 0.05) {
    wow = round1(
      ((last.distance_km - prev.distance_km) / prev.distance_km) * 100,
    );
  }

  return {
    as_of: isoDate(asOf),
    last_sync: await readLastSync(),
    week_start: last?.week_start ?? null,
    distance_km: last?.distance_km ?? 0,
    trimp: last?.trimp ?? 0,
    sessions: last?.sessions ?? 0,
    elevation_gain_m: last?.elevation_gain_m ?? 0,
    avg_pace_min_per_km: last?.avg_pace_min_per_km ?? null,
    avg_hr: last?.avg_hr ?? null,
    efficiency_trimp_per_km: efficiency,
    wow_distance_pct: wow,
    longest_run_28d_km: longestRun28d(activities, asOf),
    acr_km: curKm?.acr ?? null,
    acr_km_zone: curKm?.zone ?? "unknown",
    acr_trimp: curTrimp?.acr ?? null,
    acr_trimp_zone: curTrimp?.zone ?? "unknown",
    alignment: alignmentLabel(curKm?.acr ?? null, curTrimp?.acr ?? null),
    activity_count: activities.length,
    forecast_next_week_km: next?.expected_km ?? null,
    forecast_next_week_trimp: next?.expected_trimp ?? null,
    recovery: await buildRecoverySnapshot(),
  };
}

export async function buildWeekly(weeks = 12): Promise<{
  as_of: string;
  weeks: WeekBucket[];
  forecast: ForecastWeek[];
  hrv: HrvWeek[];
}> {
  const activities = await readActivities();
  const asOf = resolveAsOf(activities);
  const weekly = buildWeeklySeries(activities, weeks, asOf);
  const health = await readJsonFile<{
    days?: Array<{
      calendarDate?: string;
      metrics?: Array<{
        type?: string;
        value?: number | null;
        status?: string | null;
      }>;
    }>;
  }>(path.join(ENRICHMENT_DIR, "health_status.json"));

  return {
    as_of: isoDate(asOf),
    weeks: weekly,
    forecast: buildForecastSeries(weekly, asOf, 4),
    hrv: buildWeeklyHrv(health?.days ?? [], weeks, asOf),
  };
}

export async function buildAcr(weeks = 12): Promise<{
  as_of: string;
  km: AcrPoint[];
  trimp: AcrPoint[];
  current: {
    km: AcrPoint | null;
    trimp: AcrPoint | null;
    alignment: string;
    km_zone_label: string;
    trimp_zone_label: string;
  };
}> {
  const activities = await readActivities();
  const asOf = resolveAsOf(activities);
  const km = buildAcrSeries(activities, weeks, "km", asOf);
  const trimp = buildAcrSeries(activities, weeks, "trimp", asOf);
  const curKm = km[km.length - 1] ?? null;
  const curTrimp = trimp[trimp.length - 1] ?? null;
  return {
    as_of: isoDate(asOf),
    km,
    trimp,
    current: {
      km: curKm,
      trimp: curTrimp,
      alignment: alignmentLabel(curKm?.acr ?? null, curTrimp?.acr ?? null),
      km_zone_label: zoneLabel(curKm?.zone ?? "unknown"),
      trimp_zone_label: zoneLabel(curTrimp?.zone ?? "unknown"),
    },
  };
}

export async function listRecentActivities(limit = 50): Promise<{
  as_of: string;
  activities: ActivityRow[];
}> {
  const activities = await readActivities();
  const asOf = resolveAsOf(activities);
  const sorted = [...activities].sort((a, b) => {
    const ta = Date.parse(a.date ?? "") || 0;
    const tb = Date.parse(b.date ?? "") || 0;
    return tb - ta;
  });
  return {
    as_of: isoDate(asOf),
    activities: sorted.slice(0, Math.min(Math.max(limit, 1), 200)),
  };
}

export function parseWeeks(raw: string | null, fallback = 12): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(26, Math.max(4, Math.round(n)));
}

export function parseLimit(raw: string | null, fallback = 50): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(1, Math.round(n)));
}

export function parseDays(raw: string | null, fallback = 7): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(28, Math.max(1, Math.round(n)));
}

async function readSleepDays() {
  const sleep = await readJsonFile<{
    days?: Array<{
      calendarDate?: string;
      deepSleepSeconds?: number;
      lightSleepSeconds?: number;
      remSleepSeconds?: number;
      awakeSleepSeconds?: number;
      totalSleepSeconds?: number;
      overallSleepScore?: number;
      recoveryScore?: number;
    }>;
  }>(path.join(ENRICHMENT_DIR, "sleep.json"));
  return sleep?.days ?? [];
}

async function readDailyDays() {
  const daily = await readJsonFile<{
    days?: Array<{
      calendarDate?: string;
      restingHeartRate?: number;
      totalSteps?: number;
      avgStress?: number;
      bodyBatteryHigh?: number;
      bodyBatteryLow?: number;
    }>;
  }>(path.join(ENRICHMENT_DIR, "daily.json"));
  return daily?.days ?? [];
}

export async function buildDailyAnalyzer(days = 7): Promise<{
  as_of: string;
  days: DailyAnalyzerDay[];
}> {
  const activities = await readActivities();
  const asOf = resolveAsOf(activities);
  const [sleepDays, dailyDays] = await Promise.all([
    readSleepDays(),
    readDailyDays(),
  ]);
  return {
    as_of: isoDate(asOf),
    days: buildDailyAnalyzerDays({
      activities,
      sleepDays,
      dailyDays,
      asOf,
      days,
    }),
  };
}

/** Overview-tab decision cards — not used on Load / Weekly / ACR / Best. */
export async function buildOverviewDecision(
  weeks = 12,
  sleepLookbackDays = 7,
): Promise<OverviewInsights> {
  const activities = await readActivities();
  const asOf = resolveAsOf(activities);
  const weekly = buildWeeklySeries(activities, weeks, asOf);
  const last = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];
  const forecast = buildForecastSeries(weekly, asOf, 4);
  const next = forecast.find((f) => f.kind === "forecast");
  const acrKm = buildAcrSeries(activities, weeks, "km", asOf);
  const acrTrimp = buildAcrSeries(activities, weeks, "trimp", asOf);
  const curKm = acrKm[acrKm.length - 1];
  const curTrimp = acrTrimp[acrTrimp.length - 1];

  let wow: number | null = null;
  if (last && prev && prev.distance_km > 0.05) {
    wow = round1(
      ((last.distance_km - prev.distance_km) / prev.distance_km) * 100,
    );
  }

  const overviewLite: OverviewPayload = {
    as_of: isoDate(asOf),
    last_sync: null,
    week_start: last?.week_start ?? null,
    distance_km: last?.distance_km ?? 0,
    trimp: last?.trimp ?? 0,
    sessions: last?.sessions ?? 0,
    elevation_gain_m: last?.elevation_gain_m ?? 0,
    avg_pace_min_per_km: last?.avg_pace_min_per_km ?? null,
    avg_hr: last?.avg_hr ?? null,
    efficiency_trimp_per_km: null,
    wow_distance_pct: wow,
    longest_run_28d_km: null,
    acr_km: curKm?.acr ?? null,
    acr_km_zone: curKm?.zone ?? "unknown",
    acr_trimp: curTrimp?.acr ?? null,
    acr_trimp_zone: curTrimp?.zone ?? "unknown",
    alignment: alignmentLabel(curKm?.acr ?? null, curTrimp?.acr ?? null),
    activity_count: activities.length,
    forecast_next_week_km: next?.expected_km ?? null,
    forecast_next_week_trimp: next?.expected_trimp ?? null,
    recovery: {
      date: null,
      resting_hr: null,
      sleep_hours: null,
      sleep_score: null,
      recovery_score: null,
      avg_stress: null,
      body_battery_high: null,
      body_battery_low: null,
    },
  };

  const [sleepDays, dailyDays] = await Promise.all([
    readSleepDays(),
    readDailyDays(),
  ]);
  const analyzerDays = buildDailyAnalyzerDays({
    activities,
    sleepDays,
    dailyDays,
    asOf,
    days: sleepLookbackDays,
  });

  return buildOverviewInsights({
    overview: overviewLite,
    activities,
    acrTrimp,
    dailyDays: analyzerDays,
    asOf,
  });
}

export async function buildYourBestPayload(): Promise<YourBestPayload> {
  const activities = await readActivities();
  const asOf = resolveAsOf(activities);
  const [sleepDays, dailyDays] = await Promise.all([
    readSleepDays(),
    readDailyDays(),
  ]);
  return buildYourBest({ activities, sleepDays, dailyDays, asOf });
}
