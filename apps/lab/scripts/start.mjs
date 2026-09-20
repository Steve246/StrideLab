#!/usr/bin/env node
/**
 * Local production start with a clear preflight.
 *
 * `next start` needs a production build in `.next`. `pnpm lab:dev:clean`
 * deletes `.next`, so it is easy to end up with no build and a cryptic
 * "Could not find a production build" error. This checks first.
 *
 * Docker does not use this — it runs the standalone server directly
 * (see Dockerfile.lab).
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildId = path.join(labRoot, ".next", "BUILD_ID");

if (!fs.existsSync(buildId)) {
  console.error("");
  console.error("No production build found in apps/lab/.next.");
  console.error("");
  console.error("  Build and start:  pnpm lab:prod");
  console.error("  Or build first:   pnpm lab:build && pnpm lab");
  console.error("  For development:  pnpm lab:dev");
  console.error("");
  process.exit(1);
}

const child = spawn("next", ["start", "--port", "4030"], {
  cwd: labRoot,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
