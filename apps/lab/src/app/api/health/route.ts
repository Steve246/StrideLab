import { NextResponse } from "next/server";
import {
  loadLabEnv,
  llmConfigured,
  llmModel,
  llmProvider,
  llmApiKey,
  llmBaseUrl,
  llmConfigStatus,
} from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  loadLabEnv();
  const llm_ok = llmConfigured();
  const provider = llmProvider();
  const key = llmApiKey();
  return NextResponse.json({
    ok: true,
    service: "training-lab",
    llm_ok: llm_ok,
    llm_config_status: llmConfigStatus(),
    llm_key_prefix: key?.slice(0, 8) ?? null,
    llm_source: provider === "devscale" ? "devscale-gateway" : "openai-direct",
    provider,
    model: llm_ok ? llmModel() : null,
    base_url: llm_ok ? llmBaseUrl() : null,
    studio_required: false,
    garmin_export_configured: Boolean(process.env.GARMIN_EXPORT_DIR?.trim()),
  });
}
