import { loadLabEnv } from "./env";
import { STUDIO_URL } from "./paths";

/**
 * External channel configuration.
 *
 * MCP is the channel-agnostic capability layer; Telegram, Slack, Claude,
 * Cursor and the web chat are interchangeable clients of it.
 *
 * This module exposes two surfaces:
 *  - `publicExternalConfig()` → safe for the browser (no secrets).
 *  - `externalSecrets()` → server-only tokens, never sent to the client.
 */

export type ExternalChannelStatus = "enabled" | "configured" | "not_configured";

export type PublicExternalConfig = {
  mcp: {
    serverName: string;
    toolCount: number;
    stdio: { command: string; args: string[] };
    http: {
      enabled: boolean;
      endpoint: string;
      authRequired: boolean;
    };
  };
  telegram: {
    enabled: boolean;
    status: ExternalChannelStatus;
    botUrl: string | null;
    allowedChatCount: number;
  };
  studio: { url: string };
  lens: { url: string; enabled: boolean };
  lab: { url: string };
  /**
   * Whether to show optional integration surfaces (Telegram, Anvia Lens /
   * observability) in the External panel. Hidden in production by default.
   */
  showIntegrations: boolean;
};

export function mcpHttpEnabled(): boolean {
  loadLabEnv();
  return process.env.MCP_HTTP_ENABLED?.trim().toLowerCase() === "true";
}

export function mcpHttpAuthToken(): string | undefined {
  loadLabEnv();
  return process.env.MCP_HTTP_AUTH_TOKEN?.trim() || undefined;
}

export function labPublicUrl(): string {
  loadLabEnv();
  return (
    process.env.LAB_PUBLIC_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:4030"
  );
}

export function telegramBotToken(): string | undefined {
  loadLabEnv();
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
}

export function telegramEnabled(): boolean {
  loadLabEnv();
  if (process.env.TELEGRAM_ENABLED?.trim().toLowerCase() !== "true") {
    return false;
  }
  return Boolean(telegramBotToken());
}

export function telegramAllowedChatIds(): string[] {
  loadLabEnv();
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function lensPublicUrl(): string {
  loadLabEnv();
  return process.env.ANVIA_LENS_BASE_URL?.trim().replace(/\/$/, "") || "";
}

/**
 * Optional integration surfaces (Telegram adapter, Anvia Lens observability)
 * are hidden in production by default. Set `EXTERNAL_SHOW_INTEGRATIONS=true`
 * to force-enable them, or `false` to hide them in development too.
 */
export function externalShowIntegrations(): boolean {
  loadLabEnv();
  const raw = process.env.EXTERNAL_SHOW_INTEGRATIONS?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Browser-safe view. Never includes bot tokens, MCP auth tokens, or Lens keys.
 * `toolCount` is injected by the caller so this module stays dependency-light
 * for the client bundle boundary.
 */
export function publicExternalConfig(toolCount = 0): PublicExternalConfig {
  loadLabEnv();
  const token = mcpHttpAuthToken();
  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
      process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim(),
  );
  const lensUrl = lensPublicUrl();

  return {
    mcp: {
      serverName: "stridelab-mcp",
      toolCount,
      stdio: {
        command: "pnpm",
        args: ["--silent", "--filter", "lab", "mcp"],
      },
      http: {
        enabled: mcpHttpEnabled(),
        endpoint: `${labPublicUrl()}/api/mcp`,
        authRequired: Boolean(token),
      },
    },
    telegram: {
      enabled: telegramEnabled(),
      status: telegramEnabled()
        ? "enabled"
        : telegramConfigured
          ? "configured"
          : "not_configured",
      botUrl: process.env.TELEGRAM_PUBLIC_BOT_URL?.trim() || null,
      allowedChatCount: telegramAllowedChatIds().length,
    },
    studio: { url: STUDIO_URL },
    lens: { url: lensUrl, enabled: Boolean(lensUrl) },
    lab: { url: labPublicUrl() },
    showIntegrations: externalShowIntegrations(),
  };
}

/** Server-only secrets. Never return this from an API route. */
export function externalSecrets() {
  return {
    mcpHttpAuthToken: mcpHttpAuthToken(),
    telegramBotToken: telegramBotToken(),
  };
}