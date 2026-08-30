import type { OverviewPayload } from "@/lib/loadMath";
import { formatPace, zoneColor, zoneLabel } from "@/lib/loadMath";

function deltaClass(pct: number | null): string {
  if (pct == null) return "";
  if (pct > 5) return "positive";
  if (pct < -5) return "negative";
  return "";
}

export function KpiRow({ overview }: { overview: OverviewPayload }) {
  const wow = overview.wow_distance_pct;
  return (
    <>
      <p className="insight">
        <strong>This week:</strong> {overview.alignment}
        {overview.forecast_next_week_km != null
          ? ` · Next week target ≈ ${overview.forecast_next_week_km} km / TRIMP ${overview.forecast_next_week_trimp ?? "—"}`
          : ""}
      </p>
      <div className="kpi-grid">
        <div className="kpi primary">
          <div className="label">Distance this week</div>
          <div className="value">{overview.distance_km} km</div>
          <div className="sub">
            {overview.sessions} sessions
            {wow != null ? (
              <span className={`kpi-delta ${deltaClass(wow)}`}>
                {" "}
                · {wow > 0 ? "+" : ""}
                {wow}% vs prior week
              </span>
            ) : null}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Training load (TRIMP)</div>
          <div className="value">{overview.trimp}</div>
          <div className="sub">Heart-rate effort score</div>
        </div>
        <div className="kpi">
          <div className="label">Avg pace</div>
          <div className="value">
            {formatPace(overview.avg_pace_min_per_km)}
          </div>
          <div className="sub">min / km</div>
        </div>
        <div className="kpi">
          <div className="label">Avg heart rate</div>
          <div className="value">
            {overview.avg_hr != null ? Math.round(overview.avg_hr) : "—"}
          </div>
          <div className="sub">bpm</div>
        </div>
        <div className="kpi">
          <div className="label">Elevation this week</div>
          <div className="value">{Math.round(overview.elevation_gain_m)}</div>
          <div className="sub">metres climb</div>
        </div>
        <div className="kpi">
          <div className="label">Longest run (28d)</div>
          <div className="value">
            {overview.longest_run_28d_km != null
              ? `${overview.longest_run_28d_km}`
              : "—"}
          </div>
          <div className="sub">km</div>
        </div>
        <div
          className="kpi"
          style={{ borderColor: zoneColor(overview.acr_km_zone) }}
        >
          <div className="label">Mileage load level</div>
          <div
            className="value"
            style={{ color: zoneColor(overview.acr_km_zone) }}
          >
            {overview.acr_km != null ? overview.acr_km.toFixed(2) : "n/a"}
          </div>
          <div className="sub">{zoneLabel(overview.acr_km_zone)}</div>
        </div>
        <div
          className="kpi"
          style={{ borderColor: zoneColor(overview.acr_trimp_zone) }}
        >
          <div className="label">Effort load level</div>
          <div
            className="value"
            style={{ color: zoneColor(overview.acr_trimp_zone) }}
          >
            {overview.acr_trimp != null
              ? overview.acr_trimp.toFixed(2)
              : "n/a"}
          </div>
          <div className="sub">{zoneLabel(overview.acr_trimp_zone)}</div>
        </div>
      </div>

      <section className="panel recovery-strip">
        <h2>Recovery snapshot</h2>
        <p className="note">
          From latest Garmin daily / sleep enrichment
          {overview.recovery.date ? ` (${overview.recovery.date})` : ""}. Key
          readiness signals used by apps like{" "}
          <a href="https://spikesapp.com/" target="_blank" rel="noreferrer">
            Spikes
          </a>{" "}
          and{" "}
          <a href="https://kulg.io/features" target="_blank" rel="noreferrer">
            KULG
          </a>
          .
        </p>
        <div className="kpi-grid">
          <div className="kpi">
            <div className="label">Resting HR</div>
            <div className="value">
              {overview.recovery.resting_hr ?? "—"}
            </div>
            <div className="sub">bpm</div>
          </div>
          <div className="kpi">
            <div className="label">Body Battery</div>
            <div className="value">
              {overview.recovery.body_battery_high != null
                ? `${overview.recovery.body_battery_low ?? "?"}–${overview.recovery.body_battery_high}`
                : "—"}
            </div>
            <div className="sub">low–high</div>
          </div>
          <div className="kpi">
            <div className="label">Sleep</div>
            <div className="value">
              {overview.recovery.sleep_hours != null
                ? `${overview.recovery.sleep_hours}h`
                : "—"}
            </div>
            <div className="sub">
              score {overview.recovery.sleep_score ?? "—"}
            </div>
          </div>
          <div className="kpi">
            <div className="label">Recovery score</div>
            <div className="value">
              {overview.recovery.recovery_score ?? "—"}
            </div>
            <div className="sub">
              stress avg {overview.recovery.avg_stress ?? "—"}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
