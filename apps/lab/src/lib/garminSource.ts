import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { liveGarminEnabled, loadLabEnv } from "./env";
import { AGENT_DATA_ROOT, ACTIVITIES_FILE } from "./paths";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

export type GarminSource = "manual_export" | "garmin_connect";
export type ConnectStatus =
  | "disconnected"
  | "connecting"
  | "mfa_required"
  | "connected"
  | "expired"
  | "error";

export type GarminSourceStatus = {
  liveEnabled: boolean;
  activeSource: GarminSource;
  manual: {
    configured: boolean;
    path: string | null;
    valid: boolean;
    latestImportAt: string | null;
  };
  connect: {
    status: ConnectStatus;
    accountLabel: string | null;
    lastSyncAt: string | null;
    latestActivityDate: string | null;
    message: string | null;
  };
};

type PersistedState = Pick<GarminSourceStatus, "activeSource" | "connect">;
type ConnectorResponse = {
  ok: boolean;
  status?: ConnectStatus | "success" | "mfa_required";
  accountLabel?: string;
  challengeId?: string;
  activities?: Array<Record<string, unknown>>;
  error?: string;
  message?: string;
};

let connectorProcess: ReturnType<typeof spawn> | null = null;
let connectorReader: readline.Interface | null = null;
let connectorQueue: Array<{ resolve: (value: ConnectorResponse) => void; reject: (reason?: unknown) => void }> = [];

const STATE_FILE = path.join(AGENT_DATA_ROOT, "garmin-source.json");

async function readState(): Promise<Partial<PersistedState>> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

async function writeState(next: PersistedState) {
  await fs.mkdir(AGENT_DATA_ROOT, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  await fs.chmod(STATE_FILE, 0o600);
}

async function manualStatus() {
  loadLabEnv();
  const configured = Boolean(process.env.GARMIN_EXPORT_DIR?.trim());
  let valid = false;
  let resolvedPath: string | null = process.env.GARMIN_EXPORT_DIR?.trim() || null;
  if (configured) {
    try {
      const candidates = [resolvedPath!, path.join(resolvedPath!, "DI_CONNECT")];
      for (const candidate of candidates) {
        const fitness = path.join(candidate, "DI-Connect-Fitness");
        const uploaded = path.join(candidate, "DI-Connect-Uploaded-Files");
        try {
          await fs.access(candidate);
          resolvedPath = candidate;
          valid = true;
          if (await fs.access(fitness).then(() => true).catch(() => false) || await fs.access(uploaded).then(() => true).catch(() => false)) break;
        } catch {
          // Try the next supported export layout.
        }
      }
    } catch {
      valid = false;
    }
  }
  let latestImportAt: string | null = null;
  try {
    const meta = JSON.parse(
      await fs.readFile(path.join(AGENT_DATA_ROOT, "enrichment", "meta.json"), "utf8"),
    ) as { updated_at?: string };
    latestImportAt = meta.updated_at ?? null;
  } catch {
    // Manual data may exist without enrichment metadata.
  }
  return { configured, path: resolvedPath, valid, latestImportAt };
}

async function connectorRequest(payload: Record<string, unknown>): Promise<ConnectorResponse> {
  loadLabEnv();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const connectorSrc = path.join(repoRoot, "packages/garmin-connector/src");
  const command = process.env.GARMIN_CONNECTOR_COMMAND?.trim() || "./.venv-garmin/bin/python -m garmin_connector";
  const [executable, ...args] = command.split(/\s+/);
  if (!connectorProcess || connectorProcess.exitCode !== null) {
    connectorProcess = spawn(executable, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        PYTHONPATH: [connectorSrc, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = connectorProcess.stdout;
    if (!stdout) {
      connectorProcess.kill();
      connectorProcess = null;
      throw new Error("Garmin connector did not expose stdout.");
    }
    connectorReader = readline.createInterface({ input: stdout });
    connectorReader.on("line", (line) => {
      const pending = connectorQueue.shift();
      if (!pending) return;
      try {
        pending.resolve(JSON.parse(line) as ConnectorResponse);
      } catch {
        pending.reject(new Error("Garmin connector returned invalid JSON."));
      }
    });
    connectorProcess.on("error", (error) => {
      const queue = connectorQueue.splice(0);
      for (const pending of queue) pending.reject(error);
    });
    connectorProcess.on("close", (code) => {
      connectorProcess = null;
      connectorReader?.close();
      connectorReader = null;
      const queue = connectorQueue.splice(0);
      for (const pending of queue) pending.reject(new Error(
        `Garmin connector exited ${code ?? "unknown"}. Install it with: pnpm garmin:setup`,
      ));
    });
  }
  return new Promise((resolve, reject) => {
    connectorQueue.push({ resolve, reject });
    const stdin = connectorProcess?.stdin;
    if (!stdin) {
      connectorQueue.pop();
      reject(new Error("Garmin connector did not expose stdin."));
      return;
    }
    stdin.write(`${JSON.stringify(payload)}\n`);
  });
}

function maskEmail(email?: string | null) {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@", 2);
  return `${local.slice(0, 1)}${"•".repeat(Math.min(4, Math.max(2, local.length - 1)))}@${domain}`;
}

export async function getGarminSourceStatus(): Promise<GarminSourceStatus> {
  const state = await readState();
  const manual = await manualStatus();
  let connect = state.connect ?? {
    status: "disconnected" as const,
    accountLabel: null,
    lastSyncAt: null,
    latestActivityDate: null,
    message: null,
  };
  if (liveGarminEnabled() && process.env.GARMIN_CONNECTOR_COMMAND) {
    try {
      const response = await connectorRequest({ action: "status" });
      connect = {
        ...connect,
        status: response.status === "success" ? "connected" : (response.status ?? connect.status) as ConnectStatus,
        accountLabel: response.accountLabel ? maskEmail(response.accountLabel) : connect.accountLabel,
        message: response.message ?? connect.message,
      };
    } catch {
      // Keep the last known state when the optional connector is offline.
    }
  }
  return {
    liveEnabled: liveGarminEnabled(),
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

export async function startGarminLogin(email: string, password: string) {
  const response = await connectorRequest({ action: "login_start", email, password });
  if (!response.ok) throw new Error(response.error ?? "Garmin login failed.");
  if (response.status === "mfa_required") {
    return { status: "mfa_required" as const, challengeId: response.challengeId };
  }
  const current = await getGarminSourceStatus();
  await writeState({
    activeSource: "garmin_connect",
    connect: { ...current.connect, status: "connected", accountLabel: maskEmail(email), message: null },
  });
  return { status: "connected" as const, accountLabel: maskEmail(email) };
}

export async function resumeGarminLogin(challengeId: string, code: string) {
  const response = await connectorRequest({ action: "login_resume", challengeId, code });
  if (!response.ok) throw new Error(response.error ?? "Garmin verification failed.");
  const current = await getGarminSourceStatus();
  await writeState({
    activeSource: "garmin_connect",
    connect: { ...current.connect, status: "connected", accountLabel: maskEmail(response.accountLabel), message: null },
  });
  return { status: "connected" as const, accountLabel: maskEmail(response.accountLabel) };
}

export async function syncGarminConnect(days = 7) {
  const response = await connectorRequest({ action: "sync", days });
  if (!response.ok) throw new Error(response.error ?? "Garmin sync failed.");
  const incoming = response.activities ?? [];
  let existing: { activities?: Array<Record<string, unknown>> } = {};
  try {
    existing = JSON.parse(await fs.readFile(ACTIVITIES_FILE, "utf8")) as typeof existing;
  } catch {
    // First live sync.
  }
  const byId = new Map((existing.activities ?? []).map((activity) => [String(activity.activity_id), activity]));
  for (const activity of incoming) {
    const key = String(activity.activity_id);
    const previous = byId.get(key);
    // Live summaries are additive: preserve richer existing manual fields when
    // the live response omits them, while allowing fresh live values through.
    byId.set(key, previous ? mergeLiveActivity(previous, activity) : activity);
  }
  const activities = [...byId.values()].sort(
    (a, b) => Date.parse(String(b.date ?? "")) - Date.parse(String(a.date ?? "")),
  );
  await fs.mkdir(path.dirname(ACTIVITIES_FILE), { recursive: true });
  await fs.writeFile(ACTIVITIES_FILE, JSON.stringify({ updated_at: new Date().toISOString(), activities }, null, 2));
  const current = await getGarminSourceStatus();
  await writeState({
    activeSource: "garmin_connect",
    connect: {
      ...current.connect,
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      latestActivityDate: String(activities[0]?.date ?? current.connect.latestActivityDate ?? "") || null,
      message: null,
    },
  });
  return { source: "garmin_connect", status: "success", importedActivities: incoming.length, totalActivities: activities.length };
}

function mergeLiveActivity(
  previous: Record<string, unknown>,
  live: Record<string, unknown>,
) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(live)) {
    if (value !== null && value !== undefined && value !== "") merged[key] = value;
  }
  return merged;
}

export async function disconnectGarmin() {
  if (process.env.GARMIN_CONNECTOR_COMMAND) await connectorRequest({ action: "logout" });
  const current = await getGarminSourceStatus();
  await writeState({
    activeSource: current.manual.valid ? "manual_export" : "manual_export",
    connect: { ...current.connect, status: "disconnected", accountLabel: null, message: null },
  });
  return getGarminSourceStatus();
}
