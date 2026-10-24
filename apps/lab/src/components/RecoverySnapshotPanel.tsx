import type { ReactNode } from "react";
import type { RecoverySnapshot } from "@/lib/loadMath";
import { LabPanel } from "./LabPanel";

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-medium tracking-tight tabular-nums">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

/** Compact recovery KPIs from daily / sleep / HRV enrichment. */
export function RecoverySnapshotPanel({
  recovery,
}: {
  recovery: RecoverySnapshot;
}) {
  const r = recovery;
  const hrvStatus = r.hrv_status
    ? r.hrv_status.replaceAll("_", " ").toLowerCase()
    : null;

  return (
    <LabPanel
      title="Recovery snapshot"
      description={
        r.date
          ? `Latest complete wellness day · ${r.date}`
          : "Garmin daily / sleep / HRV enrichment (latest available day)"
      }
      contentClassName="!px-4 pt-3"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
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
          label="HRV"
          value={r.hrv != null ? Math.round(r.hrv) : "—"}
          sub={hrvStatus ?? "overnight ms"}
        />
        <Stat
          label="Avg stress"
          value={r.avg_stress ?? "—"}
          sub="daily average"
        />
      </div>
      <p className="mt-4 max-w-[60ch] text-xs text-muted-foreground">
        Pair recovery with ACR on the ACR tab: high acute load plus poor sleep /
        high stress is a stronger caution signal than either alone.
      </p>
    </LabPanel>
  );
}
