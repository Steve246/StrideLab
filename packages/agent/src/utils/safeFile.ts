import path from "node:path";

/**
 * Turn a model-supplied id into a safe JSON filename (no directories, one .json).
 * Examples:
 *   "plans/steven_ultra_2026-08-23.json" → "steven_ultra_2026-08-23.json"
 *   "steven_running_2026-08-31" → "steven_running_2026-08-31.json"
 */
export function safeJsonBasename(id: string, fallback = "file"): string {
  const raw = id.trim();
  const base = path.basename(raw).replace(/\.json$/i, "");
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return `${cleaned || fallback}.json`;
}
