import { NextRequest, NextResponse } from "next/server";
import { listRecentActivities, parseLimit } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const payload = await listRecentActivities(limit);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load activities",
      },
      { status: 500 },
    );
  }
}
