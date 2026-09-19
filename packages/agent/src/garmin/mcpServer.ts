import readline from "node:readline";
import { getGarminSourceStatus, syncGarminConnect } from "./sourceService.js";
import { readContextSnapshot } from "./contextSnapshot.js";
import { getLatestSyncRuns } from "./syncLedger.js";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
};

function response(id: number | string | undefined, result: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function error(id: number | string | undefined, message: string) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code: -32600, message },
  });
}

const tools = [
  {
    name: "get_data_status",
    description: "Get manual export and Garmin Connect status without exposing credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "sync_garmin",
    description: "Sync the active Garmin source. Login and MFA are completed in the Training Lab UI, never as tool arguments.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 31, default: 7 } },
      additionalProperties: false,
    },
  },
  {
    name: "get_training_context",
    description: "Read the compact derived training context and recent sync ledger without exposing credentials or raw Garmin session data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function handle(request: JsonRpcRequest): Promise<string | null> {
  if (request.method === "notifications/initialized") return null;
  if (request.method === "initialize") {
    return response(request.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "running-lab-garmin", version: "0.1.0" },
    });
  }
  if (request.method === "tools/list") return response(request.id, { tools });
  if (request.method === "tools/call") {
    const name = String(request.params?.name ?? "");
    const args = (request.params?.arguments ?? {}) as { days?: number };
    if (name === "get_data_status") {
      return response(request.id, {
        content: [{ type: "text", text: JSON.stringify(await getGarminSourceStatus(), null, 2) }],
      });
    }
    if (name === "sync_garmin") {
      const result = await syncGarminConnect(args.days ?? 7);
      return response(request.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    }
    if (name === "get_training_context") {
      const context = await readContextSnapshot();
      const syncRuns = await getLatestSyncRuns(10);
      return response(request.id, {
        content: [{ type: "text", text: JSON.stringify({ context, syncRuns }, null, 2) }],
      });
    }
    return error(request.id, `Unknown tool: ${name}`);
  }
  return error(request.id, `Unsupported method: ${request.method ?? "unknown"}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  void (async () => {
    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      const result = await handle(request);
      if (result) process.stdout.write(`${result}\n`);
    } catch (err) {
      process.stdout.write(`${error(undefined, err instanceof Error ? err.message : "Invalid MCP request")}\n`);
    }
  })();
});
