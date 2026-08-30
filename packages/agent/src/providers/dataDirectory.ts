import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** Root for all durable agent data (`packages/agent/data`). */
export const DATA_ROOT = path.join(packageRoot, "data");

/** Normalized Garmin activities (merged `activities.json`). */
export const DATA_DIR = path.join(DATA_ROOT, "activities");

/** Sleep, daily UDS, VO2max, race predictions from DI_CONNECT. */
export const ENRICHMENT_DIR = path.join(DATA_ROOT, "enrichment");

export const READINESS_DIR = path.join(DATA_ROOT, "readiness");
export const LOAD_DIR = path.join(DATA_ROOT, "load");
export const PLANS_DIR = path.join(DATA_ROOT, "plans");
export const EXPORTS_DIR = path.join(DATA_ROOT, "exports");
export const RAW_DIR = path.join(DATA_ROOT, "raw");
/** Chart HTML sandbox (training load / weekly distance graphs). */
export const VIZ_DIR = path.join(DATA_ROOT, "viz");
