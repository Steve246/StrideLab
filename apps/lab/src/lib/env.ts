import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(labRoot, "../..");

let loaded = false;

export type LlmProvider = "devscale" | "openai";

/** Load root `.env` once. */
export function loadLabEnv(): void {
  if (loaded) return;
  // dotenv does not override explicitly supplied deployment variables. This
  // keeps Docker/hosting secrets authoritative while supporting local .env.
  // `quiet` keeps stdout clean: the stdio MCP server must emit JSON-RPC only.
  loadDotenv({ path: path.join(repoRoot, ".env"), override: false, quiet: true });
  loaded = true;
}

/** Live Garmin is private/opt-in; manual import remains the default path. */
export function liveGarminEnabled(): boolean {
  loadLabEnv();
  return process.env.GARMIN_LIVE_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Whether the coach chat exposes tool names, the tool catalog, and per-turn
 * tool traces. Hidden in production by default; set `COACH_SHOW_TOOLS=true` to
 * force-enable for debugging a production build, or `false` to hide in dev.
 */
export function coachShowTools(): boolean {
  loadLabEnv();
  const raw = process.env.COACH_SHOW_TOOLS?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Which LLM backend to use.
 * - `devscale` → https://gateway.devscale.id/v1 (OpenAI-compatible)
 * - `openai` → api.openai.com (or OPENAI_BASE_URL)
 */
export function llmProvider(): LlmProvider {
  loadLabEnv();
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "devscale") return "devscale";
  // Infer: mux_sk / gateway URL → Devscale
  const base = process.env.OPENAI_BASE_URL?.trim() ?? "";
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (
    base.includes("gateway.devscale.id") ||
    key.startsWith("mux_sk_") ||
    process.env.DEVSCALE_API_KEY?.trim()
  ) {
    return "devscale";
  }
  return "openai";
}

export function llmConfigured(): boolean {
  loadLabEnv();
  if (llmProvider() === "devscale") {
    return Boolean(process.env.DEVSCALE_API_KEY?.trim());
  }
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function llmConfigStatus(): "missing" | "configured" {
  return llmConfigured() ? "configured" : "missing";
}

/** @deprecated Prefer llmConfigured() */
export function openaiConfigured(): boolean {
  return llmConfigured();
}

export function llmApiKey(): string | undefined {
  loadLabEnv();
  if (llmProvider() === "devscale") {
    return process.env.DEVSCALE_API_KEY?.trim() || undefined;
  }
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

export function llmBaseUrl(): string {
  loadLabEnv();
  if (llmProvider() === "devscale") {
    return (
      process.env.DEVSCALE_BASE_URL?.trim() ||
      (process.env.OPENAI_BASE_URL?.includes("gateway.devscale.id")
        ? process.env.OPENAI_BASE_URL.trim()
        : "https://gateway.devscale.id/v1")
    );
  }
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
}

export function llmModel(): string {
  loadLabEnv();
  if (llmProvider() === "devscale") {
    return (
      process.env.DEVSCALE_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "deepseek-v4-flash-0731"
    );
  }
  return process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
}

/**
 * Extra Devscale models to try when the primary returns 502/503/empty.
 * Comma-separated in DEVSCALE_FALLBACK_MODELS.
 */
export function llmFallbackModels(): string[] {
  loadLabEnv();
  if (llmProvider() !== "devscale") return [];
  const raw = process.env.DEVSCALE_FALLBACK_MODELS?.trim();
  const defaults = [
    "deepseek-v4-flash-0731",
    "muse-spark-1.3-contributor",
    "gpt-5.6-luna",
  ];
  const listed = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : defaults;
  // Always keep deepseek as a safety net for chat_completions.
  if (!listed.includes("deepseek-v4-flash-0731")) {
    listed.push("deepseek-v4-flash-0731");
  }
  return listed;
}

/** @deprecated Prefer llmModel() */
export function openaiModel(): string {
  return llmModel();
}

/** @deprecated Prefer llmBaseUrl() */
export function openaiBaseUrl(): string | undefined {
  return llmBaseUrl();
}
