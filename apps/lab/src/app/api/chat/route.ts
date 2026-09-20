import { NextRequest, NextResponse } from "next/server";
import { type CoachToolEvent } from "@/lib/coachContract";
import { streamAnviaCoach } from "@/lib/anviaCoach";
import { llmConfigured, llmModel, llmProvider } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatBody = {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** When true (default), stream tool progress as SSE. */
  stream?: boolean;
};

function sseEncode(ev: CoachToolEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

function publicLlmError(error: unknown): { message: string; status: number } {
  const raw = error instanceof Error ? error.message : String(error);
  if (/401|invalid[_ ]api[_ ]key|incorrect api key|unauthorized/i.test(raw)) {
    return {
      message: "The configured LLM API key was rejected. Update DEVSCALE_API_KEY (or switch LLM_PROVIDER) in the server .env, then restart the Lab.",
      status: 401,
    };
  }
  if (/429|rate limit|too many requests/i.test(raw)) {
    return { message: "The LLM provider rate limit was reached. Please retry later.", status: 429 };
  }
  return { message: "The LLM provider is unavailable. Check the server configuration and logs.", status: 502 };
}

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

  if (!llmConfigured()) {
    return NextResponse.json(
      {
        error:
          "LLM not configured. Set LLM_PROVIDER=devscale|openai and API keys in root .env.",
      },
      { status: 503 },
    );
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const useStream = body.stream !== false;

  if (!useStream) {
       try {
         const result = await streamAnviaCoach(message, history, () => undefined);
      return NextResponse.json({
        ...result,
        tried_models: null,
           source: "anvia",
        agent_id: null,
      });
     } catch (err) {
       const failure = publicLlmError(err);
       return NextResponse.json(
         {
           error: failure.message,
           model: llmModel(),
           provider: llmProvider(),
         },
         { status: failure.status },
       );
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (ev: CoachToolEvent) => {
        controller.enqueue(enc.encode(sseEncode(ev)));
      };

      try {
         await streamAnviaCoach(message, history, send);
       } catch (err) {
         const failure = publicLlmError(err);
         send({
           type: "error",
           error: failure.message,
         });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
