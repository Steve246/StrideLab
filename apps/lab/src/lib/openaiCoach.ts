import OpenAI from "openai";
import { buildChatWidget, type ChatWidget } from "./chatWidgets";
import {
  COACH_TOOLS,
  executeCoachTool,
  summarizeToolResult,
  toolLabel,
} from "./coachTools";
import {
  loadLabEnv,
  llmApiKey,
  llmBaseUrl,
  llmConfigured,
  llmFallbackModels,
  llmModel,
  llmProvider,
} from "./env";

type HistoryMessage = { role: "user" | "assistant"; content: string };

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const MAX_TOOL_TURNS = 6;

export type CoachToolEvent =
  | { type: "status"; message: string }
  | {
      type: "tool_start";
      name: string;
      label: string;
      args_hint?: string;
      call_id?: string;
    }
  | {
      type: "tool_done";
      name: string;
      label: string;
      detail: string;
      call_id?: string;
      widget?: ChatWidget;
      dashboard_changed?: boolean;
    }
  | {
      type: "final";
      reply: string;
      model: string;
      provider: string;
      tools_used: string[];
      tried_models?: string[];
    }
  | { type: "error"; error: string };

function extractReply(
  completion: OpenAI.Chat.Completions.ChatCompletion,
): string {
  const msg = completion.choices[0]?.message as
    | (OpenAI.Chat.Completions.ChatCompletionMessage & {
        reasoning_content?: string;
        reasoning?: string;
      })
    | undefined;
  const content = typeof msg?.content === "string" ? msg.content.trim() : "";
  if (content) return content;
  const reasoning =
    (typeof msg?.reasoning_content === "string" &&
      msg.reasoning_content.trim()) ||
    (typeof msg?.reasoning === "string" && msg.reasoning.trim()) ||
    "";
  if (reasoning) {
    return `(model returned reasoning only — raise max tokens or switch model)\n${reasoning.slice(0, 600)}`;
  }
  return "";
}

function isTransientGatewayError(err: unknown): boolean {
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: unknown }).status)
      : NaN;
  if (status === 502 || status === 503 || status === 504) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /service_unavailable|temporarily unavailable|Bad Gateway|502|503|504/i.test(
    msg,
  );
}

function systemPrompt(): string {
  return [
    "You are Steven's personal running coach for the Training Lab dashboard.",
    "Be concise, practical, and conservative about injury risk.",
    "Training guidance only — not medical advice.",
    "",
    "FORMATTING (important — replies are rendered as Markdown in the UI):",
    "- Use clear ## / ### headings for sections (e.g. Your data, External benchmark, Verdict).",
    "- Use **bold** for key numbers and the final verdict line.",
    "- Prefer short bullet lists over long paragraphs.",
    "- Use Markdown tables when comparing weeks or benchmarks.",
    "- Put source links on their own line as [title](url).",
    "- End with a one-line **Verdict:** then at most 1–2 follow-up questions.",
    "- Avoid walls of text; aim for scannable coaching cards.",
    "",
    "TOOLS (required for athlete numbers):",
    "- Call get_overview / get_weekly / get_acr / get_daily_analyzer / get_your_best for Garmin-derived metrics.",
    "- Never invent distances, TRIMP, ACR, HRV, sleep, or paces.",
    "- When Steven asks for a weekly brief, coaching report, or downloadable summary: call generate_weekly_brief.",
    "  Tell him to use the Download Markdown / HTML buttons on the tool card. Do not paste the full brief body.",
    "- Use web_search for public guidelines/research; cite URLs. Web text is NOT the athlete's data.",
    "- Prefer tools over guessing. You may call multiple tools.",
    "- If asked to sync Garmin, tell them to use the Resync button (no LLM needed).",
    "- Data freshness: metrics come from the last successful DI_CONNECT import. Garmin often splits",
    "  activities across multiple *_summarizedActivities.json files; Resync must merge all of them",
    "  (BUG-SYNC-01). If Overview looks stuck on an old week, ask Steven to Resync after a fresh unzip,",
    "  then re-call get_overview — do not invent newer sessions.",
    "- When comparing web advice to the athlete, clearly separate 'your data' vs 'external sources'.",
    "",
    "DASHBOARD UI TOOLS:",
    "- get_dashboard_layout / set_dashboard_layout: reorder allowlisted panels only (kpis, weekly, acr, vega, daily_analyzer, your_best, activities).",
    "- set_dashboard_chart: only allowlisted Vega kinds (weekly_distance, weekly_trimp, weekly_hrv, acr_trimp).",
    "- Never invent widget or chart ids outside those lists.",
  ].join("\n");
}

function argsHint(name: string, argsJson: string | undefined): string | undefined {
  if (!argsJson?.trim()) return undefined;
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    if (name === "web_search" && typeof args.query === "string") {
      return args.query.slice(0, 80);
    }
    if (name === "set_dashboard_chart" && typeof args.kind === "string") {
      return args.kind;
    }
    if (name === "set_dashboard_layout" && Array.isArray(args.widgets)) {
      return args.widgets.map(String).join(" → ").slice(0, 100);
    }
    if (name === "generate_weekly_brief") {
      return typeof args.week_start === "string"
        ? args.week_start
        : "current week";
    }
    if (typeof args.weeks === "number") return `${args.weeks} weeks`;
    if (typeof args.days === "number") return `${args.days} days`;
  } catch {
    /* ignore */
  }
  return undefined;
}

async function runToolLoop(
  client: OpenAI,
  model: string,
  seedMessages: ChatMessage[],
  onEvent?: (ev: CoachToolEvent) => void,
): Promise<{ reply: string; tools_used: string[] }> {
  const messages: ChatMessage[] = [...seedMessages];
  const tools_used: string[] = [];

  onEvent?.({ type: "status", message: "Thinking…" });

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const completion = await client.chat.completions.create({
      model,
      max_completion_tokens: 2000,
      tools: COACH_TOOLS,
      tool_choice: "auto",
      messages,
    });

    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) {
      throw new Error(`Empty message from ${model}`);
    }

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const reply = extractReply(completion);
      if (!reply) {
        throw new Error(
          `Empty content from ${model} (finish_reason=${choice.finish_reason ?? "n/a"}).`,
        );
      }
      return { reply, tools_used };
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      const label = toolLabel(name);
      const hint = argsHint(name, call.function.arguments);
      const callId = call.id;
      tools_used.push(name);

      onEvent?.({
        type: "tool_start",
        name,
        label,
        args_hint: hint,
        call_id: callId,
      });

      const result = await executeCoachTool(name, call.function.arguments);
      const detail = summarizeToolResult(name, result);
      const widget = buildChatWidget(name, result) ?? undefined;
      const dashboard_changed =
        name === "set_dashboard_layout" || name === "set_dashboard_chart";

      onEvent?.({
        type: "tool_done",
        name,
        label,
        detail,
        call_id: callId,
        widget,
        dashboard_changed: dashboard_changed || undefined,
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }

    onEvent?.({ type: "status", message: "Writing answer…" });
  }

  const final = await client.chat.completions.create({
    model,
    max_completion_tokens: 1200,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Stop calling tools. Answer now using the tool results you already have.",
      },
    ],
  });
  const reply = extractReply(final);
  if (!reply) {
    throw new Error(`Tool loop exhausted without a final reply (${model}).`);
  }
  return { reply, tools_used };
}

export async function coachChat(opts: {
  message: string;
  history?: HistoryMessage[];
  onEvent?: (ev: CoachToolEvent) => void;
}): Promise<{
  reply: string;
  model: string;
  provider: string;
  tried_models?: string[];
  tools_used: string[];
}> {
  loadLabEnv();
  if (!llmConfigured()) {
    throw new Error(
      "LLM not configured. Set LLM_PROVIDER=devscale|openai and the matching API key in root .env.",
    );
  }

  const provider = llmProvider();
  const primary = llmModel();
  const candidates = [
    primary,
    ...llmFallbackModels().filter((m) => m !== primary),
  ];

  const client = new OpenAI({
    apiKey: llmApiKey(),
    baseURL: llmBaseUrl(),
    timeout: 120_000,
    maxRetries: 1,
  });

  const seedMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    ...((opts.history ?? []).slice(-12) as ChatMessage[]),
    { role: "user", content: opts.message },
  ];

  const tried: string[] = [];
  let lastError: unknown;

  for (const model of candidates) {
    tried.push(model);
    try {
      if (tried.length > 1) {
        opts.onEvent?.({
          type: "status",
          message: `Retrying with ${model}…`,
        });
      }
      const { reply, tools_used } = await runToolLoop(
        client,
        model,
        seedMessages,
        opts.onEvent,
      );
      const tried_models = tried.length > 1 ? tried : undefined;
      opts.onEvent?.({
        type: "final",
        reply,
        model,
        provider,
        tools_used,
        tried_models,
      });
      return {
        reply,
        model,
        provider,
        tools_used,
        tried_models,
      };
    } catch (err) {
      lastError = err;
      if (tried.length < candidates.length) continue;
      break;
    }
  }

  const status =
    lastError && typeof lastError === "object" && "status" in lastError
      ? String((lastError as { status?: unknown }).status)
      : "";
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  const transient = isTransientGatewayError(lastError);
  const error = `Devscale/OpenAI chat failed${status ? ` (HTTP ${status})` : ""}${transient ? " [transient]" : ""} after trying [${tried.join(", ")}]: ${detail}. Prefer DEVSCALE_MODEL=deepseek-v4-flash-0731 if luna is 503.`;
  opts.onEvent?.({ type: "error", error });
  throw new Error(error);
}
