import { NextResponse } from "next/server";
import { loadLabEnv } from "@/lib/env";
import {
  mcpHttpAuthToken,
  mcpHttpEnabled,
} from "@/lib/externalChannels";
import {
  handleMcpRequest,
  mcpToolNames,
  type ExternalRequestContext,
  type JsonRpcRequest,
} from "@/mcp/core";

/**
 * Remote MCP transport (Streamable-HTTP-style JSON-RPC over POST).
 *
 * Disabled unless `MCP_HTTP_ENABLED=true`. When enabled it requires a bearer
 * token (`MCP_HTTP_AUTH_TOKEN`). Remote callers get read + sync but *not*
 * dashboard mutation by default, so a chat channel cannot silently reorder
 * someone's dashboard.
 *
 * Secrets, Garmin credentials, and MFA never travel through this endpoint.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMOTE_CONTEXT: Omit<ExternalRequestContext, "clientId"> = {
  channel: "http",
  permissions: {
    readTrainingData: true,
    mutateDashboard: false,
    syncData: true,
  },
};

function unauthorized(message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message } },
    { status: 401 },
  );
}

export async function GET() {
  loadLabEnv();
  if (!mcpHttpEnabled()) {
    return NextResponse.json({ error: "Remote MCP is disabled." }, { status: 404 });
  }
  return NextResponse.json({
    server: "stridelab-mcp",
    protocolVersion: "2025-06-18",
    transport: "http-jsonrpc",
    tools: mcpToolNames(),
  });
}

export async function POST(request: Request) {
  loadLabEnv();

  if (!mcpHttpEnabled()) {
    return NextResponse.json(
      { error: "Remote MCP is disabled. Set MCP_HTTP_ENABLED=true." },
      { status: 404 },
    );
  }

  const expected = mcpHttpAuthToken();
  if (!expected) {
    return NextResponse.json(
      { error: "Remote MCP has no MCP_HTTP_AUTH_TOKEN configured." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!presented || presented !== expected) {
    return unauthorized("Invalid or missing bearer token.");
  }

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  const context: ExternalRequestContext = {
    ...REMOTE_CONTEXT,
    clientId:
      request.headers.get("x-mcp-client") ??
      request.headers.get("user-agent") ??
      "http",
  };

  try {
    if (Array.isArray(payload)) {
      const responses = (
        await Promise.all(
          payload.map((entry) => handleMcpRequest(entry, context)),
        )
      ).filter((value): value is string => Boolean(value));
      return new NextResponse(`[${responses.join(",")}]`, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const result = await handleMcpRequest(payload, context);
    if (!result) return new NextResponse(null, { status: 202 });
    return new NextResponse(result, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP request failed";
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message } },
      { status: 500 },
    );
  }
}