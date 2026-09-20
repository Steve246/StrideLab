import { NextResponse } from "next/server";
import { COACH_TOOL_CATALOG } from "@/lib/coachTools";
import { coachShowTools, loadLabEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List Lab coach tools. Hidden in production unless COACH_SHOW_TOOLS=true. */
export async function GET() {
  loadLabEnv();
  if (!coachShowTools()) {
    return NextResponse.json({ tools: [], count: 0 });
  }
  return NextResponse.json({
    tools: COACH_TOOL_CATALOG,
    count: COACH_TOOL_CATALOG.length,
  });
}
