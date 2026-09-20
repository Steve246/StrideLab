import { NextResponse } from "next/server";
import { loadLabEnv } from "@/lib/env";
import { setGarminSource, type GarminSource } from "@/lib/garminSource";
import {
  clearManualSourceDir,
  readManualSourceOverride,
  resolveManualSource,
  setManualSourceDir,
} from "@/lib/garminSourceConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read the effective manual source and any stored UI override. */
export async function GET() {
  loadLabEnv();
  const [resolution, override] = await Promise.all([
    resolveManualSource(),
    readManualSourceOverride(),
  ]);
  return NextResponse.json({ ...resolution, override });
}

/**
 * Save a UI-selected manual source path (`{ path }`), or switch the active
 * source (`{ source }`, kept for backward compatibility). An empty path clears
 * the override.
 */
export async function POST(request: Request) {
  loadLabEnv();
  let body: { path?: unknown; source?: unknown };
  try {
    body = (await request.json()) as { path?: unknown; source?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.source === "manual_export" || body.source === "garmin_connect") {
    return NextResponse.json(await setGarminSource(body.source as GarminSource));
  }

  if (typeof body.path !== "string") {
    return NextResponse.json(
      {
        error:
          'Expected { path: string } or { source: "manual_export" | "garmin_connect" }.',
      },
      { status: 400 },
    );
  }

  const resolution = await setManualSourceDir(body.path);
  return NextResponse.json({
    ok: resolution.valid || body.path.trim() === "",
    ...resolution,
  });
}

/** Reset to the `.env` (GARMIN_EXPORT_DIR) default. */
export async function DELETE() {
  loadLabEnv();
  const resolution = await clearManualSourceDir();
  return NextResponse.json({ ok: true, ...resolution });
}