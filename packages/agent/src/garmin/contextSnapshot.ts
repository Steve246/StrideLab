import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT, ENRICHMENT_DIR } from "../providers/dataDirectory.js";
import { getLatestSyncRuns } from "./syncLedger.js";

const CONTEXT_DIR = path.join(DATA_ROOT, "context");

type ContextSnapshot = {
  generated_at: string;
  data: {
    activity_count: number;
    latest_activity: Record<string, unknown> | null;
    recent_activities: Array<Record<string, unknown>>;
    daily_latest: Record<string, unknown> | null;
    sleep_latest: Record<string, unknown> | null;
    updated_at: { activities: string | null; daily: string | null; sleep: string | null };
  };
  sync_runs: Awaited<ReturnType<typeof getLatestSyncRuns>>;
  gaps: string[];
};

async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch { return null; }
}

export async function writeContextSnapshot() {
  const [activities, daily, sleep, runs] = await Promise.all([
    readJson<{ updated_at?: string; activities?: Array<Record<string, unknown>> }>(path.join(DATA_ROOT, "activities", "activities.json")),
    readJson<{ updated_at?: string; days?: Array<Record<string, unknown>> }>(path.join(ENRICHMENT_DIR, "daily.json")),
    readJson<{ updated_at?: string; days?: Array<Record<string, unknown>> }>(path.join(ENRICHMENT_DIR, "sleep.json")),
    getLatestSyncRuns(10),
  ]);
  const recent = (activities?.activities ?? []).slice(0, 14);
  const snapshot: ContextSnapshot = {
    generated_at: new Date().toISOString(),
    data: {
      activity_count: activities?.activities?.length ?? 0,
      latest_activity: recent[0] ?? null,
      recent_activities: recent,
      daily_latest: daily?.days?.[0] ?? null,
      sleep_latest: sleep?.days?.[0] ?? null,
      updated_at: {
        activities: activities?.updated_at ?? null,
        daily: daily?.updated_at ?? null,
        sleep: sleep?.updated_at ?? null,
      },
    },
    sync_runs: runs,
    gaps: [
      ...(activities ? [] : ["activities_not_imported"]),
      ...(daily ? [] : ["daily_metrics_not_imported"]),
      ...(sleep ? [] : ["sleep_not_imported"]),
    ],
  };
  await fs.mkdir(CONTEXT_DIR, { recursive: true });
  await fs.writeFile(path.join(CONTEXT_DIR, "current.json"), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await fs.writeFile(path.join(CONTEXT_DIR, "current.md"), renderMarkdown(snapshot), { mode: 0o600 });
  return snapshot;
}

export async function readContextSnapshot(): Promise<ContextSnapshot | null> {
  return readJson<ContextSnapshot>(path.join(CONTEXT_DIR, "current.json"));
}

function renderMarkdown(snapshot: ContextSnapshot) {
  const data = snapshot.data;
  const latest = data.latest_activity as Record<string, unknown> | null;
  return [
    "# Running Lab Context",
    "",
    `Generated: ${snapshot.generated_at}`,
    `Activities: ${data.activity_count}`,
    `Latest activity: ${String(latest?.date ?? "none")} · ${String(latest?.sport ?? "unknown")} · ${String(latest?.distance_km ?? "?")} km`,
    `Daily metrics updated: ${String(data.updated_at.daily ?? "not available")}`,
    `Sleep updated: ${String(data.updated_at.sleep ?? "not available")}`,
    `Gaps: ${snapshot.gaps.length ? snapshot.gaps.join(", ") : "none"}`,
    "",
    "This is a derived context snapshot. Canonical activity and enrichment records remain the source of truth.",
    "",
  ].join("\n");
}
