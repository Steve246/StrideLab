import { OpenAIClient } from "@anvia/openai";

export const openAiClient = new OpenAIClient({
  baseUrl: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
  // Agent tool loops use chat completions. Do not send reasoning_effort here —
  // gpt-4.1 rejects it; gpt-5.6-terra needs Responses API for tools instead.
  completionApi: "chat",
});

/** Default: gpt-4.1 — supports function tools on /v1/chat/completions. */
export function getModel(
  modelId: string = process.env.OPENAI_MODEL?.trim() || "gpt-4.1",
) {
  return openAiClient.completionModel(modelId);
}
