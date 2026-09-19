import { NextResponse } from "next/server";
import { buildYourBestPayload } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await buildYourBestPayload();
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load your best",
      },
      { status: 500 },
    );
  }
}
