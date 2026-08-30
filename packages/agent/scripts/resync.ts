/**
 * CLI: deterministic Garmin resync (no LLM).
 * Usage from repo root:
 *   pnpm --filter agent resync
 */
import { syncDiConnect } from "../src/garmin/syncDiConnect.js";

syncDiConnect()
  .then((result) => {
    process.stdout.write(JSON.stringify(result) + "\n");
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
