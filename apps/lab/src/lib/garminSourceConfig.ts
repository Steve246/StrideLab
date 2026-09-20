import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_DATA_ROOT } from "./paths";
import { loadLabEnv } from "./env";

/**
 * Manual Garmin import source resolution.
 *
 * Precedence (highest first):
 *   1. explicit path passed to an import call
 *   2. a path saved from the Lab UI
 *   3. the `GARMIN_EXPORT_DIR` environment value (root `.env`)
 *
 * The `.env` value is always kept as the fallback default, so clearing the UI
 * override restores it without editing any files.
 */

export type ManualSourceOrigin = "explicit" | "ui" | "env" | "none";

export type ManualSourceResolution = {
  /** The value before normalization. */
  rawPath: string | null;
  /** Normalized DI_CONNECT path, when one was found. */
  path: string | null;
  valid: boolean;
  origin: ManualSourceOrigin;
};

type PersistedSourceConfig = {
  manualExportDir?: string;
};

const CONFIG_FILE = path.join(AGENT_DATA_ROOT, "garmin-source-config.json");

async function readConfig(): Promise<PersistedSourceConfig> {
  try {
    return JSON.parse(
      await fs.readFile(CONFIG_FILE, "utf8"),
    ) as PersistedSourceConfig;
  } catch {
    return {};
  }
}

async function writeConfig(next: PersistedSourceConfig): Promise<void> {
  await fs.mkdir(AGENT_DATA_ROOT, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), {
    mode: 0o600,
  });
  await fs.chmod(CONFIG_FILE, 0o600);
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a candidate path and normalize it to a real DI_CONNECT root.
 * Accepts either the DI_CONNECT folder itself or a parent that contains it.
 */
export async function validateExportDir(
  raw: string,
): Promise<{ valid: boolean; resolved: string | null }> {
  const absolute = path.resolve(raw);
  const candidates =
    path.basename(absolute) === "DI_CONNECT"
      ? [absolute]
      : [absolute, path.join(absolute, "DI_CONNECT")];

  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    const fitness = path.join(candidate, "DI-Connect-Fitness");
    const uploaded = path.join(candidate, "DI-Connect-Uploaded-Files");
    if ((await exists(fitness)) || (await exists(uploaded))) {
      return { valid: true, resolved: candidate };
    }
    if (path.basename(candidate) === "DI_CONNECT") {
      return { valid: true, resolved: candidate };
    }
  }
  return { valid: false, resolved: null };
}

/** Resolve the manual source using the documented precedence. */
export async function resolveManualSource(
  explicit?: string,
): Promise<ManualSourceResolution> {
  loadLabEnv();

  const uiPath = (await readConfig()).manualExportDir?.trim() || null;
  const envPath = process.env.GARMIN_EXPORT_DIR?.trim() || null;

  let origin: ManualSourceOrigin = "none";
  let raw: string | null = null;

  if (explicit?.trim()) {
    origin = "explicit";
    raw = explicit.trim();
  } else if (uiPath) {
    origin = "ui";
    raw = uiPath;
  } else if (envPath) {
    origin = "env";
    raw = envPath;
  }

  if (!raw) {
    return { rawPath: null, path: null, valid: false, origin: "none" };
  }

  const { valid, resolved } = await validateExportDir(raw);
  return { rawPath: raw, path: resolved ?? path.resolve(raw), valid, origin };
}

/**
 * Persist a UI-selected manual source. The path is saved even when it does not
 * validate yet, so the user can correct it; `valid` reports the current state.
 * Pass an empty string to clear the override and fall back to `.env`.
 */
export async function setManualSourceDir(
  input: string,
): Promise<ManualSourceResolution> {
  const trimmed = input.trim();
  const current = await readConfig();

  if (!trimmed) {
    const next = { ...current };
    delete next.manualExportDir;
    await writeConfig(next);
    return resolveManualSource();
  }

  await writeConfig({ ...current, manualExportDir: trimmed });
  return resolveManualSource();
}

/** Remove the UI override so the `.env` default applies again. */
export async function clearManualSourceDir(): Promise<ManualSourceResolution> {
  return setManualSourceDir("");
}

/** Read the raw saved UI value (for display in the editor). */
export async function readManualSourceOverride(): Promise<string | null> {
  return (await readConfig()).manualExportDir?.trim() || null;
}