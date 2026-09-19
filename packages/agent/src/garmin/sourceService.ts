import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT } from "../providers/dataDirectory.js";
import { syncDiConnect } from "./syncDiConnect.js";
import { beginSyncRun, finishSyncRun, updateSyncRun } from "./syncLedger.js";
import { writeContextSnapshot } from "./contextSnapshot.js";

export type GarminSource = "manual_export" | "garmin_connect";
export type ConnectStatus = "disconnected" | "connecting" | "mfa_required" | "connected" | "expired" | "error";
export type GarminSourceStatus = {
  activeSource: GarminSource;
  manual: { configured: boolean; path: string | null; valid: boolean; latestImportAt: string | null };
  connect: { status: ConnectStatus; accountLabel: string | null; lastSyncAt: string | null; latestActivityDate: string | null; message: string | null };
};

const stateFile = path.join(DATA_ROOT, "garmin-source.json");

async function readState() {
  try { return JSON.parse(await fs.readFile(stateFile, "utf8")) as Partial<GarminSourceStatus>; } catch { return {}; }
}

async function saveState(state: Partial<GarminSourceStatus>) {
  const current = await readState();
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify({ ...current, ...state }, null, 2), { mode: 0o600 });
}

export async function getGarminSourceStatus(): Promise<GarminSourceStatus> {
  const state = await readState();
  const configured = Boolean(process.env.GARMIN_EXPORT_DIR?.trim());
  const connect = state.connect ?? { status: "disconnected" as const, accountLabel: null, lastSyncAt: null, latestActivityDate: null, message: null };
  return {
    activeSource: state.activeSource ?? "manual_export",
    manual: { configured, path: process.env.GARMIN_EXPORT_DIR?.trim() ?? null, valid: configured, latestImportAt: null },
    connect,
  };
}

export async function syncActiveGarmin(days = 7) {
  const status = await getGarminSourceStatus();
  if (status.activeSource === "manual_export") return syncDiConnect();
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
