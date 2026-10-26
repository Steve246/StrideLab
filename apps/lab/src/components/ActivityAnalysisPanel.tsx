"use client";

import type { ActivityAnalysis } from "@/lib/activityAnalysis";
import { formatPace } from "@/lib/loadMath";
import { Button } from "@/components/ui/button";
import { LabPanel } from "./LabPanel";
import { RouteMap } from "./RouteMap";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

function dayLabel(iso: string | null) {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  return day.length === 10 ? day : iso;
}

export function ActivityAnalysisPanel({
  analysis,
  onClose,
}: {
  analysis: ActivityAnalysis;
  onClose?: () => void;
}) {
  const h = analysis.header;

  return (
    <LabPanel
      title="Activity analysis"
      description={analysis.intent_reason}
      contentClassName="!px-4 pt-3"
      action={
        onClose ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null
      }
    >
      <RouteMap points={analysis.track ?? []} />

      <div className="mt-4 border border-border/80 px-3 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Effort load
        </div>
        <p className="mt-1 text-sm">{analysis.effort.sentence}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="TRIMP"
            value={analysis.effort.trimp != null ? String(Math.round(analysis.effort.trimp)) : "—"}
          />
          <Stat
            label="TRIMP / km"
            value={analysis.effort.per_km != null ? String(analysis.effort.per_km) : "—"}
          />
          <Stat
            label="Aerobic TE"
            value={analysis.effort.aerobic_te != null ? String(analysis.effort.aerobic_te) : "—"}
          />
          <Stat
            label="Anaerobic TE"
            value={analysis.effort.anaerobic_te != null ? String(analysis.effort.anaerobic_te) : "—"}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sport" value={h.sport ?? "—"} />
        <Stat label="Date" value={dayLabel(h.date)} />
        <Stat label="Distance" value={h.distance_km != null ? `${h.distance_km} km` : "—"} />
        <Stat
          label="Pace"
          value={h.pace_min_per_km != null ? `${formatPace(h.pace_min_per_km)} /km` : "—"}
        />
        <Stat
          label="Duration"
          value={h.duration_min != null ? `${Math.round(h.duration_min)} min` : "—"}
        />
        <Stat label="Avg HR" value={h.avg_hr != null ? `${Math.round(h.avg_hr)}` : "—"} />
        <Stat label="Intent" value={analysis.intent} />
      </div>

      {analysis.signals.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {analysis.signals.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-sm text-muted-foreground">
        {analysis.comparison.detail}
        {analysis.comparison.vs_avg_pace ? ` ${analysis.comparison.vs_avg_pace}.` : ""}
      </p>
      {analysis.takeaways.length ? (
        <ul className="mt-2 list-inside list-disc text-sm">
          {analysis.takeaways.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
    </LabPanel>
  );
}
