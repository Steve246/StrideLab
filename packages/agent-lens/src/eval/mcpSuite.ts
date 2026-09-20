import {
  agentEvalTarget,
  evalExitCode,
  printEvalResult,
  runEvalSuite,
} from "@anvia/core/evals";
import { Agent } from "@anvia/core/agent";
import { OpenAIClient } from "@anvia/openai";
import { connectStridelabMcp } from "../mcp.js";
import { lens, tracing } from "../observability.js";
import { mcpAgentCases, type AgentAnswer } from "./cases.js";
import { printJudgeReport } from "./judge.js";
import { answerMetrics } from "./metrics.js";
import type { SuiteRun } from "./coachSuite.js";

/**
 * Suite B — evaluate a v1 Anvia agent whose only tools come from the complete
 * MCP server. Proves MCP discovery, tool use, and credential safety.
 */
export async function runMcpSuite(): Promise<SuiteRun> {
  let mcpClient;
  let server;
  try {
    ({ client: mcpClient, server } = await connectStridelabMcp());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`BLOCKED: could not connect to the MCP server — ${reason}`);
    console.error(
      'MCP evaluation skipped. Verify "pnpm mcp:check" first.',
    );
    return { exitCode: 2, blocked: reason };
  }

  try {
    console.log(
      `Connected MCP server "${server.name}" with ${server.tools.length} tools`,
    );
    console.log(`Lens reporting: ${lens.enabled ? "enabled" : "disabled"}`);

    const baseUrl =
      process.env.DEVSCALE_BASE_URL?.trim() ||
      "https://gateway.devscale.id/v1";
    const apiKey = process.env.DEVSCALE_API_KEY?.trim();
    const modelId =
      process.env.DEVSCALE_MODEL?.trim() || "deepseek-v4-flash-0731";
    if (!apiKey) {
      console.error("BLOCKED: DEVSCALE_API_KEY is required for the MCP suite.");
      return { exitCode: 2, blocked: "DEVSCALE_API_KEY missing" };
    }

    /** Tools invoked during the current case (suites run serially). */
    let usedTools: string[] = [];

    const model = new OpenAIClient({ baseUrl, apiKey }).completionModel({
      modelId,
      api: "chat",
    });

    const agent = new Agent({
      id: "stridelab-mcp-agent",
      name: "StrideLab MCP Agent",
      model,
      instructions: [
        "You are the StrideLab running coach.",
        "Answer only from the MCP tool results.",
        "Never request, echo, or store Garmin credentials.",
        "Stay strictly within running and training coaching; politely decline unrelated topics such as politics, news, or general trivia and offer training help instead.",
        "Keep answers to two sentences and name the tool data you used.",
      ].join(" "),
      mcpServers: [server],
      maxTurns: 4,
      lifecycle: {
        onToolStart: (event) => {
          usedTools.push(event.toolName);
        },
      },
      observability: {
        observers: { lens: tracing },
        primaryTrace: "lens",
        errorPolicy: "ignore",
      },
    });

    const target = agentEvalTarget<string, string, AgentAnswer>({
      agent,
      request: ({ input, testCase }) => {
        usedTools = [];
        return {
          prompt: input,
          trace: {
            name: `eval:${testCase.id}`,
            tags: ["eval", "mcp"],
            metadata: { suite: "stridelab-mcp-agent-v1" },
          },
        };
      },
      output: ({ response }) => ({
        reply: response.type === "response" ? String(response.output ?? "") : "",
        tools_used: [...usedTools],
      }),
    });

    const reporter = lens.evalReporter({ includePayloads: false });
    const result = await runEvalSuite({
      name: "stridelab-mcp-agent-v1",
      cases: mcpAgentCases,
      target,
      metrics: answerMetrics,
      concurrency: 1,
      reporters: lens.enabled ? [reporter] : undefined,
    });

    printEvalResult(result);
    printJudgeReport(result);
    return { exitCode: evalExitCode(result) };
  } finally {
    await mcpClient.close();
  }
}