import { runMcpConnectionCheck } from "./mcpCheck.js";

/**
 * CLI: deterministic MCP connection check. No LLM is used.
 *
 * Exit codes: 0 = pass, 1 = failed.
 */
const result = await runMcpConnectionCheck((line) => console.log(line));

if (result.ok) {
  console.log("MCP check: OK");
  process.exitCode = 0;
} else {
  console.error(`MCP check: FAILED — ${result.detail}`);
  process.exitCode = 1;
}