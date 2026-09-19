import { NextResponse } from "next/server";
import { getGarminSourceStatus } from "@/lib/garminSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getGarminSourceStatus());
}
