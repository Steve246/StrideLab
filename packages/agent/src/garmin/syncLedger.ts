import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_ROOT } from "../providers/dataDirectory.js";

export type SyncSource = "manual_export" | "garmin_connect";
export type SyncMode = "quick" | "backfill" | "manual";
export type SyncStatus = "queued" | "running" | "partial" | "succeeded" | "failed";

export type SyncRun = {
  job_id: string;
  idempotency_key: string;
  source: SyncSource;
  mode: SyncMode;
  requested_window: { days?: number; from?: string; to?: string };
  status: SyncStatus;
  started_at: string;
  completed_at: string | null;
  heartbeat_at: string;
  checkpoint: string | null;
  pages_completed: number;
  records_seen: number;
  inserted: number;
  updated: number;
  warnings: string[];
  error_code: string | null;
};

const LEDGER_DIR = path.join(DATA_ROOT, "syncs");
const LEDGER_FILE = path.join(LEDGER_DIR, "syncs.json");
const MAX_RUNS = 100;

async function readRuns(): Promise<SyncRun[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(LEDGER_FILE, "utf8")) as { runs?: SyncRun[] };
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}

async function writeRuns(runs: SyncRun[]) {
  await fs.mkdir(LEDGER_DIR, { recursive: true });
  const temp = `${LEDGER_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ updated_at: new Date().toISOString(), runs: runs.slice(-MAX_RUNS) }, null, 2), { mode: 0o600 });
  await fs.rename(temp, LEDGER_FILE);
  await fs.chmod(LEDGER_FILE, 0o600);
}

function id() {
  return randomUUID();
}

export async function beginSyncRun(input: {
  source: SyncSource;
  mode: SyncMode;
  requestedWindow?: SyncRun["requested_window"];
  idempotencyKey?: string;
}) {
  const runs = await readRuns();
  const key = input.idempotencyKey ?? id();
  const existing = runs.find((run) => run.idempotency_key === key);
  if (existing) return existing;
  const now = new Date().toISOString();
  const run: SyncRun = {
    job_id: id(),
    idempotency_key: key,
    source: input.source,
    mode: input.mode,
    requested_window: input.requestedWindow ?? {},
    status: "running",
    started_at: now,
    completed_at: null,
    heartbeat_at: now,
    checkpoint: null,
    pages_completed: 0,
    records_seen: 0,
    inserted: 0,
    updated: 0,
    warnings: [],
    error_code: null,
  };
  await writeRuns([...runs, run]);
  return run;
}

export async function updateSyncRun(jobId: string, patch: Partial<SyncRun>) {
  const runs = await readRuns();
  const index = runs.findIndex((run) => run.job_id === jobId);
  if (index < 0) return null;
  const current = runs[index];
  if (!current) return null;
  const updated = Object.assign({}, current, patch, {
    heartbeat_at: new Date().toISOString(),
  }) as SyncRun;
  runs[index] = updated;
  await writeRuns(runs);
  return updated;
}

export async function finishSyncRun(jobId: string, patch: Pick<SyncRun, "status" | "warnings" | "error_code">) {
  return updateSyncRun(jobId, { ...patch, completed_at: new Date().toISOString() });
}

export async function getLatestSyncRuns(limit = 20) {
  const runs = await readRuns();
  return runs.slice(-Math.max(1, Math.min(limit, MAX_RUNS))).reverse();
}
