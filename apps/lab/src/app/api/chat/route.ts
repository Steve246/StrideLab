import { NextRequest, NextResponse } from "next/server";
import { coachChat } from "@/lib/openaiCoach";
import { openaiConfigured, openaiModel } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatBody = {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!openaiConfigured()) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY not set in repo root .env. Lab uses OpenAI directly — Anvia Studio is optional.",
      },
      { status: 503 },
    );
  }

  try {
    const { reply, model } = await coachChat({
      message,
      history: Array.isArray(body.history) ? body.history : [],
    });
    return NextResponse.json({
      reply,
      model,
      source: "openai-direct",
      agent_id: null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "OpenAI chat failed",
        model: openaiModel(),
      },
      { status: 502 },
    );
  }
}
