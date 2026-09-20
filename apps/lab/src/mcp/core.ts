import { COACH_TOOLS, executeCoachTool } from "../lib/coachTools";
import { COACH_MCP_INSTRUCTIONS } from "../lib/coachContract";
import { loadLabEnv } from "../lib/env";
import { readContextSnapshot } from "../../../../packages/agent/src/garmin/contextSnapshot.js";
import {
  getGarminSourceStatus,
  syncGarminConnect,
} from "../../../../packages/agent/src/garmin/sourceService.js";
import { getLatestSyncRuns } from "../../../../packages/agent/src/garmin/syncLedger.js";

/**
 * Channel-neutral StrideLab MCP core.
 *
 * Every transport (stdio, HTTP, Telegram adapter, Anvia Studio) funnels through
 * `handleMcpRequest`. The tools themselves never know which chat surface called
 * them: they only see an `ExternalRequestContext` used for authorization,
 * auditing, and rate limiting.
 */

// Load root `.env` before reading MCP_* settings below, so the server name and
// other options can be configured per deployment.
loadLabEnv();

export type McpChannel = "stdio" | "http" | "telegram" | "studio" | "other";

export type ExternalRequestContext = {
  channel: McpChannel;
  /** Stable client identifier, e.g. a Telegram chat id or an API token label. */
  clientId?: string;
  /** End-user identity when the channel maps one (Telegram user id, etc.). */
  userId?: string;
  permissions: {
    readTrainingData: boolean;
    mutateDashboard: boolean;
    syncData: boolean;
  };
};

/** Local stdio clients are trusted and get the full tool surface. */
export const DEFAULT_MCP_CONTEXT: ExternalRequestContext = {
  channel: "stdio",
  permissions: {
    readTrainingData: true,
    mutateDashboard: true,
    syncData: true,
  },
};

export const MCP_SERVER_NAME =
  process.env.MCP_SERVER_NAME?.trim() || "stridelab-mcp";
export const MCP_SERVER_VERSION = "1.1.0";
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type McpToolKind = "read" | "mutate" | "sync";

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: McpToolKind;
  handler: (
    args: Record<string, unknown>,
    context: ExternalRequestContext,
  ) => Promise<string> | string;
};

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
};

const EMPTY_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

/** Coach tools derive straight from the chat definitions, guaranteeing parity. */
const coachToolDefs: McpToolDef[] = COACH_TOOLS.map((tool) => {
  const name = tool.function.name;
  const kind: McpToolKind = name.startsWith("set_")
    ? "mutate"
    : name === "sync_garmin"
      ? "sync"
      : "read";
  return {
    name,
    description: tool.function.description ?? name,
    inputSchema:
      (tool.function.parameters as Record<string, unknown>) ?? {
        ...EMPTY_SCHEMA,
      },
    kind,
    handler: (args) => executeCoachTool(name, JSON.stringify(args)),
  };
});

/** Garmin source tools, delegated to the agent data layer. */
const sourceToolDefs: McpToolDef[] = [
  {
    name: "get_data_status",
    description:
      "Get manual Garmin export and Garmin Connect status without exposing credentials.",
    inputSchema: { ...EMPTY_SCHEMA },
    kind: "read",
    handler: async () =>
      JSON.stringify(await getGarminSourceStatus(), null, 2),
  },
  {
    name: "sync_garmin",
    description:
      "Sync the active Garmin source (manual DI_CONNECT import by default). Login and MFA are completed in the Lab UI, never as tool arguments.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 31,
          description: "Recent window in days. Default 7.",
        },
      },
      additionalProperties: false,
    },
    kind: "sync",
    handler: async (args) => {
      const days = typeof args.days === "number" ? args.days : 7;
      return JSON.stringify(await syncGarminConnect(days), null, 2);
    },
  },
  {
    name: "get_training_context",
    description:
      "Read the compact derived training context and recent sync ledger without exposing credentials or raw Garmin session data.",
    inputSchema: { ...EMPTY_SCHEMA },
    kind: "read",
    handler: async () => {
      const [context, syncRuns] = await Promise.all([
        readContextSnapshot(),
        getLatestSyncRuns(10),
      ]);
      return JSON.stringify({ context, syncRuns }, null, 2);
    },
  },
];

export const mcpTools: McpToolDef[] = [...coachToolDefs, ...sourceToolDefs];
const toolIndex = new Map(mcpTools.map((tool) => [tool.name, tool]));

export function mcpToolNames(): string[] {
  return mcpTools.map((tool) => tool.name);
}

function permissionFor(
  kind: McpToolKind,
  context: ExternalRequestContext,
): boolean {
  if (kind === "read") return context.permissions.readTrainingData;
  if (kind === "mutate") return context.permissions.mutateDashboard;
  return context.permissions.syncData;
}

function reply(id: number | string | undefined, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function replyError(
  id: number | string | undefined,
  code: number,
  message: string,
): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolFailure(
  id: number | string | undefined,
  message: string,
): string {
  return reply(id, {
    content: [{ type: "text", text: message }],
    isError: true,
  });
}

/**
 * Handle a single JSON-RPC request. Returns `null` for notifications that must
 * not produce a response.
 */
export async function handleMcpRequest(
  request: JsonRpcRequest,
  context: ExternalRequestContext = DEFAULT_MCP_CONTEXT,
): Promise<string | null> {
  const { id, method, params } = request;

  if (
    method === "notifications/initialized" ||
    method === "notifications/cancelled"
  ) {
    return null;
  }

  if (method === "initialize") {
    return reply(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      instructions: COACH_MCP_INSTRUCTIONS,
    });
  }

  if (method === "ping") return reply(id, {});

  if (method === "tools/list") {
    return reply(id, {
      tools: mcpTools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const name = String(params?.name ?? "");
    const rawArgs = params?.arguments;
    const args =
      rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : {};

    const tool = toolIndex.get(name);
    if (!tool) return toolFailure(id, `Unknown tool: ${name}`);

    if (!permissionFor(tool.kind, context)) {
      return toolFailure(
        id,
        `Tool "${name}" is not permitted for channel "${context.channel}".`,
      );
    }

    try {
      const text = await tool.handler(args, context);
      return reply(id, { content: [{ type: "text", text }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toolFailure(id, `${name} failed: ${message}`);
    }
  }

  return replyError(id, -32601, `Unsupported method: ${method ?? "unknown"}`);
}