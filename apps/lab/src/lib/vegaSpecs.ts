import { buildAcr, buildWeekly } from "./data";
import type { VegaChartKind } from "./dashboardLayoutShared";

type VlSpec = Record<string, unknown>;

const BASE = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  width: "container",
  height: 280,
  background: "transparent",
  config: {
    axis: {
      labelFont: "inherit",
      titleFont: "inherit",
      labelColor: "#5c6570",
      titleColor: "#3d4654",
    },
    view: { stroke: "transparent" },
  },
} as const;

export async function buildVegaSpecForKind(
  kind: VegaChartKind,
): Promise<{ kind: VegaChartKind; title: string; spec: VlSpec }> {
  switch (kind) {
    case "weekly_distance": {
      const { weeks } = await buildWeekly(12);
      return {
        kind,
        title: "Weekly distance (km)",
        spec: {
          ...BASE,
          title: "Weekly distance (km)",
          data: {
            values: weeks.map((w) => ({
              week: w.week_start,
              km: w.distance_km,
            })),
          },
          mark: { type: "bar", cornerRadiusEnd: 3, color: "#2f6f5e" },
          encoding: {
            x: { field: "week", type: "ordinal", title: "Week", axis: { labelAngle: -35 } },
            y: { field: "km", type: "quantitative", title: "km" },
            tooltip: [
              { field: "week", type: "nominal", title: "Week" },
              { field: "km", type: "quantitative", title: "km", format: ".1f" },
            ],
          },
        },
      };
    }
    case "weekly_trimp": {
      const { weeks } = await buildWeekly(12);
      return {
        kind,
        title: "Weekly TRIMP",
        spec: {
          ...BASE,
          title: "Weekly TRIMP",
          data: {
            values: weeks.map((w) => ({
              week: w.week_start,
              trimp: w.trimp,
            })),
          },
          mark: { type: "line", point: true, color: "#c45c26", strokeWidth: 2 },
          encoding: {
            x: { field: "week", type: "ordinal", title: "Week", axis: { labelAngle: -35 } },
            y: { field: "trimp", type: "quantitative", title: "TRIMP" },
            tooltip: [
              { field: "week", type: "nominal", title: "Week" },
              { field: "trimp", type: "quantitative", title: "TRIMP", format: ".0f" },
            ],
          },
        },
      };
    }
    case "weekly_hrv": {
      const { hrv } = await buildWeekly(12);
      return {
        kind,
        title: "Weekly HRV (ms)",
        spec: {
          ...BASE,
          title: "Weekly average HRV",
          data: {
            values: hrv
              .filter((h) => h.avg_hrv != null)
              .map((h) => ({
                week: h.week_start,
                hrv: h.avg_hrv,
              })),
          },
          mark: { type: "area", line: true, color: "#3d7ea6", opacity: 0.35 },
          encoding: {
            x: { field: "week", type: "ordinal", title: "Week", axis: { labelAngle: -35 } },
            y: { field: "hrv", type: "quantitative", title: "HRV (ms)" },
            tooltip: [
              { field: "week", type: "nominal", title: "Week" },
              { field: "hrv", type: "quantitative", title: "HRV", format: ".0f" },
            ],
          },
        },
      };
    }
    case "acr_trimp": {
      const { trimp } = await buildAcr(12);
      return {
        kind,
        title: "TRIMP acute:chronic ratio",
        spec: {
          ...BASE,
          title: "TRIMP ACR",
          data: {
            values: trimp
              .filter((p) => p.acr != null)
              .map((p) => ({
                date: p.date,
                acr: p.acr,
                zone: p.zone,
              })),
          },
          layer: [
            {
              mark: { type: "rule", color: "#94a3b8", strokeDash: [4, 4] },
              encoding: { y: { datum: 1.0 } },
            },
            {
              mark: { type: "line", point: true, color: "#6b4f9a", strokeWidth: 2 },
              encoding: {
                x: { field: "date", type: "temporal", title: "Date" },
                y: { field: "acr", type: "quantitative", title: "ACR" },
                tooltip: [
                  { field: "date", type: "temporal", title: "Date" },
                  { field: "acr", type: "quantitative", title: "ACR", format: ".2f" },
                  { field: "zone", type: "nominal", title: "Zone" },
                ],
              },
            },
          ],
        },
      };
    }
  }
}
