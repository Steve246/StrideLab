"use client";

import { RotateCcw } from "lucide-react";
import type {
  DashboardLayout,
  DashboardWidgetId,
} from "@/lib/dashboardLayoutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LabPanel } from "./LabPanel";

const LABELS: Record<DashboardWidgetId, string> = {
  kpis: "KPIs",
  weekly: "Weekly load",
  acr: "ACR",
  vega: "Custom chart",
  daily_analyzer: "Daily analyzer",
  your_best: "Your best",
  activities: "Activities",
};

type Props = {
  layout: DashboardLayout;
  busy?: boolean;
  onReset?: () => void;
};

export function DashboardLayoutBar({ layout, busy, onReset }: Props) {
  const customized =
    layout.updated_at && layout.updated_at !== new Date(0).toISOString();

  return (
    <LabPanel
      title="Dashboard layout"
      description="Panels below follow this order. Ask the coach to rearrange or add a custom Vega chart."
      action={
        onReset ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={busy}
            onClick={onReset}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        {layout.widgets.map((id, i) => (
          <Badge key={id} variant="secondary" className="rounded-none">
            {i + 1}. {LABELS[id] ?? id}
          </Badge>
        ))}
        {layout.vega_kind ? (
          <Badge className="rounded-none">Vega · {layout.vega_kind}</Badge>
        ) : (
          <Badge variant="outline" className="rounded-none">
            No custom Vega chart yet
          </Badge>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {customized
          ? `Saved ${new Date(layout.updated_at).toLocaleString()}`
          : "Using default layout"}
        {busy ? " · updating…" : ""}
      </p>
    </LabPanel>
  );
}
