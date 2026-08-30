import { NextResponse } from "next/server";
import { buildOverview } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const overview = await buildOverview(12);
    return NextResponse.json(overview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load overview" },
      { status: 500 },
    );
  }
}
