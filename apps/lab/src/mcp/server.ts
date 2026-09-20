import readline from "node:readline";
import { loadLabEnv } from "../lib/env";
import {
  DEFAULT_MCP_CONTEXT,
  MCP_SERVER_NAME,
  handleMcpRequest,
  mcpToolNames,
  type JsonRpcRequest,
} from "./core";

/**
 * Complete StrideLab MCP server (stdio transport).
 *
 * Exposes the full coach tool surface — the same tools the chat agent uses —
 * plus the Garmin source tools. Chat and MCP therefore share one
 * implementation (`executeCoachTool`), so they cannot drift.
 *
 * Locally connected clients are trusted and receive the full tool surface.
 * Remote callers use the authenticated HTTP transport instead
 * (`/api/mcp`), which is why the channel-neutral core lives in `./core`.
 *
 * stdout carries JSON-RPC only. All diagnostics go to stderr.
 */

function replyError(message: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: undefined,
    error: { code: -32700, message },
  });
}

function main() {
  loadLabEnv();
  process.stderr.write(
    `[${MCP_SERVER_NAME}] stdio ready with ${mcpToolNames().length} tools: ${mcpToolNames().join(", ")}\n`,
  );

  const input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  input.on("line", (line) => {
    if (!line.trim()) return;
    void (async () => {
      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const result = await handleMcpRequest(request, DEFAULT_MCP_CONTEXT);
        if (result) process.stdout.write(`${result}\n`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid MCP request";
        process.stdout.write(`${replyError(message)}\n`);
      }
    })();
  });
}

main();