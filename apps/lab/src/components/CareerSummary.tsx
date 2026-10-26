import type { CareerSummary as Career } from "@/lib/careerSummary";

function Bar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="h-2 bg-muted">
        <span
          className="block h-2 bg-[#1d6f5a]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Spark({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough history yet.</p>;
  }
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = 320;
  const h = 72;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.value - min) / (max - min || 1)) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" role="img">
      <path d={d} fill="none" stroke="#1d6f5a" strokeWidth="2" />
    </svg>
  );
}

/** Lifetime totals, sport mix, RHR/sleep/HRV — from local JSON only. */
export function CareerSummary({ data }: { data: Career }) {
  const monthMax = Math.max(1, ...data.months.map((m) => m.hours));
  const sportMax = Math.max(1, ...data.sports.map((s) => s.hours));

  return (
    <div className="space-y-4">
      <section className="border border-border/80 bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Every workout{data.since ? ` since ${data.since}` : ""}
        </p>
        <p className="mt-2 text-2xl font-medium tracking-tight">
          {data.activities} activities · {data.distance_km} km · {data.hours} h
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.elevation_m.toLocaleString()} m climbing is about {data.everests}{" "}
          Everests.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {data.highlights.map((h) => (
          <article key={h.title} className="border border-border/80 bg-card p-3">
            <div className="text-xs text-muted-foreground">{h.title}</div>
            <div className="mt-1 text-xl font-medium tabular-nums">{h.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{h.detail}</p>
          </article>
        ))}
      </section>

      <section className="border border-border/80 bg-card p-4">
        <h2 className="text-base font-medium">Hours by sport</h2>
        <div className="mt-3 space-y-2">
          {data.sports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sync activities with Live sync or Manual import.
            </p>
          ) : (
            data.sports.map((s) => (
              <Bar key={s.sport} label={s.sport} value={s.hours} max={sportMax} />
            ))
          )}
        </div>
      </section>

      <section className="border border-border/80 bg-card p-4">
        <h2 className="text-base font-medium">Hours per month</h2>
        <div className="mt-3 space-y-2">
          {data.months.map((m) => (
            <Bar key={m.month} label={m.month} value={m.hours} max={monthMax} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="border border-border/80 bg-card p-3">
          <h2 className="text-sm font-medium">Resting HR</h2>
          <p className="text-xs text-muted-foreground">
            Now {data.rhr_now ?? "—"} · earliest {data.rhr_early ?? "—"}
          </p>
          <Spark points={data.rhr} />
        </article>
        <article className="border border-border/80 bg-card p-3">
          <h2 className="text-sm font-medium">Sleep hours</h2>
          <p className="text-xs text-muted-foreground">Last nights with a score/duration</p>
          <Spark points={data.sleep_hours} />
        </article>
        <article className="border border-border/80 bg-card p-3">
          <h2 className="text-sm font-medium">Overnight HRV</h2>
          <p className="text-xs text-muted-foreground">
            Your usual band{" "}
            {data.hrv_low != null && data.hrv_high != null
              ? `${Math.round(data.hrv_low)}–${Math.round(data.hrv_high)}`
              : "—"}
          </p>
          <Spark points={data.hrv} />
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="border border-border/80 bg-card p-3 text-sm">
          <h2 className="font-medium">Lab can read</h2>
          <ul className="mt-2 list-inside list-disc text-muted-foreground">
            {data.reads_only.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
        <article className="border border-border/80 bg-card p-3 text-sm">
          <h2 className="font-medium">Lab cannot do</h2>
          <ul className="mt-2 list-inside list-disc text-muted-foreground">
            {data.cannot.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
