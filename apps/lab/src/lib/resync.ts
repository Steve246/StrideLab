import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLabEnv } from "./env";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(labRoot, "../..");
const agentRoot = path.join(repoRoot, "packages/agent");

export type ResyncResult = {
  mode: string;
  imported: number;
  total: number;
  trimp_sessions?: number;
  di_connect_root?: string;
  saved?: string;
  [key: string]: unknown;
};

/**
 * Run deterministic Garmin DI_CONNECT sync (no LLM) via agent script.
 */
export function runGarminResync(): Promise<ResyncResult> {
  loadLabEnv();
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--env-file=../../.env", "scripts/resync.ts"],
      {
        cwd: agentRoot,
        env: process.env,
        shell: process.platform === "win32",
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `resync exited ${code}`));
        return;
      }
      const line = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .at(-1);
      if (!line) {
        reject(new Error("resync produced no output"));
        return;
      }
      try {
        resolve(JSON.parse(line) as ResyncResult);
      } catch {
        reject(new Error(`Invalid resync JSON: ${line.slice(0, 200)}`));
      }
    });
  });
}
