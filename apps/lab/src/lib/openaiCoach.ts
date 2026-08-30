import OpenAI from "openai";
import { buildOverview, buildWeekly } from "./data";
import {
  loadLabEnv,
  openaiBaseUrl,
  openaiConfigured,
  openaiModel,
} from "./env";

export async function coachChat(opts: {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ reply: string; model: string }> {
  loadLabEnv();
  if (!openaiConfigured()) {
    throw new Error(
      "OPENAI_API_KEY missing in root .env — Lab talks to OpenAI directly (Studio not required).",
    );
  }

  const [overview, weekly] = await Promise.all([
    buildOverview(12),
    buildWeekly(12),
  ]);
  const last4 = weekly.weeks.slice(-4);

  const context = [
    `Athlete dashboard snapshot (deterministic — trust these numbers):`,
    `- as_of: ${overview.as_of}`,
    `- this week: ${overview.distance_km} km, TRIMP ${overview.trimp}, ${overview.sessions} sessions`,
    `- avg pace: ${overview.avg_pace_min_per_km ?? "n/a"} min/km, avg HR: ${overview.avg_hr ?? "n/a"}`,
    `- ACR km: ${overview.acr_km ?? "n/a"} (${overview.acr_km_zone}), ACR TRIMP: ${overview.acr_trimp ?? "n/a"} (${overview.acr_trimp_zone})`,
    `- alignment: ${overview.alignment}`,
    `- next week forecast: ~${overview.forecast_next_week_km ?? "n/a"} km / TRIMP ${overview.forecast_next_week_trimp ?? "n/a"}`,
    `- last 4 weeks km: ${last4.map((w) => w.distance_km).join(", ")}`,
    `- activities in store: ${overview.activity_count}`,
  ].join("\n");

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: openaiBaseUrl(),
  });
  const model = openaiModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: [
          "You are Steven's personal running coach for the Training Lab dashboard.",
          "Be concise, practical, and conservative about injury risk.",
          "Use the provided athlete snapshot; do not invent Garmin numbers.",
          "Training guidance only — not medical advice.",
          "If asked to sync Garmin, tell them to use the Resync button (no LLM needed).",
          "",
          context,
        ].join("\n"),
      },
      ...(opts.history ?? []).slice(-12),
      { role: "user", content: opts.message },
    ],
  });

  const reply =
    completion.choices[0]?.message?.content?.trim() ||
    "(empty model response)";
  return { reply, model };
}
