import { NextResponse } from "next/server";
import { runGarminResync } from "@/lib/resync";
import { loadLabEnv } from "@/lib/env";
import { resolveManualSource } from "@/lib/garminSourceConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  loadLabEnv();
  const source = await resolveManualSource();
  if (source.origin === "none") {
    return NextResponse.json(
      {
        error:
          "No manual import source. Set a folder in the Manual import panel, or set GARMIN_EXPORT_DIR in root .env.",
      },
      { status: 400 },
    );
  }
  if (!source.valid) {
    return NextResponse.json(
      {
        error: `Garmin export not found or incomplete at "${source.rawPath}". Expected a DI_CONNECT folder.`,
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