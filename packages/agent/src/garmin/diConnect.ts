import fs from "node:fs/promises";
import path from "node:path";
import type { Activity } from "../schemas/activity.js";
import { ENRICHMENT_DIR } from "../providers/dataDirectory.js";
import {
  computeBanisterTrimp,
  loadDailyRhrValues,
  resolveAthleteHrProfile,
  saveAthleteHrProfile,
  type AthleteHrProfile,
} from "./trimp.js";

export type { Activity };

type Sport = Activity["sport"];

/** Resolve candidate path from tool arg or GARMIN_EXPORT_DIR (no FS checks). */
export function resolveDiConnectRoot(explicit?: string): string | null {
  const candidate = explicit?.trim() || process.env.GARMIN_EXPORT_DIR?.trim();
  return candidate ? path.resolve(candidate) : null;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve and normalize to a real DI_CONNECT root.
 * Accepts either the DI_CONNECT folder itself or a parent that contains DI_CONNECT
 * (e.g. "Garmin Data"). Prefer tool arg, else GARMIN_EXPORT_DIR.
 */
export async function normalizeDiConnectRoot(
  explicit?: string,
): Promise<string> {
  const raw = resolveDiConnectRoot(explicit);
  if (!raw) {
    throw new Error(
      "No Garmin export path. Set GARMIN_EXPORT_DIR in .env or pass diConnectPath.",
    );
  }

  const candidates: string[] = [];
  if (path.basename(raw) === "DI_CONNECT") {
    candidates.push(raw);
  } else {
    candidates.push(raw, path.join(raw, "DI_CONNECT"));
  }

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    const fitness = path.join(candidate, "DI-Connect-Fitness");
    const uploaded = path.join(candidate, "DI-Connect-Uploaded-Files");
    if ((await pathExists(fitness)) || (await pathExists(uploaded))) {
      return candidate;
    }
    // Folder named DI_CONNECT even if subfolders differ slightly
    if (path.basename(candidate) === "DI_CONNECT") {
      return candidate;
    }
  }

  throw new Error(
    `Garmin export not found or incomplete at "${raw}". Expected DI_CONNECT with DI-Connect-Fitness (summarizedActivities.json).`,
  );
}

async function walkFiles(dir: string, matcher: (name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...(await walkFiles(full, matcher)));
    } else if (entry.isFile() && matcher(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Find `*_summarizedActivities.json` under DI_CONNECT (prefer DI-Connect-Fitness). */
export async function findSummarizedActivitiesFile(
  diConnectRoot: string,
): Promise<string | null> {
  const fitnessDir = path.join(diConnectRoot, "DI-Connect-Fitness");
  const inFitness = await walkFiles(fitnessDir, (n) =>
    n.endsWith("summarizedActivities.json"),
  );
  if (inFitness.length > 0) {
    inFitness.sort();
    return inFitness[inFitness.length - 1]!;
  }
  const anywhere = await walkFiles(diConnectRoot, (n) =>
    n.endsWith("summarizedActivities.json"),
  );
  if (anywhere.length === 0) return null;
  anywhere.sort();
  return anywhere[anywhere.length - 1]!;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function mapSport(activityType: string | undefined, distanceKm: number): Sport {
  const t = (activityType ?? "").toLowerCase();
  if (t.includes("trail")) {
    return distanceKm >= 42.2 ? "ultra" : "trail_run";
  }
  if (
    t.includes("running") ||
    t === "run" ||
    t.includes("track") ||
    t.includes("treadmill")
  ) {
    return distanceKm >= 42.2 ? "ultra" : "run";
  }
  if (t.includes("cycl") || t.includes("bike") || t.includes("biking")) {
    return "bike";
  }
  if (t.includes("swim")) return "swim";
  if (t.includes("strength") || t.includes("weight") || t.includes("fitness_equipment")) {
    return "strength";
  }
  return "other";
}

function toIsoUtc(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Garmin summarized export units (observed):
 * - distance: centimeters → km = / 100_000
 * - duration: milliseconds → min = / 60_000
 * - elevationGain: centimeters → m = / 100
 * - avgRunCadence: often half-spm → * 2 when < 100
 */
export function mapSummarizedActivity(
  raw: Record<string, unknown>,
  sourceFile: string,
  profile?: AthleteHrProfile | null,
): Activity | null {
  const activityId = raw.activityId ?? raw.activityid;
  if (activityId == null) return null;

  const distanceCm = num(raw.distance) ?? 0;
  const durationMs = num(raw.duration) ?? num(raw.movingDuration) ?? 0;
  const distanceKm = distanceCm / 100_000;
  const durationMin = durationMs / 60_000;
  if (durationMin <= 0 && distanceKm <= 0) return null;

  const startMs =
    num(raw.startTimeGmt) ?? num(raw.beginTimestamp) ?? num(raw.startTimeLocal);
  const elevCm = num(raw.elevationGain);
  const avgHr = num(raw.avgHr);
  const maxHr = num(raw.maxHr);
  const calories = num(raw.calories);
  const avgPower = num(raw.avgPower) ?? num(raw.normPower);
  const vo2 = num(raw.vO2MaxValue) ?? num(raw.vo2MaxValue);
  const aerobicTe =
    num(raw.aerobicTrainingEffect) ?? num(raw.trainingEffect);
  const anaerobicTe = num(raw.anaerobicTrainingEffect);
  const teLabel =
    typeof raw.trainingEffectLabel === "string"
      ? raw.trainingEffectLabel
      : null;

  let cadence = num(raw.avgRunCadence) ?? num(raw.avgDoubleCadence);
  const sport = mapSport(
    typeof raw.activityType === "string" ? raw.activityType : undefined,
    distanceKm,
  );
  if (
    cadence != null &&
    cadence < 100 &&
    (sport === "run" || sport === "trail_run" || sport === "ultra")
  ) {
    cadence = cadence * 2;
  }

  let pace: number | null = null;
  if (distanceKm > 0.05 && durationMin > 0) {
    pace = durationMin / distanceKm;
  }

  const temp =
    num(raw.maxTemperature) ?? num(raw.minTemperature) ?? num(raw.avgTemperature);

  const name = typeof raw.name === "string" ? raw.name : null;
  const device =
    typeof raw.deviceName === "string"
      ? raw.deviceName
      : raw.deviceId != null
        ? String(raw.deviceId)
        : null;

  const durationRounded = round(durationMin, 2);
  const avgHrRounded = avgHr != null ? Math.round(avgHr) : null;
  const trimp = profile
    ? computeBanisterTrimp(durationRounded, avgHrRounded, profile)
    : null;

  return {
    activity_id: String(activityId),
    date: toIsoUtc(startMs),
    sport,
    duration_min: durationRounded,
    distance_km: round(distanceKm, 3),
    elevation_gain_m: elevCm != null ? round(elevCm / 100, 1) : null,
    avg_hr: avgHrRounded,
    max_hr: maxHr != null ? Math.round(maxHr) : null,
    avg_pace_min_per_km: pace != null ? round(pace, 2) : null,
    avg_cadence_spm: cadence != null ? Math.round(cadence) : null,
    avg_power_watts: avgPower != null ? Math.round(avgPower) : null,
    aerobic_te: aerobicTe != null ? round(aerobicTe, 2) : null,
    anaerobic_te: anaerobicTe != null ? round(anaerobicTe, 2) : null,
    training_effect_label: teLabel,
    trimp,
    load_score: trimp,
    training_load_garmin: null,
    vo2max_estimate: vo2 != null ? round(vo2, 1) : null,
    calories: calories != null ? Math.round(calories) : null,
    temperature_c: temp != null ? round(temp, 1) : null,
    device,
    notes: name,
    source_file: sourceFile,
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export async function loadSummarizedActivities(
  filePath: string,
): Promise<Activity[]> {
  const text = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(text) as unknown;
  const sourceFile = path.basename(filePath);

  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      if (
        block &&
        typeof block === "object" &&
        Array.isArray(
          (block as { summarizedActivitiesExport?: unknown })
            .summarizedActivitiesExport,
        )
      ) {
        rows.push(
          ...((block as { summarizedActivitiesExport: Record<string, unknown>[] })
            .summarizedActivitiesExport),
        );
      } else if (block && typeof block === "object" && "activityId" in block) {
        rows.push(block as Record<string, unknown>);
      }
    }
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray(
      (parsed as { summarizedActivitiesExport?: unknown }).summarizedActivitiesExport,
    )
  ) {
    rows = (parsed as { summarizedActivitiesExport: Record<string, unknown>[] })
      .summarizedActivitiesExport;
  }

  // Pass 1: map without TRIMP to collect max HR
  const draft: Activity[] = [];
  for (const row of rows) {
    const mapped = mapSummarizedActivity(row, sourceFile, null);
    if (mapped) draft.push(mapped);
  }

  const dailyRhr = await loadDailyRhrValues();
  const profile = resolveAthleteHrProfile({
    dailyRhrValues: dailyRhr,
    activityMaxHrSamples: draft
      .filter((a) => a.max_hr != null)
      .map((a) => ({ date: a.date, max_hr: a.max_hr! })),
    activityMaxHrs: draft
      .map((a) => a.max_hr)
      .filter((n): n is number => n != null),
  });

  // Pass 2: attach Banister TRIMP
  const out = draft.map((a) => {
    const trimp = computeBanisterTrimp(a.duration_min, a.avg_hr, profile);
    return { ...a, trimp, load_score: trimp, training_load_garmin: null };
  });

  await saveAthleteHrProfile(profile);
  return out;
}

type SleepDay = {
  calendarDate: string;
  deepSleepSeconds: number | null;
  lightSleepSeconds: number | null;
  remSleepSeconds: number | null;
  awakeSleepSeconds: number | null;
  totalSleepSeconds: number | null;
  avgSleepStress: number | null;
  overallSleepScore: number | null;
  qualityScore: number | null;
  recoveryScore: number | null;
};

type DailySummary = {
  calendarDate: string;
  restingHeartRate: number | null;
  minHeartRate: number | null;
  maxHeartRate: number | null;
  totalSteps: number | null;
  totalDistanceMeters: number | null;
  moderateIntensityMinutes: number | null;
  vigorousIntensityMinutes: number | null;
  highlyActiveSeconds: number | null;
  activeSeconds: number | null;
  bodyBatteryCharged: number | null;
  bodyBatteryDrained: number | null;
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  avgStress: number | null;
  maxStress: number | null;
};

type Vo2Row = {
  calendarDate: string;
  sport: string | null;
  vo2MaxValue: number | null;
};

type RacePred = {
  calendarDate: string;
  raceTime5K_sec: number | null;
  raceTime10K_sec: number | null;
  raceTimeHalf_sec: number | null;
  raceTimeMarathon_sec: number | null;
};

async function readJsonFiles(files: string[]): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for (const file of files) {
    try {
      chunks.push(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      // skip unreadable
    }
  }
  return chunks;
}

function flattenArrayPayloads(chunks: unknown[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunks) {
    if (Array.isArray(chunk)) {
      for (const item of chunk) {
        if (item && typeof item === "object") {
          rows.push(item as Record<string, unknown>);
        }
      }
    }
  }
  return rows;
}

function normalizeSleep(row: Record<string, unknown>): SleepDay | null {
  const calendarDate =
    typeof row.calendarDate === "string" ? row.calendarDate : null;
  if (!calendarDate) return null;
  const scores =
    row.sleepScores && typeof row.sleepScores === "object"
      ? (row.sleepScores as Record<string, unknown>)
      : {};
  const deep = num(row.deepSleepSeconds);
  const light = num(row.lightSleepSeconds);
  const rem = num(row.remSleepSeconds);
  const awake = num(row.awakeSleepSeconds);
  const parts = [deep, light, rem].filter((x): x is number => x != null);
  const total = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  return {
    calendarDate,
    deepSleepSeconds: deep,
    lightSleepSeconds: light,
    remSleepSeconds: rem,
    awakeSleepSeconds: awake,
    totalSleepSeconds: total,
    avgSleepStress: num(row.avgSleepStress),
    overallSleepScore: num(scores.overallScore),
    qualityScore: num(scores.qualityScore),
    recoveryScore: num(scores.recoveryScore),
  };
}

function normalizeDaily(row: Record<string, unknown>): DailySummary | null {
  const calendarDate =
    typeof row.calendarDate === "string" ? row.calendarDate : null;
  if (!calendarDate) return null;

  const bb =
    row.bodyBattery && typeof row.bodyBattery === "object"
      ? (row.bodyBattery as Record<string, unknown>)
      : null;
  const bbStats = Array.isArray(bb?.bodyBatteryStatList)
    ? (bb.bodyBatteryStatList as Record<string, unknown>[])
    : [];
  const bbHigh = bbStats.find((s) => s.bodyBatteryStatType === "HIGHEST");
  const bbLow = bbStats.find((s) => s.bodyBatteryStatType === "LOWEST");

  const stressWrap =
    row.allDayStress && typeof row.allDayStress === "object"
      ? (row.allDayStress as Record<string, unknown>)
      : null;
  const stressList = Array.isArray(stressWrap?.aggregatorList)
    ? (stressWrap.aggregatorList as Record<string, unknown>[])
    : [];
  const stressTotal =
    stressList.find((s) => s.type === "TOTAL") ?? stressList[0] ?? null;

  return {
    calendarDate,
    restingHeartRate: num(row.restingHeartRate),
    minHeartRate: num(row.minHeartRate),
    maxHeartRate: num(row.maxHeartRate),
    totalSteps: num(row.totalSteps) ?? num(row.steps),
    totalDistanceMeters: num(row.totalDistanceMeters) ?? num(row.totalDistance),
    moderateIntensityMinutes: num(row.moderateIntensityMinutes),
    vigorousIntensityMinutes: num(row.vigorousIntensityMinutes),
    highlyActiveSeconds: num(row.highlyActiveSeconds),
    activeSeconds: num(row.activeSeconds),
    bodyBatteryCharged: bb ? num(bb.chargedValue) : null,
    bodyBatteryDrained: bb ? num(bb.drainedValue) : null,
    bodyBatteryHigh: bbHigh ? num(bbHigh.statsValue) : null,
    bodyBatteryLow: bbLow ? num(bbLow.statsValue) : null,
    avgStress: stressTotal ? num(stressTotal.averageStressLevel) : null,
    maxStress: stressTotal ? num(stressTotal.maxStressLevel) : null,
  };
}

function mergeByDate<T extends { calendarDate: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(row.calendarDate, row);
  }
  return [...map.values()].sort((a, b) =>
    a.calendarDate < b.calendarDate ? 1 : -1,
  );
}

export type EnrichmentImportResult = {
  sleep_days: number;
  daily_days: number;
  vo2_points: number;
  race_predictions: number;
  health_status_days: number;
  sources: string[];
  dir: string;
};

/** Import sleep, UDS daily, VO2max, race predictions, HRV status into data/enrichment. */
export async function importDiConnectEnrichment(
  diConnectRoot: string,
): Promise<EnrichmentImportResult> {
  const sources: string[] = [];

  const sleepFiles = (
    await walkFiles(path.join(diConnectRoot, "DI-Connect-Wellness"), (n) =>
      n.endsWith("_sleepData.json"),
    )
  ).sort();
  const udsFiles = (
    await walkFiles(path.join(diConnectRoot, "DI-Connect-Aggregator"), (n) =>
      n.startsWith("UDSFile_") && n.endsWith(".json"),
    )
  ).sort();
  const vo2Files = (
    await walkFiles(path.join(diConnectRoot, "DI-Connect-Metrics"), (n) =>
      n.startsWith("MetricsMaxMetData_") && n.endsWith(".json"),
    )
  ).sort();
  const raceFiles = (
    await walkFiles(path.join(diConnectRoot, "DI-Connect-Metrics"), (n) =>
      n.startsWith("RunRacePredictions_") && n.endsWith(".json"),
    )
  ).sort();
  const healthFiles = (
    await walkFiles(path.join(diConnectRoot, "DI-Connect-Wellness"), (n) =>
      n.endsWith("_healthStatusData.json"),
    )
  ).sort();

  sources.push(...sleepFiles, ...udsFiles, ...vo2Files, ...raceFiles, ...healthFiles);

  const sleepRows = flattenArrayPayloads(await readJsonFiles(sleepFiles))
    .map(normalizeSleep)
    .filter((x): x is SleepDay => x != null);
  const dailyRows = flattenArrayPayloads(await readJsonFiles(udsFiles))
    .map(normalizeDaily)
    .filter((x): x is DailySummary => x != null);

  const vo2Raw = flattenArrayPayloads(await readJsonFiles(vo2Files));
  const vo2Rows: Vo2Row[] = vo2Raw
    .map((row) => {
      const calendarDate =
        typeof row.calendarDate === "string" ? row.calendarDate : null;
      if (!calendarDate) return null;
      return {
        calendarDate,
        sport: typeof row.sport === "string" ? row.sport : null,
        vo2MaxValue: num(row.vo2MaxValue),
      };
    })
    .filter((x): x is Vo2Row => x != null);

  const raceRaw = flattenArrayPayloads(await readJsonFiles(raceFiles));
  const raceRows: RacePred[] = raceRaw
    .map((row) => {
      const calendarDate =
        typeof row.calendarDate === "string" ? row.calendarDate : null;
      if (!calendarDate) return null;
      return {
        calendarDate,
        raceTime5K_sec: num(row.raceTime5K),
        raceTime10K_sec: num(row.raceTime10K),
        raceTimeHalf_sec: num(row.raceTimeHalf),
        raceTimeMarathon_sec: num(row.raceTimeMarathon),
      };
    })
    .filter((x): x is RacePred => x != null);

  const healthRaw = flattenArrayPayloads(await readJsonFiles(healthFiles));
  const healthDays: {
    calendarDate: string;
    metrics: { type: string; value: number | null; status: string | null }[];
  }[] = [];
  for (const row of healthRaw) {
    const calendarDate =
      typeof row.calendarDate === "string"
        ? row.calendarDate
        : typeof row.date === "string"
          ? row.date
          : null;
    if (!calendarDate) continue;
    const metricsIn = Array.isArray(row.metrics) ? row.metrics : [];
    const metrics = metricsIn
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
      .map((m) => ({
        type: typeof m.type === "string" ? m.type : "unknown",
        value: num(m.value),
        status: typeof m.status === "string" ? m.status : null,
      }));
    if (metrics.length) {
      healthDays.push({ calendarDate, metrics });
    }
  }

  const sleep = mergeByDate(sleepRows);
  const daily = mergeByDate(dailyRows);
  const vo2 = mergeByDate(vo2Rows);
  const race = mergeByDate(raceRows);
  const health = mergeByDate(healthDays);

  await fs.mkdir(ENRICHMENT_DIR, { recursive: true });
  const updatedAt = new Date().toISOString();

  await fs.writeFile(
    path.join(ENRICHMENT_DIR, "sleep.json"),
    JSON.stringify({ updated_at: updatedAt, days: sleep }, null, 2),
  );
  await fs.writeFile(
    path.join(ENRICHMENT_DIR, "daily.json"),
    JSON.stringify({ updated_at: updatedAt, days: daily }, null, 2),
  );
  await fs.writeFile(
    path.join(ENRICHMENT_DIR, "vo2max.json"),
    JSON.stringify({ updated_at: updatedAt, points: vo2 }, null, 2),
  );
  await fs.writeFile(
    path.join(ENRICHMENT_DIR, "race_predictions.json"),
    JSON.stringify({ updated_at: updatedAt, predictions: race }, null, 2),
  );
  await fs.writeFile(
    path.join(ENRICHMENT_DIR, "health_status.json"),
    JSON.stringify({ updated_at: updatedAt, days: health }, null, 2),
  );
  await fs.writeFile(
    path.join(ENRICHMENT_DIR, "meta.json"),
    JSON.stringify(
      {
        updated_at: updatedAt,
        di_connect_root: diConnectRoot,
        source_count: sources.length,
        sources: sources.map((s) => path.relative(diConnectRoot, s)),
      },
      null,
      2,
    ),
  );

  return {
    sleep_days: sleep.length,
    daily_days: daily.length,
    vo2_points: vo2.length,
    race_predictions: race.length,
    health_status_days: health.length,
    sources: sources.map((s) => path.basename(s)),
    dir: ENRICHMENT_DIR,
  };
}

/** Load recent enrichment slices for readiness / coach context. */
export async function loadRecentEnrichment(days: number): Promise<{
  sleep: SleepDay[];
  daily: DailySummary[];
  vo2max: Vo2Row[];
  race_predictions: RacePred[];
  health_status: {
    calendarDate: string;
    metrics: { type: string; value: number | null; status: string | null }[];
  }[];
}> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  async function readPayload<T>(
    file: string,
    key: string,
  ): Promise<T[]> {
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<
        string,
        unknown
      >;
      const arr = raw[key];
      return Array.isArray(arr) ? (arr as T[]) : [];
    } catch {
      return [];
    }
  }

  const sleep = (
    await readPayload<SleepDay>(path.join(ENRICHMENT_DIR, "sleep.json"), "days")
  ).filter((d) => d.calendarDate >= cutoffStr);
  const daily = (
    await readPayload<DailySummary>(
      path.join(ENRICHMENT_DIR, "daily.json"),
      "days",
    )
  ).filter((d) => d.calendarDate >= cutoffStr);
  const vo2max = (
    await readPayload<Vo2Row>(path.join(ENRICHMENT_DIR, "vo2max.json"), "points")
  ).filter((d) => d.calendarDate >= cutoffStr);
  const race_predictions = (
    await readPayload<RacePred>(
      path.join(ENRICHMENT_DIR, "race_predictions.json"),
      "predictions",
    )
  ).filter((d) => d.calendarDate >= cutoffStr);
  const health_status = (
    await readPayload<{
      calendarDate: string;
      metrics: { type: string; value: number | null; status: string | null }[];
    }>(path.join(ENRICHMENT_DIR, "health_status.json"), "days")
  ).filter((d) => d.calendarDate >= cutoffStr);

  return { sleep, daily, vo2max, race_predictions, health_status };
}
