import type { AgentAnswer, CaseMeta } from "./cases.js";

/**
 * Human-readable judgement of an eval run.
 *
 * The Anvia runner reports pass/fail counts. This module explains *why* those
 * counts came out the way they did: what each case checked, which gates it
 * cleared, and what a failure would indicate. It never changes the outcome.
 */

type OutcomeStatus = "pass" | "fail" | "invalid";

type MetricLike = {
  metricName: string;
  required: boolean;
  outcome: { outcome: OutcomeStatus; reason?: string; comment?: string };
};

type CaseResultLike = {
  case: { id: string; metadata?: unknown };
  outcome: OutcomeStatus;
  targetError?: unknown;
  output?: unknown;
  metrics: MetricLike[];
};

type SuiteResultLike = {
  name: string;
  results: CaseResultLike[];
  cases: { total: number; passed: number; failed: number; invalid: number };
  metrics: { total: number; passed: number; failed: number; invalid: number };
};

type Category =
  | "safety"
  | "tool_use"
  | "completeness"
  | "grounding"
  | "response_quality"
  | "correctness"
  | "relevance"
  | "precision_recall"
  | "abstention";

const CATEGORY_OF: Record<string, Category> = {
  forbidden_reply_content: "safety",
  no_credential_echo: "safety",
  safety: "safety",
  expected_tool_used: "tool_use",
  non_empty_reply: "completeness",
  completeness: "completeness",
  grounded_numbers: "grounding",
  expected_reply_content: "response_quality",
  useful_length: "response_quality",
  correctness: "correctness",
  relevance: "relevance",
  recall: "precision_recall",
  precision: "precision_recall",
  abstention: "abstention",
};

const CATEGORY_LABEL: Record<Category, string> = {
  safety: "Safety gates",
  tool_use: "Tool-use gates",
  completeness: "Completeness gates",
  grounding: "Grounding signals",
  response_quality: "Response-quality signals",
  correctness: "Correctness signals",
  relevance: "Relevance signals",
  precision_recall: "Precision / recall signals",
  abstention: "Abstention signals",
};

const REQUIRED_ORDER = [
  "non_empty_reply",
  "expected_tool_used",
  "forbidden_reply_content",
  "no_credential_echo",
];

function metaOf(metadata: unknown): CaseMeta {
  return (metadata ?? {}) as CaseMeta;
}

function answerOf(output: unknown): AgentAnswer | null {
  if (
    output &&
    typeof output === "object" &&
    "reply" in output &&
    typeof (output as { reply?: unknown }).reply === "string"
  ) {
    const typed = output as { reply: string; tools_used?: unknown };
    return {
      reply: typed.reply,
      tools_used: Array.isArray(typed.tools_used)
        ? typed.tools_used.map(String)
        : [],
    };
  }
  return null;
}

function mark(outcome: OutcomeStatus): string {
  if (outcome === "pass") return "pass";
  if (outcome === "fail") return "FAIL";
  return "invalid";
}

function printCase(result: CaseResultLike): void {
  const meta = metaOf(result.case.metadata);
  const answer = answerOf(result.output);

  console.log(`\n${result.case.id} — ${result.outcome.toUpperCase()}`);
  if (meta.purpose) console.log(`  Purpose: ${meta.purpose}`);
  if (meta.whyItMatters) console.log(`  Why it matters: ${meta.whyItMatters}`);
  if (answer) {
    console.log(
      `  Tools used: ${answer.tools_used.length ? answer.tools_used.join(", ") : "(none)"}`,
    );
  }

  const required = result.metrics
    .filter((metric) => REQUIRED_ORDER.includes(metric.metricName))
    .sort(
      (a, b) =>
        REQUIRED_ORDER.indexOf(a.metricName) -
        REQUIRED_ORDER.indexOf(b.metricName),
    );
  if (required.length) {
    console.log(
      `  Required: ${required
        .map((metric) => `${metric.metricName}=${mark(metric.outcome.outcome)}`)
        .join(" · ")}`,
    );
  }

  const advisory = result.metrics.filter(
    (metric) => !REQUIRED_ORDER.includes(metric.metricName),
  );
  if (advisory.length) {
    console.log(
      `  Advisory: ${advisory
        .map((metric) => `${metric.metricName}=${mark(metric.outcome.outcome)}`)
        .join(" · ")}`,
    );
  }

  if (result.targetError) {
    console.log(
      `  Target error: ${
        result.targetError instanceof Error
          ? result.targetError.message
          : String(result.targetError)
      }`,
    );
  }
  for (const metric of result.metrics) {
    if (metric.outcome.outcome === "invalid" && metric.outcome.reason) {
      console.log(`  ${metric.metricName} invalid: ${metric.outcome.reason}`);
    }
  }

  if (result.outcome === "pass" && meta.passCriteria) {
    console.log(`  Passed because: ${meta.passCriteria}`);
  }
  if (result.outcome !== "pass" && meta.failHint) {
    console.log(`  Failure hint: ${meta.failHint}`);
  }
}

function tally(result: SuiteResultLike) {
  const perCategory = new Map<Category, { total: number; passed: number }>();
  for (const metric of result.results.flatMap((entry) => entry.metrics)) {
    const category = CATEGORY_OF[metric.metricName];
    if (!category) continue;
    const bucket = perCategory.get(category) ?? { total: 0, passed: 0 };
    bucket.total += 1;
    if (metric.outcome.outcome === "pass") bucket.passed += 1;
    perCategory.set(category, bucket);
  }
  return perCategory;
}

/** Print the explanatory report for a completed suite. */
export function printJudgeReport(result: SuiteResultLike): void {
  console.log(`\n${"─".repeat(64)}`);
  console.log(`Judge report — ${result.name}`);
  console.log("─".repeat(64));

  for (const caseResult of result.results) printCase(caseResult);

  const perCategory = tally(result);
  console.log(`\nSummary`);
  console.log(
    `  Cases: ${result.cases.passed}/${result.cases.total} passed` +
      (result.cases.failed ? `, ${result.cases.failed} failed` : "") +
      (result.cases.invalid ? `, ${result.cases.invalid} invalid` : ""),
  );
  for (const category of Object.keys(CATEGORY_LABEL) as Category[]) {
    const bucket = perCategory.get(category);
    if (!bucket) continue;
    console.log(
      `  ${CATEGORY_LABEL[category]}: ${bucket.passed}/${bucket.total} passed`,
    );
  }

  const allPassed =
    result.cases.failed === 0 &&
    result.cases.invalid === 0 &&
    result.cases.total > 0;
  if (allPassed) {
    console.log(
      `  Overall: PASS — every case answered from tool data, called the expected tools, and never echoed credentials.`,
    );
    const advisoryFailures = result.results
      .flatMap((entry) => entry.metrics)
      .filter(
        (metric) =>
          !metric.required && metric.outcome.outcome !== "pass",
      ).length;
    console.log(
      advisoryFailures === 0
        ? "  Caveats: none — all advisory quality signals passed too."
        : `  Caveats: ${advisoryFailures} advisory signal(s) failed; wording or length may vary but correctness held.`,
    );
  } else {
    const failedIds = result.results
      .filter((entry) => entry.outcome !== "pass")
      .map((entry) => entry.case.id);
    console.log(
      `  Overall: ${result.cases.invalid > 0 && result.cases.failed === 0 ? "BLOCKED/INVALID" : "FAIL"} — review: ${failedIds.join(", ")}`,
    );
  }
}