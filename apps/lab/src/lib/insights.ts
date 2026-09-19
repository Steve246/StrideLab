import type { ActivityRow } from "./loadMath";
import { formatPace, isoDate, mondayOf, round1, sessionPace } from "./loadMath";
import {
  athleteTimeZone,
  localClock,
  localDayKey,
  localMinutesFromMidnight,
} from "./timezone";

export type TimelineSegment = {
  kind: "activity" | "sleep_deep" | "sleep_light" | "sleep_rem" | "sleep_awake" | "idle";
  label: string;
  start_min: number; // minutes from local midnight
  end_min: number;
  sport?: string;
  distance_km?: number | null;
  trimp?: number | null;
  avg_hr?: number | null;
  activity_id?: string;
  start_clock?: string;
};

export type DailyAnalyzerDay = {
  date: string;
  weekday: string;
  time_zone: string;
  /** Sleep-only timeline (night ending this calendar morning). */
  sleep_segments: TimelineSegment[];
  /** Workout-only timeline for this local calendar day. */
  workout_segments: TimelineSegment[];
  /** @deprecated Combined; prefer sleep_segments + workout_segments */
  segments: TimelineSegment[];
  activities: ActivityRow[];
  sleep: {
    total_hours: number | null;
    deep_hours: number | null;
    light_hours: number | null;
    rem_hours: number | null;
    awake_hours: number | null;
    sleep_score: number | null;
    recovery_score: number | null;
    wake_clock: string | null;
    bedtime_clock: string | null;
  };
  daily: {
    resting_hr: number | null;
    steps: number | null;
    avg_stress: number | null;
    body_battery_high: number | null;
    body_battery_low: number | null;
  };
  totals: {
    distance_km: number;
    duration_min: number;
    trimp: number;
    sessions: number;
  };
};

export type BestRecord = {
  id: string;
  category: "highlight" | "lowlight";
  title: string;
  value: string;
  detail: string;
  date: string | null;
  activity_id?: string | null;
};

export type YourBestPayload = {
  as_of: string;
  window_label: string;
  highlights: BestRecord[];
  lowlights: BestRecord[];
  by_sport: Array<{
    sport: string;
    sessions: number;
    distance_km: number;
    best_distance_km: number | null;
    best_pace: string | null;
    best_pace_date: string | null;
  }>;
  streaks: {
    consecutive_active_days: number;
    consecutive_run_days: number;
    best_active_streak: number;
  };
};

type SleepDay = {
  calendarDate?: string;
  deepSleepSeconds?: number;
  lightSleepSeconds?: number;
  remSleepSeconds?: number;
  awakeSleepSeconds?: number;
  totalSleepSeconds?: number;
  overallSleepScore?: number;
  recoveryScore?: number;
};

type DailyDay = {
  calendarDate?: string;
  restingHeartRate?: number;
  totalSteps?: number;
  avgStress?: number;
  bodyBatteryHigh?: number;
  bodyBatteryLow?: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hoursFromSec(s: number | undefined): number | null {
  if (typeof s !== "number" || !Number.isFinite(s)) return null;
  return round1(s / 3600);
}

function fmtMinClock(min: number): string {
  const clamped = ((Math.round(min) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Build FitnessSyncer-style daily views for the last `days` local calendar days.
 * Sleep and workouts are separate tracks. Activities are bucketed by ATHLETE_TIMEZONE.
 */
export function buildDailyAnalyzerDays(opts: {
  activities: ActivityRow[];
  sleepDays: SleepDay[];
  dailyDays: DailyDay[];
  asOf: Date;
  days?: number;
  timeZone?: string;
}): DailyAnalyzerDay[] {
  const n = opts.days ?? 7;
  const tz = opts.timeZone ?? athleteTimeZone();
  const sleepBy = new Map(
    (opts.sleepDays ?? [])
      .filter((d) => d.calendarDate)
      .map((d) => [d.calendarDate!, d]),
  );
  const dailyBy = new Map(
    (opts.dailyDays ?? [])
      .filter((d) => d.calendarDate)
      .map((d) => [d.calendarDate!, d]),
  );

  const asOfKey = localDayKey(opts.asOf, tz);
  const asOfNoonUtc = new Date(`${asOfKey}T12:00:00Z`);

  const out: DailyAnalyzerDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(asOfNoonUtc);
    day.setUTCDate(day.getUTCDate() - i);
    const key = day.toISOString().slice(0, 10);
    const weekdayIdx = new Date(`${key}T12:00:00Z`).getUTCDay();

    const acts = opts.activities
      .filter((a) => a.date && localDayKey(a.date, tz) === key)
      .sort((a, b) => Date.parse(a.date!) - Date.parse(b.date!));

    const sleep = sleepBy.get(key);
    const daily = dailyBy.get(key);

    const sleep_segments: TimelineSegment[] = [];
    const workout_segments: TimelineSegment[] = [];

    // Wake ≈ first morning activity (before noon) or 07:00 local.
    const morningActs = acts.filter(
      (a) => localMinutesFromMidnight(a.date!, tz) < 12 * 60,
    );
    const wakeMin =
      morningActs.length > 0
        ? localMinutesFromMidnight(morningActs[0].date!, tz)
        : 7 * 60;
    const totalSleepMin =
      typeof sleep?.totalSleepSeconds === "number"
        ? sleep.totalSleepSeconds / 60
        : 0;

    let bedtimeClock: string | null = null;
    if (totalSleepMin > 0 && sleep) {
      // Sleep ends at wake; may start previous evening (negative offset).
      const sleepStart = wakeMin - totalSleepMin;
      bedtimeClock = fmtMinClock(sleepStart);
      let cursor = sleepStart;
      const stages: Array<{
        kind: TimelineSegment["kind"];
        sec?: number;
        label: string;
      }> = [
        { kind: "sleep_deep", sec: sleep.deepSleepSeconds, label: "Deep sleep" },
        { kind: "sleep_light", sec: sleep.lightSleepSeconds, label: "Light sleep" },
        { kind: "sleep_rem", sec: sleep.remSleepSeconds, label: "REM sleep" },
        {
          kind: "sleep_awake",
          sec: sleep.awakeSleepSeconds,
          label: "Awake in bed",
        },
      ];
      for (const st of stages) {
        const mins = (st.sec ?? 0) / 60;
        if (mins < 1) continue;
        const end = cursor + mins;
        // Clip display to [0, wake] for the morning calendar day track.
        const drawStart = Math.max(0, cursor);
        const drawEnd = Math.min(24 * 60, Math.max(drawStart, end));
        if (drawEnd > drawStart) {
          sleep_segments.push({
            kind: st.kind,
            label: st.label,
            start_min: round1(drawStart),
            end_min: round1(drawEnd),
          });
        }
        cursor = end;
      }
    }

    for (const a of acts) {
      const start = localMinutesFromMidnight(a.date!, tz);
      const dur = typeof a.duration_min === "number" ? a.duration_min : 30;
      const end = Math.min(24 * 60, start + Math.max(dur, 1));
      workout_segments.push({
        kind: "activity",
        label: `${a.sport ?? "activity"}${a.notes ? ` · ${a.notes}` : ""}`,
        start_min: round1(start),
        end_min: round1(Math.max(start + 1, end)),
        sport: a.sport,
        distance_km: a.distance_km,
        trimp: a.trimp ?? a.load_score,
        avg_hr: a.avg_hr,
        activity_id: a.activity_id,
        start_clock: localClock(a.date!, tz),
      });
    }

    const segments = [...sleep_segments, ...workout_segments].sort(
      (a, b) => a.start_min - b.start_min,
    );

    out.push({
      date: key,
      weekday: WEEKDAYS[weekdayIdx] ?? "",
      time_zone: tz,
      sleep_segments,
      workout_segments,
      segments,
      activities: acts,
      sleep: {
        total_hours: hoursFromSec(sleep?.totalSleepSeconds),
        deep_hours: hoursFromSec(sleep?.deepSleepSeconds),
        light_hours: hoursFromSec(sleep?.lightSleepSeconds),
        rem_hours: hoursFromSec(sleep?.remSleepSeconds),
        awake_hours: hoursFromSec(sleep?.awakeSleepSeconds),
        sleep_score:
          typeof sleep?.overallSleepScore === "number"
            ? sleep.overallSleepScore
            : null,
        recovery_score:
          typeof sleep?.recoveryScore === "number" ? sleep.recoveryScore : null,
        wake_clock: totalSleepMin > 0 ? fmtMinClock(wakeMin) : null,
        bedtime_clock: bedtimeClock,
      },
      daily: {
        resting_hr:
          typeof daily?.restingHeartRate === "number"
            ? daily.restingHeartRate
            : null,
        steps: typeof daily?.totalSteps === "number" ? daily.totalSteps : null,
        avg_stress:
          typeof daily?.avgStress === "number" ? daily.avgStress : null,
        body_battery_high:
          typeof daily?.bodyBatteryHigh === "number"
            ? daily.bodyBatteryHigh
            : null,
        body_battery_low:
          typeof daily?.bodyBatteryLow === "number"
            ? daily.bodyBatteryLow
            : null,
      },
      totals: {
        distance_km: round1(
          acts.reduce(
            (s, a) => s + (typeof a.distance_km === "number" ? a.distance_km : 0),
            0,
          ),
        ),
        duration_min: round1(
          acts.reduce(
            (s, a) =>
              s + (typeof a.duration_min === "number" ? a.duration_min : 0),
            0,
          ),
        ),
        trimp: round1(
          acts.reduce(
            (s, a) =>
              s +
              (typeof a.trimp === "number"
                ? a.trimp
                : typeof a.load_score === "number"
                  ? a.load_score
                  : 0),
            0,
          ),
        ),
        sessions: acts.length,
      },
    });
  }
  return out;
}

function isRunLike(sport?: string): boolean {
  return sport === "run" || sport === "trail_run" || sport === "ultra";
}

export function buildYourBest(opts: {
  activities: ActivityRow[];
  sleepDays: SleepDay[];
  dailyDays: DailyDay[];
  asOf: Date;
}): YourBestPayload {
  const acts = opts.activities.filter((a) => a.date);
  const highlights: BestRecord[] = [];
  const lowlights: BestRecord[] = [];

  // Longest distance
  let bestDist: ActivityRow | null = null;
  let bestElev: ActivityRow | null = null;
  let bestTrimp: ActivityRow | null = null;
  let bestPace: ActivityRow | null = null;
  let worstPace: ActivityRow | null = null;

  for (const a of acts) {
    if (
      typeof a.distance_km === "number" &&
      (!bestDist || a.distance_km > (bestDist.distance_km ?? 0))
    ) {
      bestDist = a;
    }
    if (
      typeof a.elevation_gain_m === "number" &&
      (!bestElev || a.elevation_gain_m > (bestElev.elevation_gain_m ?? 0))
    ) {
      bestElev = a;
    }
    const load =
      typeof a.trimp === "number"
        ? a.trimp
        : typeof a.load_score === "number"
          ? a.load_score
          : null;
    if (
      load != null &&
      (!bestTrimp ||
        load >
          (typeof bestTrimp.trimp === "number"
            ? bestTrimp.trimp
            : bestTrimp.load_score ?? 0))
    ) {
      bestTrimp = a;
    }
    const pace = sessionPace(a);
    if (
      pace != null &&
      isRunLike(a.sport) &&
      typeof a.distance_km === "number" &&
      a.distance_km >= 3
    ) {
      if (!bestPace || pace < (sessionPace(bestPace) ?? 999)) bestPace = a;
      if (!worstPace || pace > (sessionPace(worstPace) ?? 0)) worstPace = a;
    }
  }

  if (bestDist) {
    highlights.push({
      id: "longest_run",
      category: "highlight",
      title: "Longest activity",
      value: `${bestDist.distance_km} km`,
      detail: `${bestDist.sport ?? "session"} · ${formatPace(sessionPace(bestDist))} /km`,
      date: localDayKey(bestDist.date!),
      activity_id: bestDist.activity_id,
    });
  }
  if (bestPace) {
    highlights.push({
      id: "fastest_pace",
      category: "highlight",
      title: "Fastest run pace (≥3 km)",
      value: `${formatPace(sessionPace(bestPace))} /km`,
      detail: `${bestPace.distance_km} km · ${bestPace.sport}`,
      date: localDayKey(bestPace.date!),
      activity_id: bestPace.activity_id,
    });
  }
  if (bestElev && (bestElev.elevation_gain_m ?? 0) > 0) {
    highlights.push({
      id: "most_elevation",
      category: "highlight",
      title: "Most elevation",
      value: `${Math.round(bestElev.elevation_gain_m!)} m`,
      detail: `${bestElev.distance_km ?? "—"} km · ${bestElev.sport}`,
      date: localDayKey(bestElev.date!),
      activity_id: bestElev.activity_id,
    });
  }
  if (bestTrimp) {
    highlights.push({
      id: "highest_trimp",
      category: "highlight",
      title: "Highest session load",
      value: `${bestTrimp.trimp ?? bestTrimp.load_score}`,
      detail: `TRIMP · ${bestTrimp.distance_km ?? "—"} km`,
      date: localDayKey(bestTrimp.date!),
      activity_id: bestTrimp.activity_id,
    });
  }

  // Best week by distance
  const weekMap = new Map<string, number>();
  for (const a of acts) {
    const wk = isoDate(mondayOf(new Date(a.date!)));
    weekMap.set(
      wk,
      (weekMap.get(wk) ?? 0) +
        (typeof a.distance_km === "number" ? a.distance_km : 0),
    );
  }
  let bestWeek: string | null = null;
  let bestWeekKm = 0;
  for (const [wk, km] of weekMap) {
    if (km > bestWeekKm) {
      bestWeekKm = km;
      bestWeek = wk;
    }
  }
  if (bestWeek) {
    highlights.push({
      id: "best_week",
      category: "highlight",
      title: "Biggest mileage week",
      value: `${round1(bestWeekKm)} km`,
      detail: `Week of ${bestWeek}`,
      date: bestWeek,
    });
  }

  // Sleep / recovery highlights & lowlights
  const sleeps = opts.sleepDays.filter(
    (d) => typeof d.overallSleepScore === "number" && d.calendarDate,
  );
  if (sleeps.length) {
    const bestSleep = [...sleeps].sort(
      (a, b) => (b.overallSleepScore ?? 0) - (a.overallSleepScore ?? 0),
    )[0];
    const worstSleep = [...sleeps].sort(
      (a, b) => (a.overallSleepScore ?? 999) - (b.overallSleepScore ?? 999),
    )[0];
    highlights.push({
      id: "best_sleep",
      category: "highlight",
      title: "Best sleep score",
      value: String(bestSleep.overallSleepScore),
      detail: `${hoursFromSec(bestSleep.totalSleepSeconds) ?? "—"} h sleep`,
      date: bestSleep.calendarDate ?? null,
    });
    lowlights.push({
      id: "worst_sleep",
      category: "lowlight",
      title: "Lowest sleep score",
      value: String(worstSleep.overallSleepScore),
      detail: `${hoursFromSec(worstSleep.totalSleepSeconds) ?? "—"} h sleep`,
      date: worstSleep.calendarDate ?? null,
    });
  }

  const dailies = opts.dailyDays.filter(
    (d) => typeof d.restingHeartRate === "number" && d.calendarDate,
  );
  if (dailies.length) {
    const lowRhr = [...dailies].sort(
      (a, b) => (a.restingHeartRate ?? 999) - (b.restingHeartRate ?? 999),
    )[0];
    const highStress = [...dailies]
      .filter((d) => typeof d.avgStress === "number")
      .sort((a, b) => (b.avgStress ?? 0) - (a.avgStress ?? 0))[0];
    highlights.push({
      id: "lowest_rhr",
      category: "highlight",
      title: "Lowest resting HR",
      value: `${lowRhr.restingHeartRate} bpm`,
      detail: "Recovery marker",
      date: lowRhr.calendarDate ?? null,
    });
    if (highStress) {
      lowlights.push({
        id: "highest_stress",
        category: "lowlight",
        title: "Highest avg stress",
        value: String(highStress.avgStress),
        detail: "Daily stress average",
        date: highStress.calendarDate ?? null,
      });
    }
  }

  const bestPaceVal = bestPace ? sessionPace(bestPace) : null;
  const worstPaceVal = worstPace ? sessionPace(worstPace) : null;
  if (
    worstPace &&
    worstPaceVal != null &&
    worstPaceVal > (bestPaceVal ?? 0) + 0.5
  ) {
    lowlights.push({
      id: "slowest_pace",
      category: "lowlight",
      title: "Slowest run pace (≥3 km)",
      value: `${formatPace(worstPaceVal)} /km`,
      detail: `${worstPace.distance_km} km — useful for easy-day checks`,
      date: localDayKey(worstPace.date!),
      activity_id: worstPace.activity_id,
    });
  }

  // Streaks
  const activeDays = new Set(
    acts.map((a) => localDayKey(a.date!)).filter(Boolean),
  );
  const runDays = new Set(
    acts
      .filter((a) => isRunLike(a.sport))
      .map((a) => localDayKey(a.date!)),
  );

  function currentStreak(set: Set<string>): number {
    let n = 0;
    const d = new Date(opts.asOf);
    d.setUTCHours(0, 0, 0, 0);
    while (set.has(isoDate(d))) {
      n += 1;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return n;
  }

  function bestStreak(set: Set<string>): number {
    const sorted = [...set].sort();
    if (!sorted.length) return 0;
    let best = 1;
    let cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = Date.parse(sorted[i - 1]);
      const now = Date.parse(sorted[i]);
      if (now - prev === 24 * 60 * 60 * 1000) {
        cur += 1;
        best = Math.max(best, cur);
      } else {
        cur = 1;
      }
    }
    return best;
  }

  const sportMap = new Map<
    string,
    {
      sessions: number;
      distance_km: number;
      best_distance_km: number | null;
      best_pace: number | null;
      best_pace_date: string | null;
    }
  >();
  for (const a of acts) {
    const sport = a.sport ?? "other";
    const row = sportMap.get(sport) ?? {
      sessions: 0,
      distance_km: 0,
      best_distance_km: null,
      best_pace: null,
      best_pace_date: null,
    };
    row.sessions += 1;
    row.distance_km += typeof a.distance_km === "number" ? a.distance_km : 0;
    if (
      typeof a.distance_km === "number" &&
      (row.best_distance_km == null || a.distance_km > row.best_distance_km)
    ) {
      row.best_distance_km = a.distance_km;
    }
    const pace = sessionPace(a);
    if (
      pace != null &&
      typeof a.distance_km === "number" &&
      a.distance_km >= 3 &&
      (row.best_pace == null || pace < row.best_pace)
    ) {
      row.best_pace = pace;
      row.best_pace_date = localDayKey(a.date!);
    }
    sportMap.set(sport, row);
  }

  return {
    as_of: isoDate(opts.asOf),
    window_label: "All synced history",
    highlights,
    lowlights,
    by_sport: [...sportMap.entries()]
      .map(([sport, row]) => ({
        sport,
        sessions: row.sessions,
        distance_km: round1(row.distance_km),
        best_distance_km: row.best_distance_km,
        best_pace: row.best_pace != null ? formatPace(row.best_pace) : null,
        best_pace_date: row.best_pace_date,
      }))
      .sort((a, b) => b.distance_km - a.distance_km),
    streaks: {
      consecutive_active_days: currentStreak(activeDays),
      consecutive_run_days: currentStreak(runDays),
      best_active_streak: bestStreak(activeDays),
    },
  };
}
