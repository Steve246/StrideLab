import type { ActivityRow } from "./loadMath";
import { formatPace, round1, sessionPace } from "./loadMath";

export type ActivityIntent =
  | "easy"
  | "long"
  | "quality"
  | "race"
  | "other"
  | "unknown";

export type ActivityAnalysis = {
  activity_id: string;
  header: {
    sport: string | null;
    date: string | null;
    distance_km: number | null;
    duration_min: number | null;
    pace_min_per_km: number | null;
    avg_hr: number | null;
    elevation_gain_m: number | null;
    trimp: number | null;
    aerobic_te: number | null;
    anaerobic_te: number | null;
  };
  intent: ActivityIntent;
  intent_reason: string;
  execution: {
    load_vs_week: string | null;
    notes: string[];
  };
  comparison: {
    similar_count: number;
    vs_avg_pace: string | null;
    vs_avg_trimp: string | null;
    detail: string;
  };
  signals: { label: string; value: string }[];
  effort: {
    trimp: number | null;
    per_km: number | null;
    aerobic_te: number | null;
    anaerobic_te: number | null;
    versus: string | null;
    sentence: string;
  };
  takeaways: string[];
  track: { lat: number; lon: number }[];
};

function anaerobicTe(a: ActivityRow): number | null {
  const v = (a as { anaerobic_te?: number | null }).anaerobic_te;
  return typeof v === "number" ? v : null;
}

function inferIntent(
  a: ActivityRow,
  medianDist: number | null,
  medianPace: number | null,
): { intent: ActivityIntent; reason: string } {
  const dist = a.distance_km ?? 0;
  const pace = sessionPace(a);
  const ana = anaerobicTe(a);
  const aero = a.aerobic_te;

  if (medianDist != null && dist >= medianDist * 1.3) {
    return { intent: "long", reason: "Distance well above your recent run median." };
  }
  if (typeof ana === "number" && ana >= 2.5) {
    return { intent: "quality", reason: "Anaerobic Training Effect suggests quality work." };
  }
  if (
    medianPace != null &&
    pace != null &&
    pace > 0 &&
    pace <= medianPace * 0.92
  ) {
    return { intent: "quality", reason: "Pace faster than recent median." };
  }
  if (
    (typeof aero === "number" && aero <= 2.5 && (ana == null || ana < 2)) ||
    (medianPace != null && pace != null && pace >= medianPace * 1.05)
  ) {
    return { intent: "easy", reason: "Looks aerobic-easy vs your recent mix." };
  }
  if (a.sport && /race/i.test(a.notes ?? "")) {
    return { intent: "race", reason: "Notes mention race." };
  }
  return { intent: "unknown", reason: "Not enough TE/pace context to classify." };
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function buildActivityAnalysis(
  activityId: string,
  activities: ActivityRow[],
): ActivityAnalysis | null {
  const activity = activities.find((a) => a.activity_id === activityId);
  if (!activity) return null;

  const runs = activities.filter(
    (a) =>
      a.activity_id !== activityId &&
      (a.sport ?? "").toLowerCase().includes("run") &&
      (a.distance_km ?? 0) > 0.2,
  );
  const sameSport = activities.filter(
    (a) =>
      a.activity_id !== activityId &&
      (a.sport ?? "") === (activity.sport ?? "") &&
      (a.distance_km ?? 0) > 0.2,
  );
  const pool = sameSport.length >= 3 ? sameSport : runs.length ? runs : activities.filter((a) => a.activity_id !== activityId);

  const dists = pool
    .map((a) => a.distance_km)
    .filter((n): n is number => typeof n === "number");
  const paces = pool
    .map((a) => sessionPace(a))
    .filter((n): n is number => typeof n === "number" && n > 0);
  const medianDist = median(dists);
  const medianPace = median(paces);

  const { intent, reason } = inferIntent(activity, medianDist, medianPace);

  const dist = activity.distance_km ?? 0;
  const similar = pool.filter((a) => {
    const d = a.distance_km ?? 0;
    if (dist < 0.3 || d < 0.3) return false;
    return Math.abs(d - dist) / dist <= 0.2;
  });
  const simPaces = similar
    .map((a) => sessionPace(a))
    .filter((n): n is number => n != null && n > 0);
  const simTrimps = similar
    .map((a) => a.trimp ?? a.load_score)
    .filter((n): n is number => typeof n === "number");
  const avgPace = median(simPaces);
  const avgTrimp = mean(simTrimps);
  const myPace = sessionPace(activity);
  const myTrimp = activity.trimp ?? activity.load_score ?? null;

  let vsPace: string | null = null;
  if (myPace != null && avgPace != null) {
    const pct = ((myPace - avgPace) / avgPace) * 100;
    vsPace =
      pct < -3
        ? `${Math.abs(round1(pct))}% faster than similar`
        : pct > 3
          ? `${round1(pct)}% slower than similar`
          : "Near similar-run pace";
  }
  let vsTrimp: string | null = null;
  if (myTrimp != null && avgTrimp != null) {
    const pct = ((myTrimp - avgTrimp) / avgTrimp) * 100;
    vsTrimp =
      Math.abs(pct) < 8
        ? "TRIMP near similar sessions"
        : pct > 0
          ? `TRIMP +${round1(pct)}% vs similar`
          : `TRIMP ${round1(pct)}% vs similar`;
  }

  const notes: string[] = [];
  if (activity.aerobic_te != null)
    notes.push(`Aerobic TE ${activity.aerobic_te}`);
  if (anaerobicTe(activity) != null)
    notes.push(`Anaerobic TE ${anaerobicTe(activity)}`);
  if (myTrimp != null) notes.push(`TRIMP ${round1(myTrimp)}`);
  if (!notes.length) notes.push("Open the route above when Garmin has GPS for this run.");

  const takeaways: string[] = [];
  if (vsPace) takeaways.push(vsPace);
  const grade =
    activity.distance_km && activity.elevation_gain_m != null && activity.distance_km > 0.2
      ? round1(activity.elevation_gain_m / activity.distance_km)
      : null;
  if (grade != null && grade >= 15) {
    takeaways.push(`${grade} m of climb per km — trail-like grade.`);
  } else if (intent === "long") {
    takeaways.push("Long session — note how the last third felt before the next one.");
  }

  const signals: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null) => {
    if (value) signals.push({ label, value });
  };
  push(
    "Climb",
    activity.elevation_gain_m != null
      ? `${Math.round(activity.elevation_gain_m)} m${grade != null ? ` · ${grade} m/km` : ""}`
      : null,
  );
  push("Cadence", activity.avg_cadence_spm != null ? `${activity.avg_cadence_spm} spm` : null);
  push("Power", activity.avg_power_watts != null ? `${activity.avg_power_watts} W` : null);
  push("Max HR", activity.max_hr != null ? `${Math.round(activity.max_hr)} bpm` : null);
  push(
    "Training effect",
    activity.training_effect_label ??
      (activity.aerobic_te != null ? `Aerobic ${activity.aerobic_te}` : null),
  );
  push("Calories", activity.calories != null ? String(activity.calories) : null);
  push("Temp", activity.temperature_c != null ? `${activity.temperature_c} °C` : null);
  push("VO2 estimate", activity.vo2max_estimate != null ? String(activity.vo2max_estimate) : null);

  return {
    activity_id: activityId,
    header: {
      sport: activity.sport ?? null,
      date: activity.date ?? null,
      distance_km: activity.distance_km ?? null,
      duration_min: activity.duration_min ?? null,
      pace_min_per_km: myPace,
      avg_hr: activity.avg_hr ?? null,
      elevation_gain_m: activity.elevation_gain_m ?? null,
      trimp: myTrimp,
      aerobic_te: activity.aerobic_te ?? null,
      anaerobic_te: anaerobicTe(activity),
    },
    intent,
    intent_reason: reason,
    execution: {
      load_vs_week: myTrimp != null ? `Session TRIMP ${round1(myTrimp)}` : null,
      notes,
    },
    comparison: {
      similar_count: similar.length,
      vs_avg_pace: vsPace,
      vs_avg_trimp: vsTrimp,
      detail:
        similar.length >= 2
          ? `Compared to ${similar.length} similar-distance sessions.`
          : "Need more similar sessions for a strong comparison.",
    },
    signals,
    effort: effortLoad(activity, similar, myTrimp, vsTrimp),
    takeaways,
    track: [],
  };
}

function effortLoad(
  activity: ActivityRow,
  similar: ActivityRow[],
  trimp: number | null,
  versus: string | null,
) {
  const km = activity.distance_km ?? 0;
  const perKm = trimp != null && km > 0.2 ? round1(trimp / km) : null;
  const peer = mean(
    similar
      .map((a) => {
        const t = a.trimp ?? a.load_score;
        const d = a.distance_km;
        if (t == null || d == null || d < 0.2) return null;
        return t / d;
      })
      .filter((n): n is number => n != null),
  );
  let sentence = "Effort load is Banister TRIMP from duration and average heart rate.";
  if (perKm != null && peer != null) {
    const delta = ((perKm - peer) / peer) * 100;
    sentence =
      Math.abs(delta) < 8
        ? `About ${perKm} TRIMP per km, close to similar runs (${round1(peer)}).`
        : delta > 0
          ? `About ${perKm} TRIMP per km, harder than similar runs (${round1(peer)}).`
          : `About ${perKm} TRIMP per km, easier than similar runs (${round1(peer)}).`;
  } else if (perKm != null) {
    sentence = `About ${perKm} TRIMP per km. Need more similar runs to compare effort.`;
  }
  return {
    trimp,
    per_km: perKm,
    aerobic_te: activity.aerobic_te ?? null,
    anaerobic_te: anaerobicTe(activity),
    versus,
    sentence,
  };
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function findActivityId(
  activities: ActivityRow[],
  id: string,
): string | null {
  return activities.some((a) => a.activity_id === id) ? id : null;
}
