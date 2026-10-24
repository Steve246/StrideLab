import { NextResponse } from "next/server";
import { disconnectGarmin } from "@/lib/garminSource";
import { GarminPersonalError } from "@/lib/garminPersonal";
import { liveGarminEnabled } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  if (!liveGarminEnabled()) {
    return NextResponse.json({ error: "Live Garmin is private and disabled." }, { status: 404 });
  }
  try {
    return NextResponse.json(await disconnectGarmin());
  } catch (error) {
    const status = error instanceof GarminPersonalError ? error.status : 502;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Disconnect failed.",
      code: error instanceof GarminPersonalError ? error.code : "disconnect_failed",
    }, { status });
  }
}
