import { AgentBuilder, createTool } from "@anvia/core";
import { loadLabEnv } from "./env";
import {
  COACH_TOOLS,
  coachToolZodSchema,
  executeCoachTool,
  toolLabel,
  summarizeToolResult,
} from "./coachTools";
import { buildChatWidget } from "./chatWidgets";
import {
  COACH_AGENT_MAX_TURNS,
  getCoachInstructions,
  type CoachToolEvent,
} from "./coachContract";

/**
 * Lab chat adapter for the canonical coach agent.
 *
 * Tool schemas come from `COACH_TOOLS` (the same contract the MCP server
 * publishes), and instructions come from `coachContract`. There is no separate
 * tool registry here, so the Lab and MCP surfaces cannot drift.
 */
function coachTools() {
  return COACH_TOOLS.map((tool) =>
    createTool({
      name: tool.function.name,
      description: tool.function.description ?? tool.function.name,
      input: coachToolZodSchema(tool.function.name),
      execute: async (args) =>
        executeCoachTool(tool.function.name, JSON.stringify(args)),
    }),
  );
}

async function buildCoachAgent() {
  loadLabEnv();
  const { getModel } = await import(
    "../../../../packages/agent/src/providers/openai"
  );
  return new AgentBuilder("running-lab-coach", getModel())
    .name("StrideLab Coach")
    .instructions(getCoachInstructions())
    .tools(coachTools())
    .defaultMaxTurns(COACH_AGENT_MAX_TURNS)
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
      onEvent({
        type: "tool_start",
        name,
        label: toolLabel(name),
        call_id: event.toolCall.id,
      });
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
        dashboard_changed:
          name === "set_dashboard_layout" ||
          name === "set_dashboard_chart" ||
          undefined,
      });
    }
    if (event.type === "final") reply = event.output;
  }
  const model = coachAgent.model.defaultModel;
  onEvent({
    type: "final",
    reply,
    model,
    provider: "anvia",
    tools_used: toolsUsed,
  });
  return { reply, model, provider: "anvia", tools_used: toolsUsed };
}