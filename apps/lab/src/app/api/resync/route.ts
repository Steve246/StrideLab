import { NextResponse } from "next/server";
import { runGarminResync } from "@/lib/resync";
import { loadLabEnv, liveGarminEnabled } from "@/lib/env";
import { getGarminSourceStatus, syncGarminConnect } from "@/lib/garminSource";
import { GarminPersonalError } from "@/lib/garminPersonal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  loadLabEnv();
  const status = await getGarminSourceStatus();
  const liveReady =
    liveGarminEnabled() &&
    status.connect.status === "connected" &&
    Boolean(status.connect.keyOrigin);

  try {
    if (liveReady) {
      const result = await syncGarminConnect(status.syncDays);
      return NextResponse.json({
        ...result,
        ok: true,
        source: "garmin_connect",
        message: `Resynced ${result.importedActivities ?? 0} activities (${result.totalActivities ?? 0} total) via Personal API.`,
      });
    }

    if (status.manual.valid) {
      const result = await runGarminResync();
      return NextResponse.json({
        ok: true,
        source: "manual_export",
        message: `Resynced ${result.imported} activities (${result.total} total) from manual import. No LLM used.`,
        ...result,
      });
    }

    return NextResponse.json(
      {
        error:
          "Nothing to resync. Connect a watch in Live sync (Personal API key), or set a DI_CONNECT folder in Manual import.",
      },
      { status: 400 },
    );
  } catch (err) {
    const statusCode = err instanceof GarminPersonalError ? err.status : 500;
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Resync failed",
        code: err instanceof GarminPersonalError ? err.code : "resync_failed",
      },
      { status: statusCode },
    );
  }
}
