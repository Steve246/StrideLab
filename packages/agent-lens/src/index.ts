import { Agent } from "@anvia/core/agent";
import { LensClient } from "@anvia/lens";
import { OpenAIClient } from "@anvia/openai";

const baseUrl =
  process.env.DEVSCALE_BASE_URL?.trim() || "https://gateway.devscale.id/v1";
const apiKey = process.env.DEVSCALE_API_KEY?.trim();
const modelId =
  process.env.DEVSCALE_MODEL?.trim() || "deepseek-v4-flash-0731";

if (!apiKey) {
  throw new Error("DEVSCALE_API_KEY is required for the Lens smoke test.");
}

const lens = new LensClient({
  optional: true,
  serviceName: process.env.ANVIA_LENS_SERVICE_NAME || "stridelab-agent",
  environment: process.env.ANVIA_LENS_ENVIRONMENT || "local",
  release: process.env.ANVIA_LENS_RELEASE,
  captureMode: "safe",
});

const client = new OpenAIClient({ baseUrl, apiKey });
const model = client.completionModel({ modelId, api: "chat" });
const agent = new Agent({
  id: "stridelab-lens-smoke",
  name: "StrideLab Lens Smoke Agent",
  model,
  instructions:
    "Answer the user's request in one short sentence. This is an observability smoke test.",
  observability: {
    observers: { lens: lens.observer({ captureMode: "safe" }) },
    primaryTrace: "lens",
    errorPolicy: "ignore",
  },
});

try {
  const result = await agent.generate({
    prompt: "Reply with exactly: StrideLab Lens trace works",
    trace: {
      name: "stridelab-lens-smoke",
      userId: "local-smoke-test",
      sessionId: `lens-smoke-${Date.now()}`,
      tags: ["stridelab", "lens", "smoke-test"],
      metadata: { source: "agent-lens" },
    },
  });

  await lens.flush();
  console.log("Lens enabled:", lens.enabled);
  console.log("Agent result:", result);
  console.log("Open Lens and inspect the stridelab-lens-smoke trace.");
} catch (error) {
  const status =
    error && typeof error === "object" && "status" in error
      ? String((error as { status?: unknown }).status)
      : "unknown";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Lens smoke failed before trace completion (HTTP ${status}): ${message}`);
  console.error(
    "Check DEVSCALE_API_KEY/DEVSCALE_BASE_URL first; then check ANVIA_LENS_* credentials and reachability.",
  );
  process.exitCode = 1;
} finally {
  await lens.close();
}
