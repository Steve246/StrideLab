"use client";

import {
  Area,
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
import type { ForecastWeek, WeekBucket } from "@/lib/loadMath";
import { formatPace } from "@/lib/loadMath";

function weekLabel(iso: string): string {
  return iso.slice(5);
}

export function WeeklyMileageLoad({
  weeks,
  forecast,
}: {
  weeks: WeekBucket[];
  forecast: ForecastWeek[];
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

  const loadForecast = forecast.map((f) => ({
    week: weekLabel(f.week_start),
    actual: f.kind === "history" ? f.trimp : null,
    expected: f.kind === "forecast" ? f.expected_trimp : null,
    low: f.kind === "forecast" ? f.conservative_trimp : null,
    high: f.kind === "forecast" ? f.aggressive_trimp : null,
    band:
      f.kind === "forecast" &&
      f.conservative_trimp != null &&
      f.aggressive_trimp != null
        ? f.aggressive_trimp - f.conservative_trimp
        : null,
    base: f.kind === "forecast" ? f.conservative_trimp : null,
  }));

  // Bridge last history into forecast for visual continuity
  const lastHist = [...forecast].reverse().find((f) => f.kind === "history");
  const firstFcIdx = loadForecast.findIndex((r) => r.expected != null);
  if (lastHist && firstFcIdx > 0) {
    loadForecast[firstFcIdx - 1] = {
      ...loadForecast[firstFcIdx - 1],
      expected: lastHist.trimp,
      low: lastHist.trimp,
      high: lastHist.trimp,
      base: lastHist.trimp,
      band: 0,
    };
  }

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
                stroke="#c47f17"
                strokeWidth={2.2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel half">
        <h2>Weekly average heart rate</h2>
        <p className="note">Average bpm across sessions that recorded HR.</p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => [`${v} bpm`, "HR"]} />
              <Line
                type="monotone"
                dataKey="hr"
                name="HR"
                stroke="#b33a3a"
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
        <p className="note">
          Climbing load matters for trail/ultra athletes (volume beyond flat
          km).
        </p>
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
                fill="#5b7c99"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <h2>Distance vs effort (same shape scale)</h2>
        <p className="note">
          Both lines are scaled 0–100% of their own max so you can compare{" "}
          <em>shapes</em>. If blue (effort) sits above green (distance), that
          week felt harder than the miles alone.
        </p>
        <div className="legend">
          <span style={{ background: "#1d6f5a" }}>Distance shape</span>
          <span style={{ background: "#2c5282" }}>Effort shape</span>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart
              data={effortShape}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={36} />
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

      <section className="panel">
        <h2>Load forecast (next 4 weeks)</h2>
        <p className="note">
          Solid = actual TRIMP. Dashed orange = expected load from your recent
          4-week average. Shaded band = conservative → aggressive range. Not a
          medical prediction — a planning guide.
        </p>
        <div className="legend">
          <span style={{ background: "#2c5282" }}>Actual TRIMP</span>
          <span style={{ background: "#ff9500" }}>Expected forecast</span>
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart
              data={loadForecast}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="base"
                stackId="band"
                stroke="none"
                fill="transparent"
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="band"
                name="Forecast range"
                stackId="band"
                stroke="none"
                fill="#ff9500"
                fillOpacity={0.2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual TRIMP"
                stroke="#2c5282"
                strokeWidth={2.4}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="expected"
                name="Expected forecast"
                stroke="#ff9500"
                strokeWidth={2.2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
