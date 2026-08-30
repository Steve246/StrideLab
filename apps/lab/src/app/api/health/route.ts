import { NextResponse } from "next/server";
import { openaiConfigured, openaiModel, loadLabEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  loadLabEnv();
  const llm_ok = openaiConfigured();
  return NextResponse.json({
    ok: true,
    service: "training-lab",
    llm_ok,
    llm_source: "openai-direct",
    model: llm_ok ? openaiModel() : null,
    studio_required: false,
    garmin_export_configured: Boolean(process.env.GARMIN_EXPORT_DIR?.trim()),
  });
}
