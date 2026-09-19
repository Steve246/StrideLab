import { NextResponse } from "next/server";
import { setGarminSource, type GarminSource } from "@/lib/garminSource";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { source?: GarminSource };
  if (body.source !== "manual_export" && body.source !== "garmin_connect") {
    return NextResponse.json({ error: "Invalid Garmin source." }, { status: 400 });
  }
  return NextResponse.json(await setGarminSource(body.source));
}
