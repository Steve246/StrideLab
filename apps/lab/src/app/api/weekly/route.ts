import { NextRequest, NextResponse } from "next/server";
import { buildWeekly, parseWeeks } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const weeks = parseWeeks(req.nextUrl.searchParams.get("weeks"));
    const payload = await buildWeekly(weeks);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load weekly" },
      { status: 500 },
    );
  }
}
