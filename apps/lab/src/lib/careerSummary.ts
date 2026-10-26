import type { ActivityRow } from "./loadMath";
import { round1 } from "./loadMath";

const EVEREST_M = 8849;

export type MonthHours = { month: string; hours: number };
export type SportHours = { sport: string; hours: number };
export type TrendPoint = { date: string; value: number };

export type CareerSummary = {
  since: string | null;
  activities: number;
  distance_km: number;
  hours: number;
  elevation_m: number;
  everests: number;
  sports: SportHours[];
  months: MonthHours[];
  rhr: TrendPoint[];
  rhr_now: number | null;
  rhr_early: number | null;
  sleep_hours: TrendPoint[];
  hrv: TrendPoint[];
  hrv_low: number | null;
  hrv_high: number | null;
  highlights: { title: string; value: string; detail: string }[];
  reads_only: string[];
  cannot: string[];
};

type DailyRow = {
  calendarDate?: string;
  restingHeartRate?: number | null;
  totalSteps?: number | null;
};

type SleepRow = {
  calendarDate?: string;
  totalSleepSeconds?: number | null;
};

type HealthRow = {
  calendarDate?: string;
  metrics?: Array<{ type?: string; value?: number | null }>;
};

function monthKey(iso: string): string | null {
  const d = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(d) ? d : null;
}

function lastN<T>(rows: T[], n: number): T[] {
  return rows.length > n ? rows.slice(rows.length - n) : rows;
}

/** Career + body + sleep view from files Lab already stores. */
export function buildCareerSummary(opts: {
  activities: ActivityRow[];
  daily: DailyRow[];
  sleep: SleepRow[];
  health: HealthRow[];
}): CareerSummary {
  const acts = opts.activities;
  const dates = acts.map((a) => a.date).filter((d): d is string => Boolean(d)).sort();
  let distance = 0;
  let minutes = 0;
  let elev = 0;
  const sportMin = new Map<string, number>();
  const monthMin = new Map<string, number>();

  let longestKm: ActivityRow | null = null;
  let longestMin: ActivityRow | null = null;
  let mostClimb: ActivityRow | null = null;

  for (const a of acts) {
    const km = a.distance_km ?? 0;
    const min = a.duration_min ?? 0;
    const gain = a.elevation_gain_m ?? 0;
    distance += km;
    minutes += min;
    elev += typeof gain === "number" ? gain : 0;
    const sport = a.sport || "other";
    sportMin.set(sport, (sportMin.get(sport) ?? 0) + min);
    const mk = a.date ? monthKey(a.date) : null;
    if (mk) monthMin.set(mk, (monthMin.get(mk) ?? 0) + min);
    if (!longestKm || km > (longestKm.distance_km ?? 0)) longestKm = a;
    if (!longestMin || min > (longestMin.duration_min ?? 0)) longestMin = a;
    if (!mostClimb || gain > (mostClimb.elevation_gain_m ?? 0)) mostClimb = a;
  }

  const months = [...monthMin.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([month, m]) => ({ month, hours: round1(m / 60) }));

  const sports = [...sportMin.entries()]
    .map(([sport, m]) => ({ sport, hours: round1(m / 60) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);

  const rhrAll = opts.daily
    .filter((d) => d.calendarDate && typeof d.restingHeartRate === "number")
    .map((d) => ({ date: d.calendarDate!, value: d.restingHeartRate! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const sleepAll = opts.sleep
    .filter((d) => d.calendarDate && typeof d.totalSleepSeconds === "number")
    .map((d) => ({
      date: d.calendarDate!,
      value: round1(d.totalSleepSeconds! / 3600),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hrvAll = opts.health
    .map((d) => {
      const h = d.metrics?.find((m) => m.type === "HRV");
      if (!d.calendarDate || typeof h?.value !== "number") return null;
      return { date: d.calendarDate, value: h.value };
    })
    .filter((p): p is TrendPoint => Boolean(p))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentHrv = hrvAll.slice(-90).map((p) => p.value).sort((a, b) => a - b);
  const band = (arr: number[], q: number) =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))]! : null;

  const card = (title: string, a: ActivityRow | null, value: string) =>
    a
      ? { title, value, detail: `${a.sport ?? "activity"} · ${a.date ?? ""}` }
      : { title, value: "—", detail: "Sync more activities" };

  return {
    since: dates[0]?.slice(0, 10) ?? null,
    activities: acts.length,
    distance_km: round1(distance),
    hours: round1(minutes / 60),
    elevation_m: Math.round(elev),
    everests: round1(elev / EVEREST_M),
    sports,
    months,
    rhr: lastN(rhrAll, 90),
    rhr_now: rhrAll.at(-1)?.value ?? null,
    rhr_early: rhrAll[0]?.value ?? null,
    sleep_hours: lastN(sleepAll, 90),
    hrv: lastN(hrvAll, 90),
    hrv_low: band(recentHrv, 0.25),
    hrv_high: band(recentHrv, 0.75),
    highlights: [
      card(
        "Longest distance",
        longestKm,
        longestKm?.distance_km != null ? `${round1(longestKm.distance_km)} km` : "—",
      ),
      card(
        "Most climbing",
        mostClimb,
        mostClimb?.elevation_gain_m != null
          ? `${Math.round(mostClimb.elevation_gain_m)} m`
          : "—",
      ),
      card(
        "Longest session",
        longestMin,
        longestMin?.duration_min != null
          ? `${Math.round(longestMin.duration_min)} min`
          : "—",
      ),
    ],
    reads_only: [
      "Activities, sleep, daily wellness, HRV",
      "Optional later: weight, zones, FIT files",
    ],
    cannot: [
      "Send workouts to your watch",
      "Garmin badges, race predictions, or Training Status",
    ],
  };
}
