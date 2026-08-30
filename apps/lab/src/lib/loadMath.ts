export type LoadZone =
  | "undertraining"
  | "optimal"
  | "caution"
  | "high_risk"
  | "unknown";

export type ActivityRow = {
  activity_id?: string;
  date?: string;
  sport?: string;
  duration_min?: number;
  distance_km?: number;
  elevation_gain_m?: number | null;
  avg_hr?: number | null;
  avg_pace_min_per_km?: number | null;
  trimp?: number | null;
  load_score?: number | null;
  aerobic_te?: number | null;
  notes?: string | null;
};

export type WeekBucket = {
  week_start: string;
  distance_km: number;
  duration_min: number;
  sessions: number;
  trimp: number;
  elevation_gain_m: number;
  /** Distance-weighted average pace (min/km); null if no distance. */
  avg_pace_min_per_km: number | null;
  /** Average HR across sessions that have HR. */
  avg_hr: number | null;
};

export type RecoverySnapshot = {
  date: string | null;
  resting_hr: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  avg_stress: number | null;
  sleep_hours: number | null;
  sleep_score: number | null;
  recovery_score: number | null;
};

export type ForecastWeek = {
  week_start: string;
  kind: "history" | "forecast";
  distance_km: number | null;
  trimp: number | null;
  /** Forecast band (km) */
  conservative_km: number | null;
  expected_km: number | null;
  aggressive_km: number | null;
  conservative_trimp: number | null;
  expected_trimp: number | null;
  aggressive_trimp: number | null;
};

export type AcrPoint = {
  date: string;
  acute: number;
  chronic: number;
  acr: number | null;
  zone: LoadZone;
};

export type OverviewPayload = {
  as_of: string;
  last_sync: string | null;
  week_start: string | null;
  distance_km: number;
  trimp: number;
  sessions: number;
  elevation_gain_m: number;
  avg_pace_min_per_km: number | null;
  avg_hr: number | null;
  efficiency_trimp_per_km: number | null;
  wow_distance_pct: number | null;
  longest_run_28d_km: number | null;
  acr_km: number | null;
  acr_km_zone: LoadZone;
  acr_trimp: number | null;
  acr_trimp_zone: LoadZone;
  alignment: string;
  activity_count: number;
  forecast_next_week_km: number | null;
  forecast_next_week_trimp: number | null;
  recovery: RecoverySnapshot;
};

export function mondayOf(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatPace(minPerKm: number | null | undefined): string {
  if (typeof minPerKm !== "number" || !Number.isFinite(minPerKm) || minPerKm <= 0) {
    return "—";
  }
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  const ss = s === 60 ? 0 : s;
  const mm = s === 60 ? m + 1 : m;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function sessionPace(a: ActivityRow): number | null {
  if (
    typeof a.avg_pace_min_per_km === "number" &&
    Number.isFinite(a.avg_pace_min_per_km) &&
    a.avg_pace_min_per_km > 0
  ) {
    return a.avg_pace_min_per_km;
  }
  const km = typeof a.distance_km === "number" ? a.distance_km : 0;
  const min = typeof a.duration_min === "number" ? a.duration_min : 0;
  if (km > 0.2 && min > 0) return min / km;
  return null;
}

export function sessionLoad(a: ActivityRow, metric: "km" | "trimp"): number {
  if (metric === "km") {
    return typeof a.distance_km === "number" ? a.distance_km : 0;
  }
  if (typeof a.trimp === "number") return a.trimp;
  if (typeof a.load_score === "number") return a.load_score;
  return 0;
}

export function classifyAcr(acr: number | null): LoadZone {
  if (acr == null || !Number.isFinite(acr)) return "unknown";
  if (acr < 0.8) return "undertraining";
  if (acr <= 1.3) return "optimal";
  if (acr <= 1.5) return "caution";
  return "high_risk";
}

export function zoneLabel(z: LoadZone): string {
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

export function zoneColor(z: LoadZone): string {
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

export function alignmentLabel(
  kmAcr: number | null,
  trimpAcr: number | null,
): string {
  if (kmAcr == null || trimpAcr == null) {
    return "Need more history for ACR compare";
  }
  const d = trimpAcr - kmAcr;
  if (Math.abs(d) < 0.15) {
    return "Aligned — volume and intensity move together";
  }
  if (d > 0.15) {
    return "Intensity spike — load up vs mileage (hard sessions / race)";
  }
  return "Volume spike — mileage up vs internal load (mostly easy km)";
}

/** Anchor "today" to last activity if export lags by >3 days. */
export function resolveAsOf(activities: ActivityRow[]): Date {
  const dated = activities
    .map((a) => Date.parse(a.date ?? ""))
    .filter((t) => !Number.isNaN(t));
  const lastActMs = dated.length ? Math.max(...dated) : Date.now();
  const nowMs = Date.now();
  return new Date(
    nowMs - lastActMs > 3 * 24 * 60 * 60 * 1000 ? lastActMs : nowMs,
  );
}

type MutableWeek = WeekBucket & {
  _paceDist: number;
  _paceSum: number;
  _hrSum: number;
  _hrN: number;
};

export function buildWeeklySeries(
  activities: ActivityRow[],
  weeks: number,
  asOf: Date,
): WeekBucket[] {
  const thisMonday = mondayOf(asOf);
  const oldestMonday = addDays(thisMonday, -(weeks - 1) * 7);
  const map = new Map<string, MutableWeek>();

  for (let i = 0; i < weeks; i++) {
    const start = addDays(oldestMonday, i * 7);
    const key = isoDate(start);
    map.set(key, {
      week_start: key,
      distance_km: 0,
      duration_min: 0,
      sessions: 0,
      trimp: 0,
      elevation_gain_m: 0,
      avg_pace_min_per_km: null,
      avg_hr: null,
      _paceDist: 0,
      _paceSum: 0,
      _hrSum: 0,
      _hrN: 0,
    });
  }

  for (const a of activities) {
    if (!a.date) continue;
    const t = Date.parse(a.date);
    if (Number.isNaN(t)) continue;
    const weekKey = isoDate(mondayOf(new Date(t)));
    const bucket = map.get(weekKey);
    if (!bucket) continue;
    const km = typeof a.distance_km === "number" ? a.distance_km : 0;
    bucket.distance_km += km;
    bucket.duration_min +=
      typeof a.duration_min === "number" ? a.duration_min : 0;
    bucket.trimp += sessionLoad(a, "trimp");
    bucket.elevation_gain_m +=
      typeof a.elevation_gain_m === "number" ? a.elevation_gain_m : 0;
    bucket.sessions += 1;

    const pace = sessionPace(a);
    if (pace != null && km > 0) {
      bucket._paceSum += pace * km;
      bucket._paceDist += km;
    }
    if (typeof a.avg_hr === "number" && a.avg_hr > 0) {
      bucket._hrSum += a.avg_hr;
      bucket._hrN += 1;
    }
  }

  return [...map.values()].map((b) => ({
    week_start: b.week_start,
    distance_km: round1(b.distance_km),
    duration_min: round1(b.duration_min),
    sessions: b.sessions,
    trimp: round1(b.trimp),
    elevation_gain_m: round1(b.elevation_gain_m),
    avg_pace_min_per_km:
      b._paceDist > 0 ? round2(b._paceSum / b._paceDist) : null,
    avg_hr: b._hrN > 0 ? round1(b._hrSum / b._hrN) : null,
  }));
}

/**
 * History weeks + next 4 forecast weeks (conservative / expected / aggressive).
 * Method mirrors agent fitTools projection from chronic weekly average.
 */
export function buildForecastSeries(
  weekly: WeekBucket[],
  asOf: Date,
  forecastWeeks = 4,
): ForecastWeek[] {
  const recent = weekly.slice(-4);
  const avgKm =
    recent.length > 0
      ? recent.reduce((s, w) => s + w.distance_km, 0) / recent.length
      : 0;
  const avgTrimp =
    recent.length > 0
      ? recent.reduce((s, w) => s + w.trimp, 0) / recent.length
      : 0;

  const history: ForecastWeek[] = weekly.map((w) => ({
    week_start: w.week_start,
    kind: "history",
    distance_km: w.distance_km,
    trimp: w.trimp,
    conservative_km: null,
    expected_km: null,
    aggressive_km: null,
    conservative_trimp: null,
    expected_trimp: null,
    aggressive_trimp: null,
  }));

  const nextMonday = addDays(mondayOf(asOf), 7);
  const forecast: ForecastWeek[] = [];
  for (let i = 0; i < forecastWeeks; i++) {
    const week_start = isoDate(addDays(nextMonday, i * 7));
    const expected_km = round1(avgKm);
    const conservative_km = round1(avgKm * 0.9);
    const aggressive_km = round1(Math.min(avgKm * 1.1, avgKm + 5));
    const expected_trimp = round1(avgTrimp);
    const conservative_trimp = round1(avgTrimp * 0.9);
    const aggressive_trimp = round1(avgTrimp * 1.1);
    forecast.push({
      week_start,
      kind: "forecast",
      distance_km: null,
      trimp: null,
      conservative_km,
      expected_km,
      aggressive_km,
      conservative_trimp,
      expected_trimp,
      aggressive_trimp,
    });
  }

  return [...history, ...forecast];
}

/**
 * myTrainingForecast-style ACR:
 * acute = load in last 7 days ending on day D
 * chronic = (load in last 28 days ending on D) / 4
 */
export function buildAcrSeries(
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
    const end = day.getTime() + msDay;
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
    points.push({
      date: isoDate(day),
      acute: round1(acute),
      chronic: round1(chronic),
      acr: acr != null ? round2(acr) : null,
      zone: classifyAcr(acr),
    });
  }
  return points;
}
