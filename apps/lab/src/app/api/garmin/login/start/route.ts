import { NextResponse } from "next/server";
import { startGarminLogin } from "@/lib/garminSource";
import { liveGarminEnabled } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!liveGarminEnabled()) {
    return NextResponse.json({ error: "Live Garmin is private and disabled. Use manual import." }, { status: 404 });
  }
  const body = (await request.json()) as { email?: string; password?: string };
  if (!body.email?.trim() || !body.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await startGarminLogin(body.email.trim(), body.password));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Garmin login failed." }, { status: 503 });
  }
}
