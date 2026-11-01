"use client";

import { useCallback, useState } from "react";
import type { ActivityAnalysis } from "@/lib/activityAnalysis";
import type { ActivityRow } from "@/lib/loadMath";
import { formatPace, sessionPace } from "@/lib/loadMath";
import { ActivityAnalysisPanel } from "./ActivityAnalysisPanel";

function fmt(n: number | null | undefined, digits = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function ActivityTable({ activities }: { activities: ActivityRow[] }) {
  const [analysis, setAnalysis] = useState<ActivityAnalysis | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openAnalysis = useCallback(async (id: string) => {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/activity/${encodeURIComponent(id)}/analysis`,
      );
      const data = (await res.json()) as ActivityAnalysis & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not open analysis (${res.status})`);
        setAnalysis(null);
        return;
      }
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setAnalysis(null);
    } finally {
      setLoadingId(null);
    }
  }, []);

  return (
    <section className="panel space-y-4">
      <h2>Recent activities</h2>
      <p className="note">
        Click a row for deeper analysis and a Story card download — no coding
        required.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {analysis ? (
        <ActivityAnalysisPanel
          analysis={analysis}
          onClose={() => setAnalysis(null)}
        />
      ) : null}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Sport</th>
              <th>km</th>
              <th>Pace</th>
              <th>HR</th>
              <th>TRIMP</th>
              <th>min</th>
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  No activities yet. Use <strong>Live sync</strong> or{" "}
                  <strong>Manual import</strong>, then Resync.
                </td>
              </tr>
            ) : (
              activities.map((a, i) => {
                const id = a.activity_id;
                const clickable = Boolean(id);
                return (
                  <tr
                    key={id ?? `${a.date}-${i}`}
                    className={
                      clickable
                        ? "cursor-pointer hover:bg-muted/40"
                        : undefined
                    }
                    onClick={() => {
                      if (id) void openAnalysis(id);
                    }}
                    onKeyDown={(e) => {
                      if (!id) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openAnalysis(id);
                      }
                    }}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={
                      clickable
                        ? `Open analysis for ${a.sport ?? "activity"} on ${a.date ?? ""}`
                        : undefined
                    }
                  >
                    <td>
                      {a.date ?? "—"}
                      {loadingId === id ? " …" : ""}
                    </td>
                    <td>{a.sport ?? "—"}</td>
                    <td>{fmt(a.distance_km)}</td>
                    <td>{formatPace(sessionPace(a))}</td>
                    <td>{fmt(a.avg_hr, 0)}</td>
                    <td>{fmt(a.trimp ?? a.load_score)}</td>
                    <td>{fmt(a.duration_min, 0)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
