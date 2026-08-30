import { z } from "zod";

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
  /** Garmin aerobic Training Effect 0–5 (session stimulus, not load units). */
  aerobic_te: z.number().nullable(),
  /** Garmin anaerobic Training Effect 0–5. */
  anaerobic_te: z.number().nullable(),
  training_effect_label: z.string().nullable(),
  /** Banister TRIMP — primary internal training load. */
  trimp: z.number().nullable(),
  /** Alias of trimp for dashboards / acute:chronic. */
  load_score: z.number().nullable(),
  /**
   * @deprecated Was incorrectly filled with aerobic TE. Prefer aerobic_te / trimp.
   * Kept nullable for older rows; new imports set this to null.
   */
  training_load_garmin: z.number().nullable().optional(),
  vo2max_estimate: z.number().nullable(),
  calories: z.number().nullable(),
  temperature_c: z.number().nullable(),
  device: z.string().nullable(),
  notes: z.string().nullable(),
  source_file: z.string(),
});

export const activitiesResultSchema = z.object({
  activities: z.array(activitySchema),
});

export type Activity = z.infer<typeof activitySchema>;
