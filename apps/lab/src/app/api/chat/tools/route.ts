import { NextResponse } from "next/server";
import { COACH_TOOL_CATALOG } from "@/lib/coachTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List Lab coach tools (for UI / demos). */
export async function GET() {
  return NextResponse.json({
    tools: COACH_TOOL_CATALOG,
    count: COACH_TOOL_CATALOG.length,
  });
}
