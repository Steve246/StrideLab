import { OpenAIClient } from "@anvia/openai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

// The Lab imports this module dynamically after loading its environment, but
// the agent package also imports it directly from the CLI/Studio entrypoints.
// Load the workspace env here as well so the client is never constructed with
// an empty or stale key because of import order.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
loadDotenv({ path: path.join(repoRoot, ".env"), override: false });

function resolveProvider(): "devscale" | "openai" {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "devscale") return "devscale";
  const base = process.env.OPENAI_BASE_URL?.trim() ?? "";
  const key =
    process.env.DEVSCALE_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  if (base.includes("gateway.devscale.id") || key.startsWith("mux_sk_")) {
    return "devscale";
  }
  return "openai";
}

function resolveBaseUrl(): string | undefined {
  if (resolveProvider() === "devscale") {
    return (
      process.env.DEVSCALE_BASE_URL?.trim() ||
      (process.env.OPENAI_BASE_URL?.includes("gateway.devscale.id")
        ? process.env.OPENAI_BASE_URL.trim()
        : "https://gateway.devscale.id/v1")
    );
  }
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
}

function resolveApiKey(): string | undefined {
  if (resolveProvider() === "devscale") {
    return process.env.DEVSCALE_API_KEY?.trim() || undefined;
  }
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

function resolveModel(): string {
  if (resolveProvider() === "devscale") {
    return (
    process.env.DEVSCALE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "deepseek-v4-flash-0731"
  );
  }
  return process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
}

export const openAiClient = new OpenAIClient({
  baseUrl: resolveBaseUrl(),
  apiKey: resolveApiKey(),
  // Agent tool loops use chat completions. Do not send reasoning_effort here —
  // gpt-4.1 rejects it; gpt-5.6-terra needs Responses API for tools instead.
  completionApi: "chat",
});

/** Default model — supports function tools on /v1/chat/completions. */
export function getModel(modelId: string = resolveModel()) {
  return openAiClient.completionModel(modelId);
}
