"use client";

import { useEffect, useRef, useState } from "react";
import type { VegaChartKind } from "@/lib/dashboardLayoutShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { LabPanel } from "./LabPanel";

type Props = {
  kind: VegaChartKind | null;
  spec: Record<string, unknown> | null;
};

const KIND_LABEL: Record<VegaChartKind, string> = {
  weekly_distance: "Weekly distance",
  weekly_trimp: "Weekly TRIMP",
  weekly_hrv: "Weekly HRV",
  acr_trimp: "TRIMP ACR",
};

export function VegaChartPanel({ kind, spec }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!spec || !hostRef.current) return;
    let cancelled = false;
    let result: { finalize?: () => void } | null = null;

    setError(null);
    setReady(false);

    void (async () => {
      try {
        const vegaEmbed = (await import("vega-embed")).default;
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";
        result = await vegaEmbed(hostRef.current, spec as never, {
          actions: false,
          renderer: "svg",
          theme: "quartz",
        });
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        result?.finalize?.();
      } catch {
        /* ignore */
      }
    };
  }, [spec]);

  if (!spec || !kind) {
    return (
      <LabPanel
        title="Custom chart"
        description="Coach-driven Vega-Lite panel. Ask: “show weekly HRV as a Vega chart” or “plot TRIMP ACR”."
      />
    );
  }

  return (
    <LabPanel
      title={`Custom chart — ${KIND_LABEL[kind]}`}
      description="Vega-Lite allowlisted view. Core mileage / ACR panels stay on Recharts."
    >
      {error ? (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>Chart failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!ready && !error ? <Skeleton className="mb-3 h-[280px] w-full" /> : null}
      <div className="vega-wrap min-h-8 w-full overflow-x-auto" ref={hostRef} />
    </LabPanel>
  );
}
