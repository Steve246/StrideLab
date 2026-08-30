import { z } from "zod";
import { createTool, createParsedCompletion } from "@anvia/core";
import { EXPORT_TOOLS_INSTRUCTION } from "../prompt/instruction.js";
import { DATA_DIR, EXPORTS_DIR } from "../providers/dataDirectory.js";
import { getModel } from "../providers/openai.js";
import { safeJsonBasename } from "../utils/safeFile.js";

import fs from "node:fs/promises";
import path from "node:path";

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");

export const ExportTools = z.object({
  week_start: z.string(),
  week_end: z.string(),
  mode: z.enum(["social", "details"]),
  totals: z.object({
    activities: z.number(),
    distance_km: z.number(),
    duration_min: z.number(),
    elevation_gain_m: z.number(),
  }),
  by_sport: z.array(
    z.object({
      sport: z.string(),
      count: z.number(),
      distance_km: z.number(),
      duration_min: z.number(),
    }),
  ),
  highlight: z.array(z.string()),
  plan_adherence: z.object({
    planned_sessions: z.number().nullable(),
    completed_sessions: z.number().nullable(),
    notes: z.string().nullable(),
  }),
  social_caption: z.string().nullable(),
  html_report: z.string().nullable(),
  saved_files: z.array(z.string()),
});

export const exportTools = createTool({
  name: "export_week",
  description: EXPORT_TOOLS_INSTRUCTION,
  input: z.object({
    mode: z.enum(["social", "details"]),
    days: z.number().min(7).max(14).optional(),
  }),
  execute: async ({ mode, days = 7 }) => {
    const text = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const payload = JSON.parse(text) as { activities?: unknown };
    const activites = Array.isArray(payload.activities)
      ? payload.activities
      : [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = activites.filter((a) => {
      const date =
        typeof a === "object" && a !== null && "date" in a
          ? String((a as { date: string }).date)
          : "";
      const t = Date.parse(date);
      return !Number.isNaN(t) && t >= cutoff;
    });

    const context = {
      mode,
      days,
      activites: recent,
    };
    const parsed = await createParsedCompletion(getModel(), {
      schema: ExportTools,
      instructions: EXPORT_TOOLS_INSTRUCTION,
      input: `Export a weekly report. mode=${mode}. Use ONLY this data:\n\n${JSON.stringify(context, null, 2)}`,
    });
    // save as html

    await fs.mkdir(EXPORTS_DIR, { recursive: true });
    const savedFiles: string[] = [];
    const baseName = safeJsonBasename(
      `${parsed.data.week_start}_${mode}`,
      "export",
    ).replace(/\.json$/i, "");
    // always save the json report

    const jsonPath = path.join(EXPORTS_DIR, `${baseName}.json`);

    const report = {
      ...parsed.data,
      saved_files: [...savedFiles, jsonPath],
    };

    // if details mode and HTML exists, save .html
    if (mode === "details" && parsed.data.html_report) {
      const htmlPath = path.join(EXPORTS_DIR, `${baseName}.html`);
      await fs.writeFile(htmlPath, parsed.data.html_report, "utf8");
      savedFiles.push(htmlPath);
    }
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    return {
      saved: jsonPath,
      export: report,
      activityCount: recent.length,
    };
  },
});
