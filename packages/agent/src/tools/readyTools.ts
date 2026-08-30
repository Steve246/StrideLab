import { z } from "zod";

import { READY_TOOLS_INSTRUCTION } from "../prompt/instruction.js";

import { createParsedCompletion, createTool } from "@anvia/core";
import { getModel } from "../providers/openai.js";
import { DATA_DIR, READINESS_DIR } from "../providers/dataDirectory.js";
import { loadRecentEnrichment } from "../garmin/diConnect.js";
import fs from "node:fs/promises";
import path from "node:path";

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");

export const ReadinessTool = z.object({
  date: z.string().describe("The date of the activity"),
  readiness_score: z.number().describe("the readiness score of my activity"),
  status: z
    .enum(["ready", "caution", "recover"])
    .describe("The status of my activity"),
  drivers: z.array(
    z.object({
      factor: z
        .string()
        .describe("The factor that influenced the readiness score"),
      impact: z.enum(["positive", "negative", "neutral"]),
      detail: z
        .string()
        .describe(
          "The detail of the factor that influenced the readiness score",
        ),
    }),
  ),
  recommended_intensity: z
    .enum(["easy", "moderate", "hard", "rest"])
    .describe("suggested intensity for today"),
  data_gaps: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export const readyTools = createTool({
  name: "read_tools",
  description: READY_TOOLS_INSTRUCTION,
  input: z.object({
    days: z.number().min(7).max(14).optional(),
  }),
  execute: async ({ days = 14 }) => {
    const text = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const payload = JSON.parse(text) as { activities?: unknown[] };
    const activities = Array.isArray(payload.activities)
      ? payload.activities
      : [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = activities.filter((a) => {
      const date =
        typeof a === "object" && a !== null && "date" in a
          ? String((a as { date: string }).date)
          : "";
      const t = Date.parse(date);
      return !Number.isNaN(t) && t >= cutoff;
    });

    const enrichment = await loadRecentEnrichment(days);

    const parsed = await createParsedCompletion(getModel(), {
      schema: ReadinessTool,
      instructions: READY_TOOLS_INSTRUCTION,
      input: `Analyze readiness from the last ${days} days.

## Recent activities
${JSON.stringify(recent, null, 2)}

## Enrichment (from DI_CONNECT — use when present; never invent missing values)
### Sleep
${JSON.stringify(enrichment.sleep, null, 2)}

### Daily (resting HR, steps, intensity minutes)
${JSON.stringify(enrichment.daily, null, 2)}

### Health status (HRV etc.)
${JSON.stringify(enrichment.health_status, null, 2)}

### VO2max trend
${JSON.stringify(enrichment.vo2max, null, 2)}

### Race predictions (seconds)
${JSON.stringify(enrichment.race_predictions, null, 2)}
`,
    });

    await fs.mkdir(READINESS_DIR, { recursive: true });
    const out = path.join(READINESS_DIR, `${parsed.data.date}.json`);
    await fs.writeFile(out, JSON.stringify(parsed.data, null, 2));
    return {
      saved: out,
      readiness: parsed.data,
      activityCount: recent.length,
      enrichment: {
        sleep_days: enrichment.sleep.length,
        daily_days: enrichment.daily.length,
        health_days: enrichment.health_status.length,
        vo2_points: enrichment.vo2max.length,
      },
    };
  },
});
