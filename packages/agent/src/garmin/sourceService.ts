import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT } from "../providers/dataDirectory.js";
import { syncDiConnect } from "./syncDiConnect.js";
import { beginSyncRun, finishSyncRun, updateSyncRun } from "./syncLedger.js";
import { writeContextSnapshot } from "./contextSnapshot.js";

export type GarminSource = "manual_export" | "garmin_connect";
export type ConnectStatus = "disconnected" | "connecting" | "mfa_required" | "connected" | "expired" | "error";
export type ManualSourceOrigin = "ui" | "env" | "none";
export type GarminSourceStatus = {
  activeSource: GarminSource;
  manual: {
    configured: boolean;
    path: string | null;
    rawPath?: string | null;
    origin?: ManualSourceOrigin;
    hasOverride?: boolean;
    valid: boolean;
    latestImportAt: string | null;
  };
  connect: { status: ConnectStatus; accountLabel: string | null; lastSyncAt: string | null; latestActivityDate: string | null; message: string | null };
};

const stateFile = path.join(DATA_ROOT, "garmin-source.json");
/** Same override file the Lab UI writes (`packages/agent/data/...`). */
const sourceConfigFile = path.join(DATA_ROOT, "garmin-source-config.json");

async function readState() {
  try { return JSON.parse(await fs.readFile(stateFile, "utf8")) as Partial<GarminSourceStatus>; } catch { return {}; }
}

async function saveState(state: Partial<GarminSourceStatus>) {
  const current = await readState();
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify({ ...current, ...state }, null, 2), { mode: 0o600 });
}

async function exists(target: string): Promise<boolean> {
  try { await fs.access(target); return true; } catch { return false; }
}

/**
 * Resolve the manual export path with the documented precedence:
 * UI override → `GARMIN_EXPORT_DIR` → none. Mirrors the Lab UI so MCP clients
 * see the same source the dashboard uses.
 */
export async function resolveManualExportDir(): Promise<{
  rawPath: string | null;
  origin: ManualSourceOrigin;
  hasOverride: boolean;
  path: string | null;
  valid: boolean;
}> {
  let ui: string | null = null;
  try {
    const raw = JSON.parse(await fs.readFile(sourceConfigFile, "utf8")) as { manualExportDir?: string };
    ui = raw.manualExportDir?.trim() || null;
  } catch {
    // No override stored.
  }

  const env = process.env.GARMIN_EXPORT_DIR?.trim() || null;
  const rawPath = ui ?? env;
  const origin: ManualSourceOrigin = ui ? "ui" : env ? "env" : "none";
  if (!rawPath) {
    return { rawPath: null, origin: "none", hasOverride: false, path: null, valid: false };
  }

  const absolute = path.resolve(rawPath);
  const candidates = path.basename(absolute) === "DI_CONNECT"
    ? [absolute]
    : [absolute, path.join(absolute, "DI_CONNECT")];

  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    const fitness = path.join(candidate, "DI-Connect-Fitness");
    const uploaded = path.join(candidate, "DI-Connect-Uploaded-Files");
    if ((await exists(fitness)) || (await exists(uploaded)) || path.basename(candidate) === "DI_CONNECT") {
      return { rawPath, origin, hasOverride: Boolean(ui), path: candidate, valid: true };
    }
  }
  return { rawPath, origin, hasOverride: Boolean(ui), path: absolute, valid: false };
}

export async function getGarminSourceStatus(): Promise<GarminSourceStatus> {
  const state = await readState();
  const manual = await resolveManualExportDir();
  const connect = state.connect ?? { status: "disconnected" as const, accountLabel: null, lastSyncAt: null, latestActivityDate: null, message: null };
  return {
    activeSource: state.activeSource ?? "manual_export",
    manual: {
      configured: manual.origin !== "none",
      path: manual.path,
      rawPath: manual.rawPath,
      origin: manual.origin,
      hasOverride: manual.hasOverride,
      valid: manual.valid,
      latestImportAt: null,
    },
    connect,
  };
}

export async function syncActiveGarmin(days = 7) {
  const status = await getGarminSourceStatus();
  if (status.activeSource === "manual_export") {
    return syncDiConnect(status.manual.rawPath ?? undefined);
  }
  const run = await beginSyncRun({ source: "garmin_connect", mode: "quick", requestedWindow: { days } });
  if (run.status === "succeeded") return run;
  try {
    throw new Error("Garmin Connect sync must be completed through the configured local connector.");
  } catch (error) {
    await updateSyncRun(run.job_id, { error_code: "connector_not_configured" });
    await finishSyncRun(run.job_id, { status: "failed", warnings: [], error_code: "connector_not_configured" });
    throw error;
  }
}

export async function syncGarminConnect(days = 7) {
  return syncActiveGarmin(days);
}