"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastWeek, HrvWeek, WeekBucket } from "@/lib/loadMath";
import { formatPace } from "@/lib/loadMath";

function weekLabel(iso: string): string {
  return iso.slice(5);
}

export function WeeklyMileageLoad({
  weeks,
  forecast,
  hrv = [],
}: {
  weeks: WeekBucket[];
  forecast: ForecastWeek[];
  hrv?: HrvWeek[];
}) {
  const rows = weeks.map((w) => ({
    week: weekLabel(w.week_start),
    km: w.distance_km,
    trimp: w.trimp,
    elev: w.elevation_gain_m,
    pace: w.avg_pace_min_per_km,
    hr: w.avg_hr,
    paceLabel: formatPace(w.avg_pace_min_per_km),
  }));

  const maxKm = Math.max(...weeks.map((w) => w.distance_km), 1);
  const maxTrimp = Math.max(...weeks.map((w) => w.trimp), 1);
  const effortShape = weeks.map((w) => ({
    week: weekLabel(w.week_start),
    distance_shape: Math.round((w.distance_km / maxKm) * 1000) / 10,
    effort_shape: Math.round((w.trimp / maxTrimp) * 1000) / 10,
  }));

  // Last 8 history weeks + forecast — avoid null-stack Area bugs in Recharts.
  const history = forecast.filter((f) => f.kind === "history");
  const future = forecast.filter((f) => f.kind === "forecast");
  const histTail = history.slice(-8);
  const lastHist = histTail[histTail.length - 1];

  const loadForecast = [
    ...histTail.map((f) => ({
      week: weekLabel(f.week_start),
      kind: "history" as const,
      actual: f.trimp ?? 0,
      expected: null as number | null,
      low: null as number | null,
      high: null as number | null,
    })),
    // Bridge point so forecast line connects from last actual
    ...(lastHist
      ? [
          {
            week: `${weekLabel(lastHist.week_start)}→`,
            kind: "bridge" as const,
            actual: lastHist.trimp ?? 0,
            expected: lastHist.trimp ?? 0,
            low: lastHist.trimp ?? 0,
            high: lastHist.trimp ?? 0,
          },
        ]
      : []),
    ...future.map((f) => ({
      week: `F ${weekLabel(f.week_start)}`,
      kind: "forecast" as const,
      actual: null as number | null,
      expected: f.expected_trimp,
      low: f.conservative_trimp,
      high: f.aggressive_trimp,
    })),
  ];

  const yMax = Math.max(
    ...loadForecast.flatMap((r) =>
      [r.actual, r.expected, r.high].filter((n): n is number => n != null),
    ),
    1,
  );

  const hrvRows = hrv.map((h) => ({
    week: weekLabel(h.week_start),
    avg: h.avg_hrv,
    min: h.min_hrv,
    max: h.max_hrv,
    inRange: h.pct_in_range,
  }));

  return (
    <div className="chart-grid">
      <section className="panel half">
        <h2>Weekly distance</h2>
        <p className="note">How many kilometres you ran each week.</p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={(v: number) => [`${v} km`, "Distance"]} />
              <Bar dataKey="km" name="km" fill="#1d6f5a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel half">
        <h2>Weekly training load</h2>
        <p className="note">
          TRIMP = how hard the week felt for your heart (not the same as km).
        </p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v: number) => [v, "TRIMP"]} />
              <Bar dataKey="trimp" name="TRIMP" fill="#2c5282" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel half">
        <h2>Weekly average pace</h2>
        <p className="note">Lower line = faster. Pace in minutes per kilometre.</p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={40}
                reversed
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(v: number) => [formatPace(v), "Pace"]}
              />
              <Line
                type="monotone"
                dataKey="pace"
                name="Pace"
                stroke="#0d9488"
                strokeWidth={2.2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel half">
        <h2>Weekly average HR</h2>
        <p className="note">Average heart rate across sessions that recorded HR.</p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => [`${v} bpm`, "HR"]} />
              <Line
                type="monotone"
                dataKey="hr"
                name="Avg HR"
                stroke="#b45309"
                strokeWidth={2.2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel half">
        <h2>Weekly elevation</h2>
        <p className="note">Total climb per week in metres.</p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v: number) => [`${v} m`, "Elevation"]} />
              <Bar
                dataKey="elev"
                name="Elevation m"
                fill="#78716c"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel half">
        <h2>Effort vs distance shape</h2>
        <p className="note">
          Both scaled 0–100 so you can see when effort rises faster than mileage.
        </p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart
              data={effortShape}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="distance_shape"
                name="Distance shape %"
                stroke="#1d6f5a"
                strokeWidth={2.2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="effort_shape"
                name="Effort shape %"
                stroke="#2c5282"
                strokeWidth={2.2}
                strokeDasharray="6 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel half">
        <h2>Weekly HRV</h2>
        <p className="note">
          Garmin overnight HRV (ms) from health status — higher is generally
          better recovery. Dashed = % of days in Garmin&apos;s baseline range.
        </p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <ComposedChart
              data={hrvRows}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="hrv"
                tick={{ fontSize: 11 }}
                width={36}
                domain={["auto", "auto"]}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 11 }}
                width={36}
                domain={[0, 100]}
              />
              <Tooltip />
              <Legend />
              <Bar
                yAxisId="hrv"
                dataKey="avg"
                name="Avg HRV"
                fill="#0f766e"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="inRange"
                name="% in range"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <h2>Load forecast (next 4 weeks)</h2>
        <p className="note">
          EWMA of completed weeks (TrainingPeaks-style chronic load proxy), then
          project maintenance TRIMP with a −10% / +ramp band. Not a medical
          prediction — a planning guide. Labels marked <strong>F</strong> are
          forecast weeks.
        </p>
        <div className="legend">
          <span style={{ background: "#2c5282" }}>Actual TRIMP</span>
          <span style={{ background: "#ff9500" }}>Expected forecast</span>
          <span style={{ background: "#fdba74" }}>Conservative–aggressive</span>
        </div>
        {future.length === 0 ||
        future.every((f) => (f.expected_trimp ?? 0) === 0) ? (
          <p className="note">
            No forecast yet — need TRIMP history from synced activities.
          </p>
        ) : (
          <ul className="forecast-kpis">
            {future.map((f) => (
              <li key={f.week_start}>
                <span>{weekLabel(f.week_start)}</span>
                <strong>{f.expected_trimp ?? "—"}</strong>
                <em>
                  {f.conservative_trimp ?? "—"}–{f.aggressive_trimp ?? "—"} ·{" "}
                  {f.expected_km ?? "—"} km
                </em>
              </li>
            ))}
          </ul>
        )}
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart
              data={loadForecast}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={44}
                domain={[0, Math.ceil(yMax * 1.15)]}
              />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="high"
                name="Aggressive"
                stroke="#fdba74"
                strokeWidth={1.5}
                strokeDasharray="2 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="low"
                name="Conservative"
                stroke="#fdba74"
                strokeWidth={1.5}
                strokeDasharray="2 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual TRIMP"
                stroke="#2c5282"
                strokeWidth={2.6}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="expected"
                name="Expected forecast"
                stroke="#ff9500"
                strokeWidth={2.4}
                strokeDasharray="6 4"
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
