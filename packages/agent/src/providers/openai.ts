import { OpenAIClient } from "@anvia/openai";

export const openAiClient = new OpenAIClient({
  baseUrl: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
  // completionApi: "responses",
  completionApi: "responses",
});

export function getModel(modelId: string = "gpt-5.6-terra") {
  return openAiClient.completionModel(modelId);
}

// used - gpt-5.6-terra
