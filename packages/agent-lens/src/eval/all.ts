import { runMcpConnectionCheck } from "../mcpCheck.js";
import { lens } from "../observability.js";
import { coachBaseUrl, runCoachSuite, type SuiteRun } from "./coachSuite.js";
import { runMcpSuite } from "./mcpSuite.js";

/**
 * Combined evaluation: MCP connection, MCP agent suite, and the browser coach
 * suite. A blocked target is reported as BLOCKED, not as a failed agent.
 *
 * Exit codes: 0 = all runnable suites passed, 1 = a suite failed,
 * 2 = at least one suite was blocked and none failed.
 */

function label(run: SuiteRun): string {
  if (run.exitCode === 2) return "BLOCKED";
  if (run.exitCode === 0) return "PASS";
  return "FAIL";
}

try {
  console.log("=== 1/3 MCP connection check ===");
  const mcpCheck = await runMcpConnectionCheck((line) => console.log(line));
  console.log(`MCP connection: ${mcpCheck.ok ? "PASS" : "FAIL"}`);

  console.log("\n=== 2/3 MCP agent evaluation ===");
  const mcpRun = await runMcpSuite();

  console.log("\n=== 3/3 Lab coach evaluation ===");
  const coachRun = await runCoachSuite(coachBaseUrl());

  console.log("\n=== Summary ===");
  console.log(`MCP connection:   ${mcpCheck.ok ? "PASS" : "FAIL"}`);
  console.log(`MCP agent suite:  ${label(mcpRun)}`);
  console.log(`Lab coach suite:  ${label(coachRun)}`);
  if (coachRun.exitCode === 2) {
    console.log(`  coach target: ${coachBaseUrl()}`);
    console.log("  start it with: pnpm lab:dev:clean");
  }

  const failed = !mcpCheck.ok || mcpRun.exitCode === 1 || coachRun.exitCode === 1;
  const blocked = mcpRun.exitCode === 2 || coachRun.exitCode === 2;
  process.exitCode = failed ? 1 : blocked ? 2 : 0;
} finally {
  await lens.flush();
  await lens.close();
}