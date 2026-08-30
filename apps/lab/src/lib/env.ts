import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(labRoot, "../..");

let loaded = false;

/** Load root `.env` once (OPENAI_*, GARMIN_EXPORT_DIR). */
export function loadLabEnv(): void {
  if (loaded) return;
  loadDotenv({ path: path.join(repoRoot, ".env") });
  loaded = true;
}

export function openaiConfigured(): boolean {
  loadLabEnv();
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function openaiModel(): string {
  loadLabEnv();
  return process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
}

export function openaiBaseUrl(): string | undefined {
  loadLabEnv();
  const u = process.env.OPENAI_BASE_URL?.trim();
  return u || undefined;
}
