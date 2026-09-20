import { loadLabEnv } from "./env";
import { resolveManualSource } from "./garminSourceConfig";

export type ResyncResult = {
  mode?: string;
  imported?: number;
  total?: number;
  trimp_sessions?: number;
  di_connect_root?: string;
  saved?: string;
  [key: string]: unknown;
};

/**
 * Run deterministic Garmin DI_CONNECT sync (no LLM).
 *
 * Runs the agent importer in-process. The previous implementation spawned
 * `pnpm exec tsx`, which is unavailable in the standalone Docker runtime and
 * failed with `spawn pnpm ENOENT`.
 */
export async function runGarminResync(): Promise<ResyncResult> {
  loadLabEnv();
  const source = await resolveManualSource();
  const mod = await import("../../../../packages/agent/src/garmin/syncDiConnect");
  const result = await mod.syncDiConnect(source.rawPath ?? undefined);
  return result as ResyncResult;
}
