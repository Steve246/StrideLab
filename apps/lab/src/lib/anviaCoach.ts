import { AgentBuilder, createTool } from "@anvia/core";
import { z } from "zod";
import { loadLabEnv } from "./env";
import { executeCoachTool, toolLabel, summarizeToolResult } from "./coachTools";
import { buildChatWidget } from "./chatWidgets";
import type { CoachToolEvent } from "./openaiCoach";

const TOOL_INPUTS = {
  get_overview: z.object({}),
  get_weekly: z.object({ weeks: z.number().int().min(4).max(26).optional() }),
  get_acr: z.object({ weeks: z.number().int().min(4).max(26).optional() }),
  get_daily_analyzer: z.object({ days: z.number().int().min(1).max(28).optional() }),
  get_your_best: z.object({}),
  generate_weekly_brief: z.object({ week_start: z.string().optional(), format: z.string().optional(), include_web: z.boolean().optional() }),
  web_search: z.object({ query: z.string(), max_results: z.number().int().min(1).max(8).optional() }),
  get_dashboard_layout: z.object({}),
  set_dashboard_layout: z.object({ widgets: z.array(z.string()) }),
  set_dashboard_chart: z.object({ kind: z.string() }),
};

type ToolName = keyof typeof TOOL_INPUTS;

function coachTool(name: ToolName) {
  return createTool({
    name,
    description: toolLabel(name),
    input: TOOL_INPUTS[name],
    execute: async (args) => executeCoachTool(name, JSON.stringify(args)),
  });
}

async function buildCoachAgent() {
  loadLabEnv();
  const { getModel } = await import("../../../../packages/agent/src/providers/openai");
  return new AgentBuilder("running-lab-coach", getModel())
    .name("Steven Running Lab Coach")
    .instructions("You are Steven's personal running coach. Use tools for athlete data, never invent metrics, separate external research from athlete data, and explain data gaps. Keep answers concise and use Markdown.")
    .tools((Object.keys(TOOL_INPUTS) as ToolName[]).map(coachTool))
    .defaultMaxTurns(6)
    .build();
}

export async function streamAnviaCoach(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  onEvent: (event: CoachToolEvent) => void,
) {
  const coachAgent = await buildCoachAgent();
  const prompt = [...history.slice(-12), { role: "user", content: message }]
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n\n");
  const toolsUsed: string[] = [];
  let reply = "";
  for await (const event of coachAgent.prompt(prompt).stream()) {
    if (event.type === "text_delta") reply += event.delta;
    if (event.type === "tool_call") {
      const name = event.toolCall.function?.name ?? "tool";
      toolsUsed.push(name);
      onEvent({ type: "tool_start", name, label: toolLabel(name), call_id: event.toolCall.id });
    }
    if (event.type === "tool_result") {
      const name = event.toolName;
      onEvent({
        type: "tool_done",
        name,
        label: toolLabel(name),
        detail: summarizeToolResult(name, event.result),
        call_id: event.toolCallId,
        widget: buildChatWidget(name, event.result) ?? undefined,
        dashboard_changed: name === "set_dashboard_layout" || name === "set_dashboard_chart" || undefined,
      });
    }
    if (event.type === "final") reply = event.output;
  }
  const model = coachAgent.model.defaultModel;
  onEvent({ type: "final", reply, model, provider: "anvia", tools_used: toolsUsed });
  return { reply, model, provider: "anvia", tools_used: toolsUsed };
}
