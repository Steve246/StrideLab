import fs from "node:fs/promises";
import path from "node:path";
import { loadLabEnv, personalSyncDays } from "./env";
import { ACTIVITIES_FILE, AGENT_DATA_ROOT, ENRICHMENT_DIR } from "./paths";

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_URL = `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`;
const KEY_FILE = path.join(AGENT_DATA_ROOT, "garmin-personal-key.json");
const RAW_DIR = path.join(ENRICHMENT_DIR, "personal-api");

export type GarminDebugRequest = {
  id: string;
  status: number;
  path: string;
  responseBody: string;
  curl: string;
};

export class GarminPersonalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "key_missing"
      | "key_invalid"
      | "key_expired"
      | "key_revoked"
      | "rate_limited"
      | "network"
      | "token_failed"
      | "request_failed"
      | "disabled",
    readonly status = 400,
    readonly debug?: Omit<GarminDebugRequest, "id">,
  ) {
    super(message);
  }
}

/** Copy-paste curls for Lab UI / terminal. Never embeds the real key or bearer. */
function debugCurlForPath(pathAndQuery: string) {
  const url = `${BASE}${pathAndQuery}`;
  return [
    `# 1) Mint a 24h Bearer token (uses GARMIN_PERSONAL_API_KEY from your shell)`,
    `TOKEN=$(curl -sS -X POST '${TOKEN_URL}' \\`,
    `  -H "Authorization: ApiKey \${GARMIN_PERSONAL_API_KEY}")`,
    ``,
    `# 2) Replay the failing request`,
    `curl -sS -i '${url}' \\`,
    `  -H "Authorization: Bearer \${TOKEN}" \\`,
    `  -H 'Accept: application/json'`,
  ].join("\n");
}

type TokenCache = { hint: string; token: string; exp: number };
let tokenCache: TokenCache | null = null;

export function keyHint(apiKey: string) {
  return `••••${apiKey.slice(-4)}`;
}

export async function resolvePersonalApiKey(): Promise<{ apiKey: string; origin: "ui" | "env" } | null> {
  loadLabEnv();
  try {
    const saved = JSON.parse(await fs.readFile(KEY_FILE, "utf8")) as { apiKey?: string };
    if (saved.apiKey?.trim()) return { apiKey: saved.apiKey.trim(), origin: "ui" };
  } catch {
    // No saved key.
  }
  const env = process.env.GARMIN_PERSONAL_API_KEY?.trim();
  return env ? { apiKey: env, origin: "env" } : null;
}

export async function savePersonalApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new GarminPersonalError("Enter a Personal API key.", "key_missing");
  await ensureToken(trimmed, true);
  await fs.mkdir(AGENT_DATA_ROOT, { recursive: true });
  await fs.writeFile(KEY_FILE, JSON.stringify({ apiKey: trimmed, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  await fs.chmod(KEY_FILE, 0o600);
  return { keyHint: keyHint(trimmed), origin: "ui" as const };
}

export async function forgetPersonalApiKey() {
  tokenCache = null;
  await fs.rm(KEY_FILE, { force: true });
}

export async function syncPersonalApi(apiKey: string, requestedDays?: number) {
  const days = personalSyncDays(requestedDays);
  const warnings: string[] = [];
  const debugRequests: GarminDebugRequest[] = [];
  const [startDate, endDate] = windowBounds(days);
  const raw: Record<string, unknown> = {};

  // Dashboard data only: activities → activities.json; sleep → sleep.json;
  // daily summaries → daily.json (RHR / body battery / stress); HRV → health_status.json.
  raw.activities = await pull("activities", () => searchActivities(apiKey, startDate, endDate), warnings, debugRequests);
  raw.sleep = await pull("sleep", () => ranged(apiKey, days, 31, (a, b) => `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${a}&endDate=${b}`), warnings, debugRequests);
  raw.dailySummaries = await pull("daily-summaries", () => ranged(apiKey, days, 365, (a, b) => `/usersummary-service/v2/dailysummaries?startDate=${a}&endDate=${b}`), warnings, debugRequests);
  raw.hrv = await pull("hrv", () => ranged(apiKey, days, 28, (a, b) => `/hrv-service/hrv/daily/${a}/${b}`), warnings, debugRequests);

  const activities = asRecords(raw.activities);

  await writeRaw(raw);
  const sleepDays = await mergeSleep(asRecords(raw.sleep));
  const dailyDays = await mergeDaily(asRecords(raw.dailySummaries));
  await mergeHrv(asRecords(raw.hrv));
  const imported = await mergeActivities(activities);

  return {
    importedActivities: imported.incoming,
    totalActivities: imported.total,
    sleepDays,
    dailyDays,
    datasets: Object.keys(raw).length,
    warnings,
    debugRequests,
    latestActivityDate: imported.latest,
    days,
  };
}

async function pull(
  id: string,
  fn: () => Promise<unknown>,
  warnings: string[],
  debugRequests: GarminDebugRequest[],
) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GarminPersonalError && error.code !== "request_failed") throw error;
    warnings.push(`${id}: ${error instanceof Error ? error.message : "failed"}`);
    if (error instanceof GarminPersonalError && error.debug) {
      debugRequests.push({ id, ...error.debug });
    }
    return null;
  }
}

async function ranged(apiKey: string, days: number, maxDays: number, pathFor: (start: string, end: string) => string) {
  const chunks = [];
  for (const [start, end] of dateChunks(days, maxDays)) {
    chunks.push(await garminJson(apiKey, pathFor(start, end)));
  }
  return chunks.flatMap(asRecords);
}

async function searchActivities(apiKey: string, startDate: string, endDate: string) {
  const all: Record<string, unknown>[] = [];
  const limit = 100;
  for (let start = 0; start < 5000; start += limit) {
    const page = asRecords(await garminJson(
      apiKey,
      `/activitylist-service/activities/search/activities?start=${start}&limit=${limit}&startDate=${startDate}&endDate=${endDate}`,
    ));
    all.push(...page);
    if (page.length < limit) break;
  }
  return all;
}

export async function verifyPersonalApiKey(apiKey: string) {
  await ensureToken(apiKey);
}

async function ensureToken(apiKey: string, force = false) {
  const hint = keyHint(apiKey);
  if (!force && tokenCache && tokenCache.hint === hint && tokenCache.exp * 1000 > Date.now() + 60 * 60 * 1000) {
    return tokenCache.token;
  }
  const token = await exchangeApiKey(apiKey);
  tokenCache = { hint, token, exp: jwtExp(token) };
  return token;
}

async function exchangeApiKey(apiKey: string) {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `ApiKey ${apiKey}` } });
  } catch {
    throw new GarminPersonalError("Could not reach Garmin Personal API.", "network", 502);
  }
  const body = (await response.text()).trim();
  if (response.status === 429) {
    throw new GarminPersonalError("Garmin rate limit reached. Wait a few minutes and sync again.", "rate_limited", 429);
  }
  if (!response.ok) throw authError(response.status, body);
  if (!body.includes(".")) {
    throw new GarminPersonalError("Garmin did not return an access token for this key.", "token_failed", 502);
  }
  return body;
}

async function garminJson(apiKey: string, pathAndQuery: string, attempt = 0): Promise<unknown> {
  const token = await ensureToken(apiKey);
  let response: Response;
  try {
    response = await fetch(`${BASE}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new GarminPersonalError("Could not reach Garmin Personal API.", "network", 502);
  }
  if (response.status === 401 || response.status === 403) {
    tokenCache = null;
    const body = await response.text();
    if (attempt === 0) return garminJson(apiKey, pathAndQuery, 1);
    throw authError(response.status, body);
  }
  if (response.status === 429) {
    throw new GarminPersonalError("Garmin rate limit reached. Wait a few minutes and sync again.", "rate_limited", 429);
  }
  if (response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) {
    const pathOnly = pathAndQuery.split("?")[0] ?? pathAndQuery;
    throw new GarminPersonalError(
      `Garmin returned ${response.status} for ${pathOnly}.`,
      "request_failed",
      response.status,
      {
        status: response.status,
        path: pathAndQuery,
        responseBody: text.slice(0, 4000),
        curl: debugCurlForPath(pathAndQuery),
      },
    );
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function authError(status: number, body: string) {
  const text = body.toLowerCase();
  if (text.includes("expir")) {
    return new GarminPersonalError("This Personal API key has expired. Create a new key in Garmin Connect, then paste it here.", "key_expired", status);
  }
  if (text.includes("revok") || text.includes("delet")) {
    return new GarminPersonalError("This API key was revoked. Create a new key in Garmin Connect, then paste it here.", "key_revoked", status);
  }
  return new GarminPersonalError("This API key was rejected by Garmin. Create a new Personal API key and paste it here.", "key_invalid", status || 401);
}

function jwtExp(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    if (typeof payload.exp === "number") return payload.exp;
  } catch {
    // Fall through to a 24h local assumption. Garmin tokens last 24 hours.
  }
  return Math.floor(Date.now() / 1000) + 24 * 60 * 60;
}

function windowBounds(days: number) {
  const chunks = dateChunks(days, days);
  return chunks[0] ?? [ymd(new Date()), ymd(new Date())];
}

function dateChunks(days: number, maxDays: number): Array<[string, string]> {
  const end = startOfDay(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const chunks: Array<[string, string]> = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push([ymd(cursor), ymd(chunkEnd)]);
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function ymd(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(asRecords);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data.flatMap(asRecords);
  if (Array.isArray(value.hrvSummaries)) return value.hrvSummaries.flatMap(asRecords);
  if ("date" in value && "data" in value) return asRecords(value.data);
  return [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function score(bag: unknown, keys: string[]) {
  if (!isRecord(bag)) return null;
  for (const key of keys) {
    const item = bag[key];
    if (typeof item === "number") return item;
    if (isRecord(item) && num(item.value) != null) return num(item.value);
  }
  return null;
}

async function writeRaw(raw: Record<string, unknown>) {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.writeFile(
    path.join(RAW_DIR, "latest.json"),
    JSON.stringify({ updated_at: new Date().toISOString(), ...raw }, null, 2),
    { mode: 0o600 },
  );
}

async function readList<T>(file: string, key: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    return Array.isArray(parsed[key]) ? parsed[key] as T[] : [];
  } catch {
    return [];
  }
}

async function writeList(file: string, key: string, rows: unknown[]) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ updated_at: new Date().toISOString(), [key]: rows }, null, 2));
}

async function mergeSleep(rows: Record<string, unknown>[]) {
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
  const incoming: SleepDay[] = [];
  for (const row of rows) {
    const calendarDate = typeof row.calendarDate === "string" ? row.calendarDate : null;
    if (!calendarDate) continue;
    const deep = num(row.deepSleepSeconds);
    const light = num(row.lightSleepSeconds);
    const rem = num(row.remSleepSeconds);
    incoming.push({
      calendarDate,
      deepSleepSeconds: deep,
      lightSleepSeconds: light,
      remSleepSeconds: rem,
      awakeSleepSeconds: num(row.awakeSleepSeconds),
      totalSleepSeconds: num(row.sleepTimeSeconds) ?? [deep, light, rem].reduce<number | null>((sum, part) => (part == null ? sum : (sum ?? 0) + part), null),
      avgSleepStress: num(row.avgSleepStress),
      overallSleepScore: score(row.sleepScores, ["overall", "overallScore"]),
      qualityScore: score(row.sleepScores, ["quality", "qualityScore"]),
      recoveryScore: score(row.sleepScores, ["recovery", "recoveryScore"]),
    });
  }
  return overlayByDate(path.join(ENRICHMENT_DIR, "sleep.json"), "days", incoming);
}

async function mergeDaily(summaries: Record<string, unknown>[]) {
  type Daily = {
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
  const byDate = new Map<string, Daily>();
  for (const row of summaries) {
    const calendarDate = typeof row.calendarDate === "string" ? row.calendarDate : null;
    if (!calendarDate) continue;
    const heart = isRecord(row.heartRate) ? row.heartRate : {};
    const movement = isRecord(row.movement) ? row.movement : {};
    const step = isRecord(movement.steps) ? movement.steps : {};
    const intensity = isRecord(row.intensityMinutes) ? row.intensityMinutes : {};
    const stress = isRecord(row.stress) ? row.stress : {};
    const battery = isRecord(row.bodyBattery) ? row.bodyBattery : {};
    byDate.set(calendarDate, {
      calendarDate,
      restingHeartRate: num(heart.restingValue),
      minHeartRate: num(heart.minValue),
      maxHeartRate: num(heart.maxValue),
      totalSteps: num(step.value),
      totalDistanceMeters: num(step.distanceInMeters),
      moderateIntensityMinutes: num(intensity.moderate),
      vigorousIntensityMinutes: num(intensity.vigorous),
      highlyActiveSeconds: null,
      activeSeconds: null,
      bodyBatteryCharged: num(battery.chargedValue),
      bodyBatteryDrained: num(battery.drainedValue),
      bodyBatteryHigh: num(battery.maxValue),
      bodyBatteryLow: num(battery.minValue),
      avgStress: num(stress.avgLevel),
      maxStress: num(stress.maxLevel),
    });
  }
  return overlayByDate(path.join(ENRICHMENT_DIR, "daily.json"), "days", [...byDate.values()]);
}

async function mergeHrv(rows: Record<string, unknown>[]) {
  const file = path.join(ENRICHMENT_DIR, "health_status.json");
  const existing = await readList<{ calendarDate: string; metrics: { type: string; value: number | null; status: string | null }[] }>(file, "days");
  const byDate = new Map(existing.map((day) => [day.calendarDate, day]));
  for (const row of rows) {
    const calendarDate = typeof row.calendarDate === "string" ? row.calendarDate : null;
    const value = num(row.lastNightAvg);
    if (!calendarDate || value == null) continue;
    const previous = byDate.get(calendarDate);
    const metrics = (previous?.metrics ?? []).filter((metric) => metric.type !== "HRV");
    metrics.push({ type: "HRV", value, status: typeof row.status === "string" ? row.status : null });
    byDate.set(calendarDate, { calendarDate, metrics });
  }
  const days = [...byDate.values()].sort((a, b) => (a.calendarDate < b.calendarDate ? 1 : -1));
  await writeList(file, "days", days);
}

async function overlayByDate<T extends { calendarDate: string }>(file: string, key: string, incoming: T[]) {
  const existing = await readList<T>(file, key);
  const byDate = new Map(existing.map((row) => [row.calendarDate, row]));
  for (const row of incoming) byDate.set(row.calendarDate, row);
  const rows = [...byDate.values()].sort((a, b) => (a.calendarDate < b.calendarDate ? 1 : -1));
  await writeList(file, key, rows);
  return incoming.length;
}

async function mergeActivities(rows: Record<string, unknown>[]) {
  const mapped = rows.map(mapActivity).filter((row): row is ActivityRow => row != null);
  const withTrimp = await attachTrimp(mapped);
  let existing: ActivityRow[] = [];
  try {
    const parsed = JSON.parse(await fs.readFile(ACTIVITIES_FILE, "utf8")) as { activities?: ActivityRow[] };
    existing = parsed.activities ?? [];
  } catch {
    existing = [];
  }
  const byId = new Map(existing.map((activity) => [activity.activity_id, activity]));
  for (const activity of withTrimp) {
    const previous = byId.get(activity.activity_id);
    byId.set(activity.activity_id, previous ? keepRicher(previous, activity) : activity);
  }
  const activities = [...byId.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  await fs.mkdir(path.dirname(ACTIVITIES_FILE), { recursive: true });
  await fs.writeFile(ACTIVITIES_FILE, JSON.stringify({ updated_at: new Date().toISOString(), activities }, null, 2));
  return { incoming: withTrimp.length, total: activities.length, latest: activities[0]?.date ?? null };
}

type ActivityRow = {
  activity_id: string;
  date: string;
  sport: "run" | "trail_run" | "ultra" | "bike" | "swim" | "strength" | "other";
  duration_min: number;
  distance_km: number;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_pace_min_per_km: number | null;
  avg_cadence_spm: number | null;
  avg_power_watts: number | null;
  aerobic_te: number | null;
  anaerobic_te: number | null;
  training_effect_label: string | null;
  trimp: number | null;
  load_score: number | null;
  training_load_garmin: null;
  vo2max_estimate: number | null;
  calories: number | null;
  temperature_c: number | null;
  device: string | null;
  notes: string | null;
  source_file: string;
};

function mapActivity(raw: Record<string, unknown>): ActivityRow | null {
  if (raw.activityId == null) return null;
  const distanceKm = (num(raw.distance) ?? 0) / 1000;
  const durationMin = (num(raw.duration) ?? num(raw.movingDuration) ?? 0) / 60;
  if (distanceKm <= 0 && durationMin <= 0) return null;
  const date = activityDate(raw);
  if (!date) return null;
  const sport = mapSport(activityTypeKey(raw), distanceKm);
  const cadence = num(raw.averageRunningCadenceInStepsPerMinute) ?? num(raw.averageBikingCadenceInRevPerMinute);
  const pace = distanceKm > 0.05 && durationMin > 0 ? round(durationMin / distanceKm, 2) : null;
  return {
    activity_id: String(raw.activityId),
    date,
    sport,
    duration_min: round(durationMin, 2),
    distance_km: round(distanceKm, 3),
    elevation_gain_m: num(raw.elevationGain) == null ? null : round(num(raw.elevationGain)!, 1),
    avg_hr: num(raw.averageHR) == null ? null : Math.round(num(raw.averageHR)!),
    max_hr: num(raw.maxHR) == null ? null : Math.round(num(raw.maxHR)!),
    avg_pace_min_per_km: pace,
    avg_cadence_spm: cadence == null ? null : Math.round(cadence),
    avg_power_watts: num(raw.avgPower) == null ? (num(raw.normPower) == null ? null : Math.round(num(raw.normPower)!)) : Math.round(num(raw.avgPower)!),
    aerobic_te: num(raw.aerobicTrainingEffect) == null ? null : round(num(raw.aerobicTrainingEffect)!, 2),
    anaerobic_te: num(raw.anaerobicTrainingEffect) == null ? null : round(num(raw.anaerobicTrainingEffect)!, 2),
    training_effect_label: typeof raw.trainingEffectLabel === "string" ? raw.trainingEffectLabel : null,
    trimp: null,
    load_score: null,
    training_load_garmin: null,
    vo2max_estimate: num(raw.vO2MaxValue) == null ? null : round(num(raw.vO2MaxValue)!, 1),
    calories: num(raw.calories) == null ? null : Math.round(num(raw.calories)!),
    temperature_c: num(raw.maxTemperature) == null ? (num(raw.minTemperature) == null ? null : round(num(raw.minTemperature)!, 1)) : round(num(raw.maxTemperature)!, 1),
    device: typeof raw.manufacturer === "string" ? raw.manufacturer : null,
    notes: typeof raw.activityName === "string" ? raw.activityName : null,
    source_file: "garmin-personal-api",
  };
}

function activityTypeKey(raw: Record<string, unknown>) {
  if (typeof raw.activityType === "string") return raw.activityType;
  if (isRecord(raw.activityType) && typeof raw.activityType.typeKey === "string") return raw.activityType.typeKey;
  return "";
}

function activityDate(raw: Record<string, unknown>) {
  const ms = num(raw.beginTimestamp);
  if (ms != null && ms > 1e11) return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  if (typeof raw.startTimeGMT !== "string" || !raw.startTimeGMT.trim()) return null;
  const normalized = raw.startTimeGMT.includes("T") ? raw.startTimeGMT : raw.startTimeGMT.replace(" ", "T");
  const stamped = /Z|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = Date.parse(stamped);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().replace(/\.\d{3}Z$/, "Z") : null;
}

function mapSport(typeKey: string, distanceKm: number): ActivityRow["sport"] {
  const type = typeKey.toLowerCase();
  if (type.includes("trail")) return distanceKm >= 42.2 ? "ultra" : "trail_run";
  if (type.includes("run") || type.includes("track") || type.includes("treadmill")) return distanceKm >= 42.2 ? "ultra" : "run";
  if (type.includes("cycl") || type.includes("bik")) return "bike";
  if (type.includes("swim")) return "swim";
  if (type.includes("strength") || type.includes("fitness_equipment")) return "strength";
  return "other";
}

async function attachTrimp(activities: ActivityRow[]) {
  const trimp = await import("../../../../packages/agent/src/garmin/trimp");
  const profile = trimp.resolveAthleteHrProfile({
    dailyRhrValues: await trimp.loadDailyRhrValues(),
    activityMaxHrSamples: activities.filter((activity) => activity.max_hr != null).map((activity) => ({ date: activity.date, max_hr: activity.max_hr! })),
    activityMaxHrs: activities.map((activity) => activity.max_hr).filter((value): value is number => value != null),
  });
  await trimp.saveAthleteHrProfile(profile);
  return activities.map((activity) => {
    const load = trimp.computeBanisterTrimp(activity.duration_min, activity.avg_hr, profile);
    return { ...activity, trimp: load, load_score: load };
  });
}

function keepRicher(previous: ActivityRow, live: ActivityRow): ActivityRow {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(live) as Array<[keyof ActivityRow, ActivityRow[keyof ActivityRow]]>) {
    if (value !== null && value !== "") merged[key] = value as never;
  }
  return merged;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
