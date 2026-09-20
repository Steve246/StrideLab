import { NextResponse } from "next/server";
import { loadLabEnv } from "@/lib/env";
import { publicExternalConfig } from "@/lib/externalChannels";
import { mcpToolNames } from "@/mcp/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser-safe external channel status. Secrets (Telegram bot token, MCP auth
 * token, Lens keys) are intentionally excluded.
 */
export async function GET() {
  loadLabEnv();
  return NextResponse.json(publicExternalConfig(mcpToolNames().length));
}