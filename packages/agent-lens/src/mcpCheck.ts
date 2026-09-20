import type { McpClient, McpServer } from "@anvia/mcp";
import {
  EXPECTED_MCP_TOOLS,
  STRIDELAB_MCP_SERVER_NAME,
  connectStridelabMcp,
} from "./mcp.js";

export type McpCheckResult = {
  ok: boolean;
  detail: string;
  /** Tool names verified over the wire. */
  tools?: string[];
  /** Reply size per representative tool call. */
  sampleChars?: Record<string, number>;
};

const PROBE_TOOLS = ["get_data_status", "get_overview", "get_your_best"] as const;

/**
 * Deterministic MCP connection check. Handshake, full tool-list assertion, and
 * representative tool calls. No LLM is used.
 */
export async function runMcpConnectionCheck(
  log: (line: string) => void = () => {},
): Promise<McpCheckResult> {
  let client: McpClient | undefined;
  let server: McpServer;
  try {
    ({ client, server } = await connectStridelabMcp());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `cannot connect: ${detail}` };
  }

  try {
    const toolNames = server.tools.map((tool) => tool.name);
    log(`server: ${server.name}`);
    if (server.serverInfo) {
      log(`serverInfo: ${server.serverInfo.name}@${server.serverInfo.version}`);
    }
    log(`tools (${toolNames.length}): ${toolNames.join(", ")}`);

    if (server.name !== STRIDELAB_MCP_SERVER_NAME) {
      return {
        ok: false,
        detail: `unexpected server name "${server.name}"`,
        tools: toolNames,
      };
    }

    const missing = EXPECTED_MCP_TOOLS.filter(
      (name) => !toolNames.includes(name),
    );
    if (missing.length > 0) {
      return {
        ok: false,
        detail: `missing tools: ${missing.join(", ")}`,
        tools: toolNames,
      };
    }

    const sampleChars: Record<string, number> = {};
    for (const toolName of PROBE_TOOLS) {
      const tool = server.tools.find((candidate) => candidate.name === toolName);
      if (!tool) {
        return { ok: false, detail: `${toolName} not found`, tools: toolNames };
      }
      const result = await tool.call({});
      const text =
        typeof result === "string" ? result : JSON.stringify(result, null, 2);
      sampleChars[toolName] = text.length;
      log(`${toolName}: ${text.length} chars`);
      if (toolName === "get_data_status") log(text);
    }

    return {
      ok: true,
      detail: `all ${EXPECTED_MCP_TOOLS.length} tools present`,
      tools: toolNames,
      sampleChars,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, detail };
  } finally {
    await client.close();
  }
}