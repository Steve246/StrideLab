/** Client-safe dashboard layout types + constants (no Node fs). */

export const DASHBOARD_WIDGETS = [
  "kpis",
  "weekly",
  "acr",
  "vega",
  "daily_analyzer",
  "your_best",
  "activities",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number];

export const VEGA_CHART_KINDS = [
  "weekly_distance",
  "weekly_trimp",
  "weekly_hrv",
  "acr_trimp",
] as const;

export type VegaChartKind = (typeof VEGA_CHART_KINDS)[number];

export type DashboardLayout = {
  updated_at: string;
  widgets: DashboardWidgetId[];
  vega_kind: VegaChartKind | null;
  /** Serialized Vega-Lite spec (safe, server-built). */
  vega_spec: Record<string, unknown> | null;
};

export const DEFAULT_LAYOUT: DashboardLayout = {
  updated_at: new Date(0).toISOString(),
  widgets: [
    "kpis",
    "weekly",
    "acr",
    "daily_analyzer",
    "your_best",
    "activities",
  ],
  vega_kind: null,
  vega_spec: null,
};

export function isDashboardWidgetId(v: unknown): v is DashboardWidgetId {
  return (
    typeof v === "string" &&
    (DASHBOARD_WIDGETS as readonly string[]).includes(v)
  );
}

export function isVegaChartKind(v: unknown): v is VegaChartKind {
  return (
    typeof v === "string" && (VEGA_CHART_KINDS as readonly string[]).includes(v)
  );
}

export function normalizeWidgets(input: unknown): DashboardWidgetId[] {
  if (!Array.isArray(input)) return [...DEFAULT_LAYOUT.widgets];
  const seen = new Set<DashboardWidgetId>();
  const out: DashboardWidgetId[] = [];
  for (const item of input) {
    if (!isDashboardWidgetId(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.length ? out : [...DEFAULT_LAYOUT.widgets];
}
