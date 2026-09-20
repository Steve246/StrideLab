import { createParsedCompletion, createTool } from "@anvia/core";
import { GAR_TOOLS_INSTRUCTION } from "../prompt/instruction.js";
import { z } from "zod";
import { getModel } from "../providers/openai.js";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../providers/dataDirectory.js";
import {
  activitySchema,
  activitiesResultSchema,
  type Activity,
} from "../schemas/activity.js";
import {
  loadSummarizedActivities,
  readManualSourceOverride,
  resolveDiConnectRoot,
} from "../garmin/diConnect.js";
import { syncDiConnect } from "../garmin/syncDiConnect.js";

export { activitySchema };

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

async function importFromCsvOrText(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const sourceFile = path.basename(filePath);

  const parsed = await createParsedCompletion(getModel(), {
    schema: activitiesResultSchema,
    instructions: GAR_TOOLS_INSTRUCTION,
    input: `Normalize ALL rows into { "activities": [ ... ] }. source_file=${sourceFile}\n\n${raw}`,
  });

  const incoming = parsed.data.activities.map((row) => ({
    ...row,
    aerobic_te: row.aerobic_te ?? null,
    anaerobic_te: row.anaerobic_te ?? null,
    training_effect_label: row.training_effect_label ?? null,
    trimp: row.trimp ?? null,
    load_score: row.load_score ?? row.trimp ?? null,
    training_load_garmin: null,
    source_file: sourceFile,
  }));

  const { merged } = await mergeAndSaveActivities(incoming);

  return {
    mode: "file_llm" as const,
    saved: ACTIVITIES_FILE,
    imported: incoming.length,
    total: merged.length,
  };
}

export const garTools = createTool({
  name: "garmin_import",
  description: GAR_TOOLS_INSTRUCTION,
  input: z.object({
    diConnectPath: z
      .string()
      .optional()
      .describe(
        "Optional. Absolute path to DI_CONNECT (or parent containing it). Omit to use GARMIN_EXPORT_DIR from .env — preferred for sync.",
      ),
    filePath: z
      .string()
      .optional()
      .describe(
        "Optional single CSV/JSON file. Use only if not importing a DI_CONNECT folder.",
      ),
  }),
  execute: async ({ diConnectPath, filePath }) => {
    const configured =
      diConnectPath?.trim() ||
      (await readManualSourceOverride()) ||
      resolveDiConnectRoot();
    if (configured) {
      return syncDiConnect(diConnectPath);
    }

    if (filePath) {
      const resolved = path.resolve(filePath);
      const base = path.basename(resolved).toLowerCase();
      if (base.endsWith("summarizedactivities.json")) {
        const incoming = await loadSummarizedActivities(resolved);
        const { merged } = await mergeAndSaveActivities(incoming);
        return {
          mode: "summarized_json" as const,
          saved: ACTIVITIES_FILE,
          imported: incoming.length,
          total: merged.length,
          summary_file: resolved,
        };
      }
      return importFromCsvOrText(resolved);
    }

    throw new Error(
      "Provide diConnectPath, set GARMIN_EXPORT_DIR in .env, or pass filePath to a CSV/JSON export.",
    );
  },
});
