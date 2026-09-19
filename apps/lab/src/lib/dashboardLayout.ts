import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_DATA_ROOT } from "./paths";
import {
  DEFAULT_LAYOUT,
  isVegaChartKind,
  normalizeWidgets,
  type DashboardLayout,
} from "./dashboardLayoutShared";

export * from "./dashboardLayoutShared";

const LAB_DIR = path.join(AGENT_DATA_ROOT, "lab");
export const DASHBOARD_FILE = path.join(LAB_DIR, "dashboards.json");

export async function readDashboardLayout(): Promise<DashboardLayout> {
  try {
    const raw = JSON.parse(await fs.readFile(DASHBOARD_FILE, "utf8")) as Partial<
      DashboardLayout
    >;
    return {
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : DEFAULT_LAYOUT.updated_at,
      widgets: normalizeWidgets(raw.widgets),
      vega_kind: isVegaChartKind(raw.vega_kind) ? raw.vega_kind : null,
      vega_spec:
        raw.vega_spec && typeof raw.vega_spec === "object"
          ? (raw.vega_spec as Record<string, unknown>)
          : null,
    };
  } catch {
    return { ...DEFAULT_LAYOUT, widgets: [...DEFAULT_LAYOUT.widgets] };
  }
}

export async function writeDashboardLayout(
  layout: DashboardLayout,
): Promise<DashboardLayout> {
  await fs.mkdir(LAB_DIR, { recursive: true });
  const next: DashboardLayout = {
    ...layout,
    updated_at: new Date().toISOString(),
    widgets: normalizeWidgets(layout.widgets),
  };
  await fs.writeFile(DASHBOARD_FILE, JSON.stringify(next, null, 2));
  return next;
}
