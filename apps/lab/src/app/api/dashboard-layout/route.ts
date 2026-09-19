import { NextResponse } from "next/server";
import {
  isVegaChartKind,
  normalizeWidgets,
  readDashboardLayout,
  writeDashboardLayout,
  type DashboardLayout,
  type DashboardWidgetId,
} from "@/lib/dashboardLayout";
import { buildVegaSpecForKind } from "@/lib/vegaSpecs";

export const dynamic = "force-dynamic";

export async function GET() {
  const layout = await readDashboardLayout();
  return NextResponse.json(layout);
}

type PatchBody = {
  widgets?: unknown;
  vega_kind?: unknown;
  clear_vega?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const current = await readDashboardLayout();
    let next: DashboardLayout = { ...current };

    if (body.widgets !== undefined) {
      next.widgets = normalizeWidgets(body.widgets);
    }

    if (body.clear_vega) {
      next.vega_kind = null;
      next.vega_spec = null;
      next.widgets = next.widgets.filter((w) => w !== "vega");
    } else if (body.vega_kind != null) {
      if (!isVegaChartKind(body.vega_kind)) {
        return NextResponse.json(
          {
            error: `Invalid vega_kind. Allowlisted: weekly_distance, weekly_trimp, weekly_hrv, acr_trimp`,
          },
          { status: 400 },
        );
      }
      const built = await buildVegaSpecForKind(body.vega_kind);
      next.vega_kind = built.kind;
      next.vega_spec = built.spec;
      if (!next.widgets.includes("vega")) {
        const widgets: DashboardWidgetId[] = [...next.widgets, "vega"];
        next.widgets = widgets;
      }
    }

    next = await writeDashboardLayout(next);
    return NextResponse.json(next);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
