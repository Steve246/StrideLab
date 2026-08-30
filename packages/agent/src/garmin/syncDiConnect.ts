import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, ENRICHMENT_DIR } from "../providers/dataDirectory.js";
import type { Activity } from "../schemas/activity.js";
import {
  findSummarizedActivitiesFile,
  importDiConnectEnrichment,
  loadSummarizedActivities,
  normalizeDiConnectRoot,
} from "./diConnect.js";

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");

async function mergeAndSaveActivities(incoming: Activity[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let existing: Activity[] = [];
  try {
    const prev = JSON.parse(await fs.readFile(ACTIVITIES_FILE, "utf8")) as {
      activities?: Activity[];
    };
    existing = Array.isArray(prev.activities) ? prev.activities : [];
  } catch {
    existing = [];
  }

  const byId = new Map(existing.map((a) => [a.activity_id, a]));
  for (const activity of incoming) {
    byId.set(activity.activity_id, activity);
  }

  const merged = [...byId.values()].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date),
  );

  const payload = {
    updated_at: new Date().toISOString(),
    activities: merged,
  };

  await fs.writeFile(ACTIVITIES_FILE, JSON.stringify(payload, null, 2));
  return { merged, incoming };
}

/**
 * Deterministic Garmin DI_CONNECT sync — no LLM.
 * Used by garmin_import tool and by Training Lab Resync button.
 */
export async function syncDiConnect(diConnectPath?: string) {
  const root = await normalizeDiConnectRoot(diConnectPath);
  const summaryFile = await findSummarizedActivitiesFile(root);
  if (!summaryFile) {
    throw new Error(
      `No *summarizedActivities.json found under ${root}. Expected DI-Connect-Fitness/.`,
    );
  }

  const enrichment = await importDiConnectEnrichment(root);
  const incoming = await loadSummarizedActivities(summaryFile);
  const { merged } = await mergeAndSaveActivities(incoming);
  const withTrimp = incoming.filter((a) => a.trimp != null).length;

  let athlete_hr: unknown = null;
  try {
    athlete_hr = JSON.parse(
      await fs.readFile(path.join(ENRICHMENT_DIR, "athlete_hr.json"), "utf8"),
    );
  } catch {
    athlete_hr = null;
  }

  return {
    mode: "di_connect" as const,
    di_connect_root: root,
    summary_file: summaryFile,
    saved: ACTIVITIES_FILE,
    imported: incoming.length,
    total: merged.length,
    trimp_sessions: withTrimp,
    load_method: "banister_trimp",
    athlete_hr,
    enrichment,
  };
}
