import { NextResponse } from "next/server";
import { saveGarminPersonalKey } from "@/lib/garminSource";
import { GarminPersonalError } from "@/lib/garminPersonal";
import { liveGarminEnabled } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!liveGarminEnabled()) {
    return NextResponse.json({ error: "Live Garmin is private and disabled. Use manual import.", code: "disabled" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
  try {
    return NextResponse.json(await saveGarminPersonalKey(body.apiKey ?? ""));
  } catch (error) {
    const status = error instanceof GarminPersonalError ? error.status : 502;
    const code = error instanceof GarminPersonalError ? error.code : "token_failed";
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not validate the API key.",
      code,
    }, { status });
  }
}
