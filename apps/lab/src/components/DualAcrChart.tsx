"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AcrPoint } from "@/lib/loadMath";

export function DualAcrChart({
  km,
  trimp,
  alignment,
}: {
  km: AcrPoint[];
  trimp: AcrPoint[];
  alignment: string;
}) {
  const data = km.map((p, i) => ({
    date: p.date.slice(5),
    mileage_level: p.acr,
    effort_level: trimp[i]?.acr ?? null,
  }));

  return (
    <section className="panel">
      <h2>Load level over time (Acute:Chronic)</h2>
      <p className="note">
        Compares the last 7 days to your recent 4-week average. Green band
        (0.8–1.3) is generally sustainable. {alignment}
      </p>
      <div className="legend">
        <span style={{ background: "#1a1a1a" }}>Mileage level</span>
        <span style={{ background: "#2c5282" }}>Effort level</span>
        <span style={{ background: "#2f7d4a" }}>Sweet spot</span>
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <ReferenceArea y1={0} y2={0.8} fill="#5b7c99" fillOpacity={0.16} />
            <ReferenceArea y1={0.8} y2={1.3} fill="#2f7d4a" fillOpacity={0.2} />
            <ReferenceArea y1={1.3} y2={1.5} fill="#c47f17" fillOpacity={0.2} />
            <ReferenceArea y1={1.5} y2={2.2} fill="#b33a3a" fillOpacity={0.16} />
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis domain={[0, 2.2]} tick={{ fontSize: 11 }} width={36} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="mileage_level"
              name="Mileage level"
              stroke="#1a1a1a"
              strokeWidth={2.2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="effort_level"
              name="Effort level"
              stroke="#2c5282"
              strokeWidth={2.2}
              strokeDasharray="6 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
