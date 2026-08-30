import type { ActivityRow } from "@/lib/loadMath";
import { formatPace, sessionPace } from "@/lib/loadMath";

function fmt(n: number | null | undefined, digits = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function ActivityTable({ activities }: { activities: ActivityRow[] }) {
  return (
    <section className="panel">
      <h2>Recent activities</h2>
      <p className="note">From last Garmin resync — no AI on this table.</p>
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
                  No activities yet. Sync Garmin in Anvia Studio (
                  <code>pnpm agent-studio</code>).
                </td>
              </tr>
            ) : (
              activities.map((a, i) => (
                <tr key={a.activity_id ?? `${a.date}-${i}`}>
                  <td>{a.date ?? "—"}</td>
                  <td>{a.sport ?? "—"}</td>
                  <td>{fmt(a.distance_km)}</td>
                  <td>{formatPace(sessionPace(a))}</td>
                  <td>{fmt(a.avg_hr, 0)}</td>
                  <td>{fmt(a.trimp ?? a.load_score)}</td>
                  <td>{fmt(a.duration_min, 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
