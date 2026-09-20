import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, type McpServer } from "@anvia/mcp";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** Name advertised by the complete StrideLab MCP server (override with MCP_SERVER_NAME). */
export const STRIDELAB_MCP_SERVER_NAME =
  process.env.MCP_SERVER_NAME?.trim() || "stridelab-mcp";

/**
 * Full coach tool surface exposed by the MCP server. These mirror the chat
 * agent exactly, plus the Garmin source tools.
 */
export const EXPECTED_MCP_TOOLS = [
  "get_overview",
  "get_weekly",
  "get_acr",
  "get_daily_analyzer",
  "get_your_best",
  "generate_weekly_brief",
  "web_search",
  "get_dashboard_layout",
  "set_dashboard_layout",
  "set_dashboard_chart",
  "get_data_status",
  "sync_garmin",
  "get_training_context",
] as const;

/**
 * Create (but do not connect) a stdio MCP client for the complete StrideLab
 * MCP server that lives in `apps/lab`.
 *
 * The server advertises protocol `2025-06-18`; Anvia pins `2026-07-28` by
 * default, so negotiation must be enabled explicitly.
 */
export function createStridelabMcpClient(): McpClient {
  return new McpClient({
    name: STRIDELAB_MCP_SERVER_NAME,
    transport: {
      type: "stdio",
      command: "pnpm",
      // `--silent` keeps pnpm's command banner off the child's stdout; the
      // transport must carry JSON-RPC only.
      args: ["--silent", "--filter", "lab", "mcp"],
      cwd: repoRoot,
    },
    versionNegotiation: { mode: "auto" },
  });
}

/** Connect and return both the owning client and the adapted server snapshot. */
export async function connectStridelabMcp(): Promise<{
  client: McpClient;
  server: McpServer;
}> {
  const client = createStridelabMcpClient();
  const server = await client.connect();
  return { client, server };
}
