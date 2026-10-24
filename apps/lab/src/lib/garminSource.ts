import fs from "node:fs/promises";
import path from "node:path";
import { liveGarminEnabled, loadLabEnv, personalSyncDays } from "./env";
import { AGENT_DATA_ROOT } from "./paths";
import { resolveManualSource } from "./garminSourceConfig";
import {
  forgetPersonalApiKey,
  type GarminDebugRequest,
  GarminPersonalError,
  keyHint,
  resolvePersonalApiKey,
  savePersonalApiKey,
  syncPersonalApi,
  verifyPersonalApiKey,
} from "./garminPersonal";

export type GarminSource = "manual_export" | "garmin_connect";
export type ConnectStatus = "disconnected" | "connected" | "expired" | "error";

export type GarminSourceStatus = {
  liveEnabled: boolean;
  /** Configured Personal API window (`GARMIN_PERSONAL_SYNC_DAYS`). */
  syncDays: number;
  activeSource: GarminSource;
  manual: {
    configured: boolean;
    path: string | null;
    rawPath: string | null;
    origin: "explicit" | "ui" | "env" | "none";
    valid: boolean;
    hasOverride: boolean;
    latestImportAt: string | null;
  };
  connect: {
    status: ConnectStatus;
    accountLabel: string | null;
    keyOrigin: "ui" | "env" | null;
    lastSyncAt: string | null;
    latestActivityDate: string | null;
    message: string | null;
    /** Soft-fail debug curls from the last sync (no secrets). */
    debugRequests: GarminDebugRequest[];
  };
};

type PersistedState = {
  activeSource?: GarminSource;
  connect?: Partial<GarminSourceStatus["connect"]>;
};

const STATE_FILE = path.join(AGENT_DATA_ROOT, "garmin-source.json");

async function readState(): Promise<PersistedState> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as PersistedState;
  } catch {
    return {};
  }
}

async function writeState(next: { activeSource: GarminSource; connect: GarminSourceStatus["connect"] }) {
  await fs.mkdir(AGENT_DATA_ROOT, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  await fs.chmod(STATE_FILE, 0o600);
}

async function manualStatus() {
  loadLabEnv();
  const resolved = await resolveManualSource();
  let latestImportAt: string | null = null;
  try {
    const meta = JSON.parse(await fs.readFile(path.join(AGENT_DATA_ROOT, "enrichment", "meta.json"), "utf8")) as { updated_at?: string };
    latestImportAt = meta.updated_at ?? null;
  } catch {
    // Manual data may exist without enrichment metadata.
  }
  return {
    configured: resolved.origin !== "none",
    path: resolved.path,
    rawPath: resolved.rawPath,
    origin: resolved.origin,
    valid: resolved.valid,
    hasOverride: resolved.origin === "ui",
    latestImportAt,
  };
}

function blankConnect(): GarminSourceStatus["connect"] {
  return {
    status: "disconnected",
    accountLabel: null,
    keyOrigin: null,
    lastSyncAt: null,
    latestActivityDate: null,
    message: null,
    debugRequests: [],
  };
}

export async function getGarminSourceStatus(): Promise<GarminSourceStatus> {
  const state = await readState();
  const manual = await manualStatus();
  const saved = {
    ...blankConnect(),
    ...state.connect,
    keyOrigin: null as GarminSourceStatus["connect"]["keyOrigin"],
    debugRequests: Array.isArray(state.connect?.debugRequests) ? state.connect!.debugRequests! : [],
  };
  let connect = saved;
  if (liveGarminEnabled()) {
    const key = await resolvePersonalApiKey();
    if (!key) {
      connect = { ...blankConnect(), lastSyncAt: saved.lastSyncAt, latestActivityDate: saved.latestActivityDate };
    } else {
      connect = { ...saved, accountLabel: keyHint(key.apiKey), keyOrigin: key.origin };
      try {
        await verifyPersonalApiKey(key.apiKey);
        connect = connect.status === "connected"
          ? { ...connect, status: "connected" }
          : { ...connect, status: "connected", message: null };
      } catch (error) {
        connect = {
          ...connect,
          status: error instanceof GarminPersonalError && error.code === "key_expired" ? "expired" : "error",
          message: error instanceof Error ? error.message : "This API key is not working.",
        };
      }
    }
  }
  return {
    liveEnabled: liveGarminEnabled(),
    syncDays: personalSyncDays(),
    activeSource: state.activeSource ?? (connect.status === "connected" ? "garmin_connect" : "manual_export"),
    manual,
    connect,
  };
}

export async function setGarminSource(source: GarminSource) {
  const current = await getGarminSourceStatus();
  await writeState({ activeSource: source, connect: current.connect });
  return getGarminSourceStatus();
}

export async function saveGarminPersonalKey(apiKey: string) {
  if (!liveGarminEnabled()) {
    throw new GarminPersonalError("Live Garmin is private and disabled. Use manual import.", "disabled", 404);
  }
  const saved = await savePersonalApiKey(apiKey);
  const current = await readState();
  await writeState({
    activeSource: "garmin_connect",
    connect: {
      ...blankConnect(),
      ...current.connect,
      status: "connected",
      accountLabel: saved.keyHint,
      keyOrigin: "ui",
      message: null,
    },
  });
  return { status: "connected" as const, keyHint: saved.keyHint };
}

export async function syncGarminConnect(days?: number) {
  if (!liveGarminEnabled()) {
    throw new GarminPersonalError("Live Garmin is private and disabled. Use manual import.", "disabled", 404);
  }
  const key = await resolvePersonalApiKey();
  if (!key) throw new GarminPersonalError("Add a Personal API key before syncing.", "key_missing");
  try {
    const result = await syncPersonalApi(key.apiKey, days);
    const current = await readState();
    await writeState({
      activeSource: "garmin_connect",
      connect: {
        ...blankConnect(),
        ...current.connect,
        status: "connected",
        accountLabel: keyHint(key.apiKey),
        keyOrigin: key.origin,
        lastSyncAt: new Date().toISOString(),
        latestActivityDate: result.latestActivityDate,
        message: result.warnings.length ? result.warnings.slice(0, 3).join("\n") : null,
        debugRequests: result.debugRequests ?? [],
      },
    });
    return { source: "garmin_connect" as const, status: "success" as const, ...result };
  } catch (error) {
    const current = await readState();
    await writeState({
      activeSource: current.activeSource ?? "garmin_connect",
      connect: {
        ...blankConnect(),
        ...current.connect,
        status: error instanceof GarminPersonalError && error.code === "key_expired" ? "expired" : "error",
        accountLabel: keyHint(key.apiKey),
        keyOrigin: key.origin,
        message: error instanceof Error ? error.message : "Garmin sync failed.",
      },
    });
    throw error;
  }
}

export async function disconnectGarmin() {
  await forgetPersonalApiKey();
  const current = await readState();
  await writeState({
    activeSource: "manual_export",
    connect: {
      ...blankConnect(),
      lastSyncAt: current.connect?.lastSyncAt ?? null,
      latestActivityDate: current.connect?.latestActivityDate ?? null,
      message: null,
    },
  });
  return getGarminSourceStatus();
}
