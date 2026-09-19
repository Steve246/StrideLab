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
import { zoneColor, zoneLabel, type LoadZone } from "@/lib/loadMath";
import { Badge } from "@/components/ui/badge";
import { LabPanel } from "./LabPanel";

function zoneAdvice(zone: LoadZone): string {
  switch (zone) {
    case "undertraining":
      return "Below typical loading — useful for deload / return-to-run, but chronic fitness may drift down if prolonged.";
    case "optimal":
      return "Inside the commonly cited monitoring band (~0.8–1.3). Sustainable progression when recovery looks fine.";
    case "caution":
      return "Elevated acute vs chronic — watch sleep, soreness, and upcoming hard sessions.";
    case "high_risk":
      return "Large spike vs recent fitness (≥~1.5 in many frameworks). Prefer easy volume or rest until chronic catches up.";
    default:
      return "Not enough history to classify the zone yet.";
  }
}

function Snapshot({
  title,
  point,
}: {
  title: string;
  point: AcrPoint | null;
}) {
  if (!point) {
    return (
      <div className="border border-border/80 p-3">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">No ACR series yet.</p>
      </div>
    );
  }
  return (
    <div className="border border-border/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <Badge
          variant="outline"
          className="rounded-none font-normal"
          style={{ borderColor: zoneColor(point.zone) }}
        >
          {zoneLabel(point.zone)}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Acute (7d)</div>
          <div className="text-lg font-medium tabular-nums">
            {Math.round(point.acute)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Chronic (≈28d)</div>
          <div className="text-lg font-medium tabular-nums">
            {Math.round(point.chronic)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Ratio</div>
          <div
            className="text-lg font-medium tabular-nums"
            style={{ color: zoneColor(point.zone) }}
          >
            {point.acr != null ? point.acr.toFixed(2) : "—"}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{zoneAdvice(point.zone)}</p>
    </div>
  );
}

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
    acute_km: p.acute,
    chronic_km: p.chronic,
  }));

  const curKm = km[km.length - 1] ?? null;
  const curTrimp = trimp[trimp.length - 1] ?? null;
  const prevKm = km.length > 7 ? km[km.length - 8] : null;
  const prevTrimp = trimp.length > 7 ? trimp[trimp.length - 8] : null;

  const delta = (cur: number | null | undefined, prev: number | null | undefined) => {
    if (cur == null || prev == null) return null;
    return cur - prev;
  };
  const dKm = delta(curKm?.acr, prevKm?.acr);
  const dTrimp = delta(curTrimp?.acr, prevTrimp?.acr);

  const recent = [...km].slice(-10).reverse();

  return (
    <div className="space-y-4">
      <LabPanel
        title="Acute:chronic workload ratio"
        description={
          <>
            Acute ≈ last 7 days of load; chronic ≈ recent ~4-week average
            (fitness). Ratio = acute ÷ chronic. Common monitoring band{" "}
            <strong>0.8–1.3</strong>; spikes near/above <strong>1.5</strong> are
            treated cautiously. Use as a flag with recovery — not a diagnosis.{" "}
            {alignment}
          </>
        }
        contentClassName="!px-4 pt-3"
      >
        <div className="mb-3 grid gap-3 lg:grid-cols-2">
          <Snapshot title="Mileage (external)" point={curKm} />
          <Snapshot title="TRIMP (internal)" point={curTrimp} />
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-none font-normal">
            Mileage ACR{" "}
            {dKm != null ? `${dKm >= 0 ? "+" : ""}${dKm.toFixed(2)} vs 7d ago` : "—"}
          </Badge>
          <Badge variant="secondary" className="rounded-none font-normal">
            Effort ACR{" "}
            {dTrimp != null
              ? `${dTrimp >= 0 ? "+" : ""}${dTrimp.toFixed(2)} vs 7d ago`
              : "—"}
          </Badge>
          <Badge className="rounded-none font-normal">Sweet spot 0.8–1.3</Badge>
        </div>

        <div className="h-[280px] w-full">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <ReferenceArea y1={0} y2={0.8} fill="#5b7c99" fillOpacity={0.16} />
              <ReferenceArea y1={0.8} y2={1.3} fill="#2f7d4a" fillOpacity={0.2} />
              <ReferenceArea y1={1.3} y2={1.5} fill="#c47f17" fillOpacity={0.2} />
              <ReferenceArea y1={1.5} y2={2.2} fill="#b33a3a" fillOpacity={0.16} />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis domain={[0, 2.2]} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="mileage_level"
                name="Mileage ACR"
                stroke="#0f172a"
                strokeWidth={2.2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="effort_level"
                name="Effort ACR"
                stroke="#2c5282"
                strokeWidth={2.2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </LabPanel>

      <LabPanel
        title="Acute vs chronic (mileage)"
        description={
          <>
            Couple the ratio with absolute loads — a high ratio on a tiny
            chronic base differs from a high ratio after a strong month. See{" "}
            <a
              href="https://support.catapultsports.com/hc/en-us/articles/360000538795-How-to-Set-Up-an-Acute-Chronic-Workload-Ratio-Chart"
              target="_blank"
              rel="noreferrer"
            >
              Catapult ACWR chart guidance
            </a>
            .
          </>
        }
        contentClassName="!px-4 pt-3"
      >
        <div className="h-[220px] w-full">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="acute_km"
                name="Acute km load"
                stroke="#21918c"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="chronic_km"
                name="Chronic km load"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </LabPanel>

      <LabPanel
        title="Recent daily ACR (mileage)"
        description="Last 10 points — scan for sudden jumps rather than single noisy days."
        contentClassName="!px-0 pt-0"
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Acute</th>
                <th>Chronic</th>
                <th>ACR</th>
                <th>Zone</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td className="tabular-nums">{Math.round(p.acute)}</td>
                  <td className="tabular-nums">{Math.round(p.chronic)}</td>
                  <td className="tabular-nums">
                    {p.acr != null ? p.acr.toFixed(2) : "—"}
                  </td>
                  <td style={{ color: zoneColor(p.zone) }}>
                    {zoneLabel(p.zone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 px-4 pb-3 text-xs text-muted-foreground">
          Literature note: ACWR is popular for monitoring (
          <a
            href="https://www.scienceforsport.com/acutechronic-workload-ratio/"
            target="_blank"
            rel="noreferrer"
          >
            Science for Sport
          </a>
          ) but causal claims are debated — treat spikes as prompts to check
          recovery and plan, not automatic injury predictions.
        </p>
      </LabPanel>
    </div>
  );
}
