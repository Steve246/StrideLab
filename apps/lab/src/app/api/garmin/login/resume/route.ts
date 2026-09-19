import { NextResponse } from "next/server";
import { resumeGarminLogin } from "@/lib/garminSource";
import { liveGarminEnabled } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!liveGarminEnabled()) {
    return NextResponse.json({ error: "Live Garmin is private and disabled. Use manual import." }, { status: 404 });
  }
  const body = (await request.json()) as { challengeId?: string; code?: string };
  if (!body.challengeId || !body.code?.trim()) {
    return NextResponse.json({ error: "Challenge ID and verification code are required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await resumeGarminLogin(body.challengeId, body.code.trim()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Garmin verification failed." }, { status: 502 });
  }
}
