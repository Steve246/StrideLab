import { z } from "zod";
import { FIT_TOOLS_INSTRUCTION } from "../prompt/instruction.js";
import { createTool } from "@anvia/core";
import { DATA_DIR, LOAD_DIR } from "../providers/dataDirectory.js";
import { safeJsonBasename } from "../utils/safeFile.js";
import {
  computeBanisterTrimp,
  computeLoadWindows,
  loadDailyRhrValues,
  resolveAthleteHrProfile,
  saveAthleteHrProfile,
} from "../garmin/trimp.js";

import fs from "node:fs/promises";
import path from "node:path";

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");

type StoredActivity = {
  date?: string;
  distance_km?: number;
  duration_min?: number;
  elevation_gain_m?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  trimp?: number | null;
  load_score?: number | null;
  aerobic_te?: number | null;
  /** legacy mis-mapped TE */
  training_load_garmin?: number | null;
};

export const fitTools = createTool({
  name: "fit_load",
  description: FIT_TOOLS_INSTRUCTION,
  input: z.object({
    days: z.number().min(28).max(90).optional(),
  }),
  execute: async ({ days = 56 }) => {
    const text = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const payload = JSON.parse(text) as { activities?: StoredActivity[] };
    const activities = Array.isArray(payload.activities)
      ? payload.activities
      : [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = activities.filter((a) => {
      const t = Date.parse(a.date ?? "");
      return !Number.isNaN(t) && t >= cutoff;
    });

    const dailyRhr = await loadDailyRhrValues();
    const profile = resolveAthleteHrProfile({
      dailyRhrValues: dailyRhr,
      activityMaxHrSamples: recent
        .filter((a) => a.max_hr != null && a.date)
        .map((a) => ({ date: a.date!, max_hr: a.max_hr! })),
      activityMaxHrs: recent
        .map((a) => a.max_hr)
        .filter((n): n is number => typeof n === "number"),
    });
    await saveAthleteHrProfile(profile);

    // Ensure TRIMP on rows (recompute if missing after schema revamp)
    const withLoad = recent.map((a) => {
      let trimp = a.trimp ?? a.load_score ?? null;
      if (trimp == null && a.duration_min != null) {
        trimp = computeBanisterTrimp(a.duration_min, a.avg_hr ?? null, profile);
      }
      return {
        ...a,
        trimp,
        load_score: trimp,
        aerobic_te:
          a.aerobic_te ??
          // legacy: training_load_garmin held TE 0–5
          (typeof a.training_load_garmin === "number" &&
          a.training_load_garmin <= 5.5
            ? a.training_load_garmin
            : null),
      };
    });

    const report = computeLoadWindows(withLoad, profile);

    await fs.mkdir(LOAD_DIR, { recursive: true });
    const fileName = safeJsonBasename(report.as_of, "load");
    const out = path.join(LOAD_DIR, fileName);
    await fs.writeFile(out, JSON.stringify(report, null, 2));

    return {
      saved: out,
      load: report,
      activityCount: withLoad.length,
      trimpSessions: withLoad.filter((a) => a.trimp != null).length,
    };
  },
});
