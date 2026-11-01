import { NextResponse } from "next/server";
import { buildActivityAnalysis } from "@/lib/activityAnalysis";
import { readActivities } from "@/lib/data";
import { fetchActivityTrack } from "@/lib/garminPersonal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing activity id" }, { status: 400 });
  }
  const activities = await readActivities();
  const analysis = buildActivityAnalysis(id.trim(), activities);
  if (!analysis) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }
  analysis.track = await fetchActivityTrack(id.trim());
  return NextResponse.json(analysis);
}
