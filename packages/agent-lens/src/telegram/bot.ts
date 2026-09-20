import { Agent } from "@anvia/core/agent";
import { OpenAIClient } from "@anvia/openai";
import { connectStridelabMcp } from "../mcp.js";
import { lens, tracing } from "../observability.js";

/**
 * Telegram adapter — the first non-local client of the StrideLab MCP server.
 *
 * Telegram is deliberately *not* special: it connects to the same MCP tools as
 * Anvia Studio, Claude, and Cursor. Garmin login, MFA, password entry, and
 * manual import are never handled here; users are linked back to the Lab UI.
 *
 * Env:
 *   TELEGRAM_ENABLED=true
 *   TELEGRAM_BOT_TOKEN=123:abc
 *   TELEGRAM_ALLOWED_CHAT_IDS=111,222       # required; fails closed
 *   LAB_PUBLIC_URL=http://localhost:4030
 */

const TELEGRAM_LIMIT = 4000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function allowedChatIds(): Set<string> {
  return new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function labUrl(): string {
  return (
    process.env.LAB_PUBLIC_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:4030"
  );
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    from?: { id: number | string; first_name?: string };
    text?: string;
  };
};

type TelegramResult<T> = { ok: boolean; result?: T; description?: string };

async function telegram<T>(
  token: string,
  method: string,
  payload?: Record<string, unknown>,
): Promise<TelegramResult<T>> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return (await response.json()) as TelegramResult<T>;
}

async function send(token: string, chatId: string, text: string): Promise<void> {
  const trimmed =
    text.length > TELEGRAM_LIMIT ? `${text.slice(0, TELEGRAM_LIMIT - 1)}…` : text;
  await telegram(token, "sendMessage", {
    chat_id: chatId,
    text: trimmed,
    disable_web_page_preview: true,
  });
}

function helpText(): string {
  return [
    "StrideLab coach",
    "",
    "Ask about your training, load, recovery, sleep, or bests.",
    "Examples:",
    "• How far did I run this week?",
    "• Is my load too high?",
    "• What should I focus on next week?",
    "",
    `Garmin login, MFA, and manual import stay in the Lab: ${labUrl()}`,
    "Never share your Garmin password or MFA codes in chat.",
  ].join("\n");
}

async function main() {
  if (process.env.TELEGRAM_ENABLED?.trim().toLowerCase() !== "true") {
    console.error(
      "Telegram adapter disabled. Set TELEGRAM_ENABLED=true to run it.",
    );
    return;
  }

  const token = required("TELEGRAM_BOT_TOKEN");
  const allowed = allowedChatIds();
  if (allowed.size === 0) {
    console.error(
      "TELEGRAM_ALLOWED_CHAT_IDS is empty. Refusing to run an open bot.",
    );
    process.exitCode = 1;
    return;
  }

  const { client: mcpClient, server } = await connectStridelabMcp();
  console.log(
    `Telegram adapter connected to MCP "${server.name}" (${server.tools.length} tools)`,
  );
  console.log(`Allowed chats: ${allowed.size} · Lab: ${labUrl()}`);

  const baseUrl =
    process.env.DEVSCALE_BASE_URL?.trim() || "https://gateway.devscale.id/v1";
  const apiKey = required("DEVSCALE_API_KEY");
  const modelId =
    process.env.DEVSCALE_MODEL?.trim() || "deepseek-v4-flash-0731";

  const model = new OpenAIClient({ baseUrl, apiKey }).completionModel({
    modelId,
    api: "chat",
  });

  let usedTools: string[] = [];
  const agent = new Agent({
    id: "stridelab-telegram-agent",
    name: "StrideLab Telegram Coach",
    model,
    instructions: [
      "You are the StrideLab running coach answering over Telegram.",
      "Use MCP tools for all athlete data and never invent metrics.",
      "Keep answers short and mobile-friendly: 2–4 sentences, no large tables.",
      "Never request, echo, or store Garmin credentials or MFA codes.",
      "Stay strictly within running and training coaching; politely decline unrelated topics such as politics, news, or general trivia and offer training help instead.",
      `If asked to log in, sync credentials, or import files, refuse and tell the user to use the Lab UI at ${labUrl()}.`,
    ].join(" "),
    mcpServers: [server],
    maxTurns: 4,
    lifecycle: {
      onToolStart: (event) => {
        usedTools.push(event.toolName);
      },
    },
    observability: {
      observers: { lens: tracing },
      primaryTrace: "lens",
      errorPolicy: "ignore",
    },
  });

  let offset = 0;
  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    try {
      const updates = await telegram<TelegramUpdate[]>(token, "getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      });
      if (!updates.ok) {
        console.error(`getUpdates failed: ${updates.description ?? "unknown"}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      for (const update of updates.result ?? []) {
        offset = update.update_id + 1;
        const message = update.message;
        const text = message?.text?.trim();
        if (!message || !text) continue;

        const chatId = String(message.chat.id);
        if (!allowed.has(chatId)) {
          await send(
            token,
            chatId,
            "This bot is private. Ask the owner to add your chat id.",
          );
          continue;
        }

        if (text === "/start" || text === "/help") {
          await send(token, chatId, helpText());
          continue;
        }
        if (text === "/id") {
          await send(token, chatId, `chat id: ${chatId}`);
          continue;
        }

        try {
          usedTools = [];
          const response = await agent.generate({
            prompt: text,
            trace: {
              name: "telegram-message",
              sessionId: `telegram-${chatId}`,
              userId: chatId,
              tags: ["external", "telegram"],
              metadata: { channel: "telegram" },
            },
          });
          const reply =
            response.type === "response"
              ? String(response.output ?? "")
              : "I couldn't complete that request.";
          console.log(
            `telegram chat=${chatId} tools=[${usedTools.join(",")}] reply=${reply.length} chars`,
          );
          await send(token, chatId, reply || "No answer produced.");
        } catch (error) {
          console.error(
            `Agent failed for chat ${chatId}:`,
            error instanceof Error ? error.message : error,
          );
          await send(
            token,
            chatId,
            "Something went wrong handling that message. Please try again.",
          );
        }
      }
    } catch (error) {
      console.error(
        "Polling error:",
        error instanceof Error ? error.message : error,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log("Telegram adapter stopping…");
  await lens.flush();
  await lens.close();
  await mcpClient.close();
}

main().catch((error) => {
  console.error("Telegram adapter failed:", error);
  process.exitCode = 1;
});