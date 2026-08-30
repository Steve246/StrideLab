import { NextResponse } from "next/server";
import { runGarminResync } from "@/lib/resync";
import { loadLabEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  loadLabEnv();
  if (!process.env.GARMIN_EXPORT_DIR?.trim()) {
    return NextResponse.json(
      {
        error:
          "GARMIN_EXPORT_DIR is not set in root .env. Point it at your DI_CONNECT folder.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runGarminResync();
    return NextResponse.json({
      ok: true,
      message: `Resynced ${result.imported} activities (${result.total} total). No LLM used.`,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Resync failed",
      },
      { status: 500 },
    );
  }
}
