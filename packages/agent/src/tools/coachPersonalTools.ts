import { z } from "zod";
import { createTool, createParsedCompletion } from "@anvia/core";
import { COACH_PERSONAL_TOOLS_INSTRUCTION } from "../prompt/instruction.js";
import { getModel } from "../providers/openai.js";
import {
  DATA_DIR,
  LOAD_DIR,
  PLANS_DIR,
  READINESS_DIR,
} from "../providers/dataDirectory.js";
import { safeJsonBasename } from "../utils/safeFile.js";
import fs from "node:fs/promises";
import path from "node:path";

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");

export const CoachPlanSchema = z.object({
  plan_id: z.string(),
  created_at: z.string(), // ISO8601

  focus: z.enum(["ultra_marathon", "ultra_trail", "running", "triathlon"]),
  sub_focus: z.string().nullable(), // "42K" | "100K" | "half_IM" | null

  goal: z.object({
    event_name: z.string().nullable(),
    target_distance_km: z.number().nullable(),
    target_date: z.string().nullable(), // "YYYY-MM-DD" or null — do not invent
    notes: z.string().nullable(),
  }),

  week_start: z.string(), // "YYYY-MM-DD"

  days: z.array(
    z.object({
      date: z.string(),
      sport: z.enum([
        "run",
        "trail_run",
        "ultra",
        "bike",
        "swim",
        "strength",
        "rest",
        "other",
      ]),
      session_type: z.enum([
        "easy",
        "long",
        "intervals",
        "tempo",
        "hills",
        "race",
        "recovery",
        "rest",
        "brick",
        "other",
      ]),
      distance_km: z.number().nullable(),
      duration_min: z.number().nullable(),
      elevation_gain_m: z.number().nullable(),
      intensity: z.enum(["easy", "moderate", "hard", "rest"]),
      purpose: z.string(),
      optional: z.boolean(),
    }),
  ),

  weekly_targets: z.object({
    distance_km: z.number(),
    duration_min: z.number(),
    key_sessions: z.array(z.string()),
  }),

  rationale: z.string(),
});

async function readLatestJson(dir: string): Promise<unknown | null> {
  try {
    const files = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".json"))
      .sort();
    if (files.length === 0) return null;
    const last = files[files.length - 1];
    if (!last) return null;
    const raw = await fs.readFile(path.join(dir, last), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const coachPersonalTools = createTool({
  name: "coach_plan",
  description: COACH_PERSONAL_TOOLS_INSTRUCTION,
  input: z.object({
    focus: z.enum(["ultra_marathon", "ultra_trail", "running", "triathlon"]),
    sub_focus: z.string().nullable().optional(),
    plan_days: z.number().min(7).max(21).optional(),
    event_name: z.string().nullable().optional(),
    target_distance_km: z.number().nullable().optional(),
    target_date: z.string().nullable().optional(),
    goal_notes: z.string().nullable().optional(),
  }),
  execute: async ({ focus, sub_focus = null, plan_days = 14, ...goal }) => {
    const text = await fs.readFile(ACTIVITIES_FILE, "utf8");
    const payload = JSON.parse(text) as { activities?: unknown[] };
    const activities = Array.isArray(payload.activities)
      ? payload.activities
      : [];

    const lookbackDays = 28;
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    const recent = activities.filter((a) => {
      const date =
        typeof a === "object" && a !== null && "date" in a
          ? String((a as { date: string }).date)
          : "";
      const t = Date.parse(date);
      return !Number.isNaN(t) && t >= cutoff;
    });

    const readiness = await readLatestJson(READINESS_DIR);
    const load = await readLatestJson(LOAD_DIR);

    const context = {
      focus,
      sub_focus,
      plan_days,
      goal: {
        event_name: goal.event_name ?? null,
        target_distance_km: goal.target_distance_km ?? null,
        target_date: goal.target_date ?? null,
        notes: goal.goal_notes ?? null,
      },
      activities: recent,
      readiness,
      load,
    };

    const parsed = await createParsedCompletion(getModel(), {
      schema: CoachPlanSchema,
      instructions: COACH_PERSONAL_TOOLS_INSTRUCTION,
      input: `Build a ${plan_days}-day plan. Use ONLY this context. Do not invent target_date if it is null.\n\n${JSON.stringify(context, null, 2)}`,
    });

    await fs.mkdir(PLANS_DIR, { recursive: true });
    const fileName = safeJsonBasename(parsed.data.plan_id, "plan");
    const out = path.join(PLANS_DIR, fileName);
    const plan = { ...parsed.data, plan_id: fileName.replace(/\.json$/i, "") };
    await fs.writeFile(out, JSON.stringify(plan, null, 2));

    return {
      saved: out,
      plan,
      activityCount: recent.length,
    };
  },
});
