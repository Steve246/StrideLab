import { NextResponse } from "next/server";
import { getGarminSourceStatus, syncGarminConnect } from "@/lib/garminSource";
import { GarminPersonalError } from "@/lib/garminPersonal";
import { runGarminResync } from "@/lib/resync";
import { liveGarminEnabled, personalSyncDays } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    source?: "manual_export" | "garmin_connect";
    adapter?: "manual_export" | "live";
    vendor?: string;
    days?: number;
  };
  const status = await getGarminSourceStatus();
  const source = body.adapter === "live"
    ? "garmin_connect"
    : body.adapter === "manual_export"
      ? "manual_export"
      : body.source ?? status.activeSource;
  try {
    if (source === "garmin_connect" && !liveGarminEnabled()) {
      return NextResponse.json({ error: "Live Garmin is private and disabled. Use manual import." }, { status: 404 });
    }
    if (body.adapter === "live" && body.vendor && body.vendor !== "garmin_connect") {
      return NextResponse.json({ error: `Live vendor "${body.vendor}" is not configured.` }, { status: 400 });
    }
    if (source === "garmin_connect") {
      return NextResponse.json(await syncGarminConnect(personalSyncDays(body.days)));
    }
    return NextResponse.json(await runGarminResync());
  } catch (error) {
    const status = error instanceof GarminPersonalError ? error.status : 500;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Garmin sync failed.",
      code: error instanceof GarminPersonalError ? error.code : "sync_failed",
    }, { status });
  }
}
