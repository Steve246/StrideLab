import type { ReactNode } from "react";
import type { OverviewPayload } from "@/lib/loadMath";
import { formatPace, zoneColor, zoneLabel } from "@/lib/loadMath";
import { Badge } from "@/components/ui/badge";
import { LabPanel } from "./LabPanel";

function deltaLabel(pct: number | null): string | null {
  if (pct == null) return null;
  return `${pct > 0 ? "+" : ""}${pct}% vs prior week`;
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="min-w-0 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-0.5 text-xl font-medium tracking-tight tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

/** Load tab: training metrics + detailed recovery snapshot. */
export function KpiRow({ overview }: { overview: OverviewPayload }) {
  const wow = overview.wow_distance_pct;
  const wowText = deltaLabel(wow);
  const r = overview.recovery;

  return (
    <div className="mb-4 space-y-4">
      <section className="border border-border/80 bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium tracking-tight">This week</h2>
          {wowText ? (
            <Badge variant="secondary" className="rounded-none font-normal">
              {wowText}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{overview.alignment}</p>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            label="Distance"
            value={`${overview.distance_km} km`}
            sub={`${overview.sessions} sessions`}
          />
          <Stat label="TRIMP" value={overview.trimp} sub="Heart-rate load" />
          <Stat
            label="Avg pace"
            value={formatPace(overview.avg_pace_min_per_km)}
            sub="min / km"
          />
          <Stat
            label="Avg HR"
            value={overview.avg_hr != null ? Math.round(overview.avg_hr) : "—"}
            sub="bpm"
          />
          <Stat
            label="Elevation"
            value={`${Math.round(overview.elevation_gain_m)} m`}
          />
          <Stat
            label="Longest (28d)"
            value={
              overview.longest_run_28d_km != null
                ? `${overview.longest_run_28d_km} km`
                : "—"
            }
          />
          <Stat
            label="Mileage ACR"
            value={overview.acr_km != null ? overview.acr_km.toFixed(2) : "n/a"}
            sub={zoneLabel(overview.acr_km_zone)}
            accent={zoneColor(overview.acr_km_zone)}
          />
          <Stat
            label="Effort ACR"
            value={
              overview.acr_trimp != null
                ? overview.acr_trimp.toFixed(2)
                : "n/a"
            }
            sub={zoneLabel(overview.acr_trimp_zone)}
            accent={zoneColor(overview.acr_trimp_zone)}
          />
          {overview.efficiency_trimp_per_km != null ? (
            <Stat
              label="Efficiency"
              value={overview.efficiency_trimp_per_km.toFixed(1)}
              sub="TRIMP / km"
            />
          ) : null}
          {overview.forecast_next_week_km != null ? (
            <Stat
              label="Next week target"
              value={`${overview.forecast_next_week_km} km`}
              sub={`TRIMP ${overview.forecast_next_week_trimp ?? "—"}`}
            />
          ) : null}
        </div>
      </section>

      <LabPanel
        title="Recovery snapshot"
        description={
          r.date
            ? `Garmin daily / sleep enrichment for ${r.date}`
            : "Garmin daily / sleep enrichment (latest available day)"
        }
        contentClassName="!px-4 pt-3"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Resting HR" value={r.resting_hr ?? "—"} sub="bpm" />
          <Stat
            label="Body Battery"
            value={
              r.body_battery_high != null
                ? `${r.body_battery_low ?? "?"}–${r.body_battery_high}`
                : "—"
            }
            sub="low–high range"
          />
          <Stat
            label="Sleep duration"
            value={r.sleep_hours != null ? `${r.sleep_hours} h` : "—"}
            sub={`score ${r.sleep_score ?? "—"}`}
          />
          <Stat
            label="Recovery score"
            value={r.recovery_score ?? "—"}
            sub={`stress avg ${r.avg_stress ?? "—"}`}
          />
          <Stat
            label="Sleep score"
            value={r.sleep_score ?? "—"}
            sub="Garmin overnight"
          />
          <Stat
            label="Avg stress"
            value={r.avg_stress ?? "—"}
            sub="daily average"
          />
          <Stat
            label="Body battery high"
            value={r.body_battery_high ?? "—"}
            sub="peak charge"
          />
          <Stat
            label="Body battery low"
            value={r.body_battery_low ?? "—"}
            sub="trough"
          />
        </div>
        <p className="mt-4 max-w-[60ch] text-xs text-muted-foreground">
          Pair recovery with ACR on the ACR tab: high acute load plus poor sleep
          / high stress is a stronger caution signal than either alone.
        </p>
      </LabPanel>
    </div>
  );
}
