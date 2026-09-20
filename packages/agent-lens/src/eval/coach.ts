import { lens } from "../observability.js";
import { runCoachSuite } from "./coachSuite.js";

/**
 * CLI: evaluate the shipped Lab coach (Suite A).
 *
 * Exit codes: 0 = pass, 1 = failed metric, 2 = blocked (Lab not reachable).
 * Set `EVAL_COACH_URL` to target a different instance.
 */
try {
  const { exitCode } = await runCoachSuite();
  process.exitCode = exitCode;
} finally {
  await lens.flush();
  await lens.close();
}