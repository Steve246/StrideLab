import path from "node:path";
import { fileURLToPath } from "node:url";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(labRoot, "../..");

/** Same durable store the Anvia agent writes after Garmin resync. */
export const AGENT_DATA_ROOT = path.join(repoRoot, "packages/agent/data");
export const ACTIVITIES_FILE = path.join(
  AGENT_DATA_ROOT,
  "activities",
  "activities.json",
);
export const ENRICHMENT_DIR = path.join(AGENT_DATA_ROOT, "enrichment");
export const LOAD_DIR = path.join(AGENT_DATA_ROOT, "load");

export const STUDIO_URL =
  process.env.STUDIO_URL?.replace(/\/$/, "") ?? "http://localhost:4021";
export const STUDIO_AGENT_ID = process.env.STUDIO_AGENT_ID ?? "running-lab";
