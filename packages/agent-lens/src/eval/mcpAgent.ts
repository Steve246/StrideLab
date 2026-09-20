import { lens } from "../observability.js";
import { runMcpSuite } from "./mcpSuite.js";

/**
 * CLI: evaluate the v1 Anvia agent that consumes the complete MCP server.
 *
 * Exit codes: 0 = pass, 1 = failed metric, 2 = blocked (MCP unreachable).
 */
try {
  const { exitCode } = await runMcpSuite();
  process.exitCode = exitCode;
} finally {
  await lens.flush();
  await lens.close();
}