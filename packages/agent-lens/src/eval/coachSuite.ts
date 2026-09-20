import { evalExitCode, printEvalResult, runEvalSuite } from "@anvia/core/evals";
import { lens } from "../observability.js";
import { coachCases, type AgentAnswer } from "./cases.js";
import { printJudgeReport } from "./judge.js";
import { answerMetrics } from "./metrics.js";
import {
  EvalBlockedError,
  checkCoachReachable,
  relaxTlsForLocalHttps,
} from "./preflight.js";

export type SuiteRun = {
  /** 0 = pass, 1 = failure, 2 = blocked (target not runnable). */
  exitCode: number;
  blocked?: string;
};

export function coachBaseUrl(): string {
  return (
    process.env.EVAL_COACH_URL?.trim() || "http://localhost:4030"
  ).replace(/\/$/, "");
}

async function postCoach(
  baseUrl: string,
  input: string,
): Promise<AgentAnswer> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input, stream: false }),
  });

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Coach returned non-JSON (${res.status}): ${raw.slice(0, 200)}`,
    );
  }

  if (!res.ok) {
    throw new Error(
      `Coach request failed (${res.status}): ${String(data.error ?? raw).slice(0, 200)}`,
    );
  }

  return {
    reply: typeof data.reply === "string" ? data.reply : "",
    tools_used: Array.isArray(data.tools_used)
      ? (data.tools_used as unknown[]).map(String)
      : [],
  };
}

/** A gateway/network hiccup is retried; a 4xx configuration error is not. */
function isTransient(message: string): boolean {
  return /fetch failed|HTTP 50[234]|ECONN|socket hang up|aborted|timeout/i.test(
    message,
  );
}

async function coachTarget(
  baseUrl: string,
  input: string,
  attempts = 3,
): Promise<AgentAnswer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await postCoach(baseUrl, input);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts || !isTransient(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  throw lastError;
}

/** Suite A — evaluate the shipped Lab coach through its real HTTP boundary. */
export async function runCoachSuite(baseUrl = coachBaseUrl()): Promise<SuiteRun> {
  relaxTlsForLocalHttps(baseUrl);

  let health;
  try {
    health = await checkCoachReachable(baseUrl);
  } catch (error) {
    if (error instanceof EvalBlockedError) {
      console.error(`BLOCKED: ${error.reason}`);
      console.error("Coach evaluation skipped — this is not an agent failure.");
      return { exitCode: 2, blocked: error.reason };
    }
    throw error;
  }

  console.log(`Evaluating Lab coach at ${baseUrl}`);
  console.log(
    `Lab health: ok · provider=${health.provider ?? "?"} · model=${health.model ?? "?"}`,
  );
  console.log(`Lens reporting: ${lens.enabled ? "enabled" : "disabled"}`);

  const reporter = lens.evalReporter({ includePayloads: false });
  const result = await runEvalSuite({
    name: "stridelab-coach-v1",
    cases: coachCases,
    target: (input) => coachTarget(baseUrl, input),
    metrics: answerMetrics,
    concurrency: 1,
    reporters: lens.enabled ? [reporter] : undefined,
  });

  printEvalResult(result);
  printJudgeReport(result);
  return { exitCode: evalExitCode(result) };
}