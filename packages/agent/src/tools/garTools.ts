import { createParsedCompletion, createTool } from "@anvia/core";
import { GAR_TOOLS_INSTRUCTION } from "../prompt/instruction.js";
import { z } from "zod";
import { getModel } from "../providers/openai.js";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../providers/dataDirectory.js";

export const activitySchema = z.object({
  activity_id: z.string(),
  date: z.string(),
  sport: z.enum([
    "run",
    "trail_run",
    "ultra",
    "bike",
    "swim",
    "strength",
    "other",
  ]),
  duration_min: z.number(),
  distance_km: z.number(),
  elevation_gain_m: z.number().nullable(),
  avg_hr: z.number().nullable(),
  max_hr: z.number().nullable(),
  avg_pace_min_per_km: z.number().nullable(),
  avg_cadence_spm: z.number().nullable(),
  avg_power_watts: z.number().nullable(),
  training_load_garmin: z.number().nullable(),
  vo2max_estimate: z.number().nullable(),
  calories: z.number().nullable(),
  temperature_c: z.number().nullable(),
  device: z.string().nullable(),
  notes: z.string().nullable(),
  source_file: z.string(),
});

const activitiesResultSchema = z.object({
  activities: z.array(activitySchema),
});

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");

export const garTools = createTool({
  name: "garmin_import",
  description: GAR_TOOLS_INSTRUCTION,
  input: z.object({
    filePath: z.string().describe("Path to FIT/GPX/CSV export"),
  }),
  execute: async ({ filePath }) => {
    const raw = await fs.readFile(filePath, "utf8");
    const sourceFile = path.basename(filePath);

    const parsed = await createParsedCompletion(getModel(), {
      schema: activitiesResultSchema,
      instructions: GAR_TOOLS_INSTRUCTION,
      input: `Normalize ALL rows into { "activities": [ ... ] }. source_file=${sourceFile}\n\n${raw}`,
    });

    const incoming = parsed.data.activities.map((row) => ({
      ...row,
      source_file: sourceFile,
    }));

    await fs.mkdir(DATA_DIR, { recursive: true });

    let existing: z.infer<typeof activitySchema>[] = [];
    try {
      const prev = JSON.parse(await fs.readFile(ACTIVITIES_FILE, "utf8")) as {
        activities?: z.infer<typeof activitySchema>[];
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

    return {
      saved: ACTIVITIES_FILE,
      imported: incoming.length,
      total: merged.length,
    };
  },
});
