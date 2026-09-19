import { NextRequest, NextResponse } from "next/server";
import { buildDailyAnalyzer, parseDays } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const days = parseDays(req.nextUrl.searchParams.get("days"), 7);
    const payload = await buildDailyAnalyzer(days);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load daily analyzer",
      },
      { status: 500 },
    );
  }
}
