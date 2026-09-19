import type { BestRecord, YourBestPayload } from "@/lib/insights";
import { Badge } from "@/components/ui/badge";
import { LabPanel } from "./LabPanel";

function RecordCard({ record }: { record: BestRecord }) {
  const hi = record.category === "highlight";
  return (
    <article className={`border border-border/80 p-3 ${hi ? "bg-card" : "bg-muted/30"}`}>
      <Badge
        variant={hi ? "secondary" : "outline"}
        className="rounded-none font-normal"
      >
        {hi ? "Highlight" : "Lowlight"}
      </Badge>
      <h3 className="mt-2 text-sm font-medium tracking-tight">{record.title}</h3>
      <p className="mt-1 text-xl font-medium tabular-nums">{record.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{record.detail}</p>
      {record.date ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          {record.date}
        </p>
      ) : null}
    </article>
  );
}

export function YourBest({ data }: { data: YourBestPayload }) {
  const topSports = [...data.by_sport]
    .sort((a, b) => b.distance_km - a.distance_km)
    .slice(0, 3);
  const totalSessions = data.by_sport.reduce((s, x) => s + x.sessions, 0);
  const totalKm = data.by_sport.reduce((s, x) => s + x.distance_km, 0);

  return (
    <div className="space-y-4">
      <LabPanel
        title="Your best"
        description={`Highlights, lowlights, and PRs across ${data.window_label} (as of ${data.as_of}).`}
        contentClassName="!px-4 pt-3"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Active streak</div>
            <div className="text-2xl font-medium tabular-nums">
              {data.streaks.consecutive_active_days}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                d
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Run streak</div>
            <div className="text-2xl font-medium tabular-nums">
              {data.streaks.consecutive_run_days}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                d
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Best active streak</div>
            <div className="text-2xl font-medium tabular-nums">
              {data.streaks.best_active_streak}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                d
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Synced volume</div>
            <div className="text-2xl font-medium tabular-nums">
              {Math.round(totalKm)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                km
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {totalSessions} sessions · {data.by_sport.length} sports
            </div>
          </div>
        </div>

        {topSports.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {topSports.map((s) => (
              <Badge
                key={s.sport}
                variant="outline"
                className="rounded-none font-normal"
              >
                {s.sport}: {s.distance_km} km · best pace{" "}
                {s.best_pace ?? "—"}
              </Badge>
            ))}
          </div>
        ) : null}
      </LabPanel>

      <LabPanel
        title={`Highlights (${data.highlights.length})`}
        contentClassName="!px-4 pt-3"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.highlights.map((r) => (
            <RecordCard key={r.id} record={r} />
          ))}
          {data.highlights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No highlights yet.</p>
          ) : null}
        </div>
      </LabPanel>

      <LabPanel
        title={`Lowlights (${data.lowlights.length})`}
        description="Useful for spotting recovery debt, easy-day patterns, or sessions that went sideways."
        contentClassName="!px-4 pt-3"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.lowlights.map((r) => (
            <RecordCard key={r.id} record={r} />
          ))}
          {data.lowlights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lowlights yet.</p>
          ) : null}
        </div>
      </LabPanel>

      <LabPanel
        title="By sport"
        description="Session counts, total distance, and personal bests per activity type."
        contentClassName="!px-0 pt-0"
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Sport</th>
                <th>Sessions</th>
                <th>Distance</th>
                <th>Best distance</th>
                <th>Best pace</th>
                <th>PR date</th>
              </tr>
            </thead>
            <tbody>
              {data.by_sport.map((s) => (
                <tr key={s.sport}>
                  <td>{s.sport}</td>
                  <td className="tabular-nums">{s.sessions}</td>
                  <td className="tabular-nums">{s.distance_km} km</td>
                  <td className="tabular-nums">
                    {s.best_distance_km != null
                      ? `${s.best_distance_km} km`
                      : "—"}
                  </td>
                  <td className="tabular-nums">
                    {s.best_pace != null ? `${s.best_pace} /km` : "—"}
                  </td>
                  <td className="font-mono text-xs">
                    {s.best_pace_date ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LabPanel>
    </div>
  );
}
