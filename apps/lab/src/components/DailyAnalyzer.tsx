"use client";

import { useMemo, useState } from "react";
import type { DailyAnalyzerDay, TimelineSegment } from "@/lib/insights";
import { formatPace, sessionPace } from "@/lib/loadMath";

const SEGMENT_COLORS: Record<TimelineSegment["kind"], string> = {
  activity: "#0d9488",
  sleep_deep: "#1e3a5f",
  sleep_light: "#3b82f6",
  sleep_rem: "#8b5cf6",
  sleep_awake: "#94a3b8",
  idle: "#e2e8f0",
};

function fmtClock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function Track({
  segments,
  emptyLabel,
}: {
  segments: TimelineSegment[];
  emptyLabel: string;
}) {
  if (segments.length === 0) {
    return <p className="da-sub">{emptyLabel}</p>;
  }
  return (
    <div className="da-timeline">
      <div className="da-track">
        {segments.map((seg, i) => {
          const left = (seg.start_min / (24 * 60)) * 100;
          const width = Math.max(
            0.5,
            ((seg.end_min - seg.start_min) / (24 * 60)) * 100,
          );
          return (
            <div
              key={`${seg.kind}-${i}-${seg.start_min}`}
              className="da-seg"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: SEGMENT_COLORS[seg.kind],
              }}
              title={`${seg.label} · ${fmtClock(seg.start_min)}–${fmtClock(seg.end_min)}`}
            />
          );
        })}
      </div>
      <div className="da-hours">
        {["00", "06", "12", "18", "24"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </div>
  );
}

export function DailyAnalyzer({ days }: { days: DailyAnalyzerDay[] }) {
  const defaultIdx = Math.max(0, days.length - 1);
  const [idx, setIdx] = useState(defaultIdx);
  const day = days[idx] ?? days[days.length - 1];

  const sleepParts = useMemo(() => {
    if (!day) return [];
    return [
      {
        label: "Deep",
        hours: day.sleep.deep_hours,
        color: SEGMENT_COLORS.sleep_deep,
      },
      {
        label: "Light",
        hours: day.sleep.light_hours,
        color: SEGMENT_COLORS.sleep_light,
      },
      {
        label: "REM",
        hours: day.sleep.rem_hours,
        color: SEGMENT_COLORS.sleep_rem,
      },
      {
        label: "Awake",
        hours: day.sleep.awake_hours,
        color: SEGMENT_COLORS.sleep_awake,
      },
    ].filter((p) => p.hours != null && p.hours > 0);
  }, [day]);

  if (!day) {
    return (
      <section className="panel">
        <h2>Daily Analyzer</h2>
        <p className="note">No days available yet — sync Garmin data first.</p>
      </section>
    );
  }

  const sleepSegs = day.sleep_segments ?? [];
  const workoutSegs = day.workout_segments ?? [];

  return (
    <section className="panel">
      <h2>Daily Analyzer</h2>
      <p className="note">
        Sleep and workouts on separate tracks. Activity times use{" "}
        {day.time_zone ?? "athlete timezone"} (set{" "}
        <code>ATHLETE_TIMEZONE</code> to change). Sleep stages end near wake /
        first morning activity when onset is not in enrichment.
      </p>

      <div className="da-day-nav">
        <button
          type="button"
          className="btn-ghost"
          disabled={idx <= 0}
          onClick={() => setIdx((v) => Math.max(0, v - 1))}
        >
          ← Prev
        </button>
        <div className="da-day-label">
          <strong>
            {day.weekday} {day.date}
          </strong>
          <span>
            {day.totals.sessions} sessions · {day.totals.distance_km} km · TRIMP{" "}
            {day.totals.trimp}
          </span>
        </div>
        <button
          type="button"
          className="btn-ghost"
          disabled={idx >= days.length - 1}
          onClick={() => setIdx((v) => Math.min(days.length - 1, v + 1))}
        >
          Next →
        </button>
      </div>

      <div className="da-split">
        <div className="da-split-block">
          <div className="da-split-head">
            <h3>Sleep</h3>
            <span>
              {day.sleep.total_hours != null
                ? `${day.sleep.total_hours} h`
                : "—"}
              {day.sleep.bedtime_clock && day.sleep.wake_clock
                ? ` · ${day.sleep.bedtime_clock} → ${day.sleep.wake_clock}`
                : ""}
              {day.sleep.sleep_score != null
                ? ` · score ${day.sleep.sleep_score}`
                : ""}
            </span>
          </div>
          <div className="legend">
            <span style={{ background: SEGMENT_COLORS.sleep_deep }}>Deep</span>
            <span style={{ background: SEGMENT_COLORS.sleep_light }}>Light</span>
            <span style={{ background: SEGMENT_COLORS.sleep_rem }}>REM</span>
            <span style={{ background: SEGMENT_COLORS.sleep_awake }}>Awake</span>
          </div>
          <Track
            segments={sleepSegs}
            emptyLabel="No sleep enrichment for this day."
          />
          <div className="da-sleep-bar">
            {sleepParts.map((p) => {
              const total = sleepParts.reduce((s, x) => s + (x.hours ?? 0), 0);
              const pct = total > 0 ? ((p.hours ?? 0) / total) * 100 : 0;
              return (
                <div
                  key={p.label}
                  style={{ width: `${pct}%`, background: p.color }}
                  title={`${p.label}: ${p.hours} h`}
                />
              );
            })}
          </div>
          <ul className="da-list">
            {sleepParts.map((p) => (
              <li key={p.label}>
                <i style={{ background: p.color }} />
                {p.label}: {p.hours} h
              </li>
            ))}
          </ul>
        </div>

        <div className="da-split-block">
          <div className="da-split-head">
            <h3>Workouts</h3>
            <span>
              {day.totals.sessions} session
              {day.totals.sessions === 1 ? "" : "s"} · {day.totals.distance_km}{" "}
              km
            </span>
          </div>
          <div className="legend">
            <span style={{ background: SEGMENT_COLORS.activity }}>Activity</span>
          </div>
          <Track
            segments={workoutSegs}
            emptyLabel="No workouts this local day."
          />
          {day.activities.length === 0 ? (
            <p className="da-sub">Rest day / no synced activities.</p>
          ) : (
            <ul className="da-act-list">
              {day.activities.map((a) => {
                const seg = workoutSegs.find(
                  (s) => s.activity_id && s.activity_id === a.activity_id,
                );
                return (
                  <li key={a.activity_id ?? `${a.date}-${a.sport}`}>
                    <strong>
                      {seg?.start_clock ?? "—"} · {a.sport ?? "activity"}
                    </strong>
                    <span>
                      {a.distance_km != null ? `${a.distance_km} km` : "—"} ·{" "}
                      {a.duration_min != null
                        ? `${Math.round(a.duration_min)} min`
                        : "—"}
                      {sessionPace(a) != null
                        ? ` · ${formatPace(sessionPace(a))} /km`
                        : ""}
                      {a.avg_hr != null
                        ? ` · ${Math.round(a.avg_hr)} bpm`
                        : ""}
                      {a.trimp != null || a.load_score != null
                        ? ` · TRIMP ${a.trimp ?? a.load_score}`
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="da-grid" style={{ marginTop: "0.85rem" }}>
        <div className="da-card da-card-wide" style={{ gridColumn: "span 12" }}>
          <h3>Recovery / daily</h3>
          <ul className="da-kv da-kv-row">
            <li>
              <span>Resting HR</span>
              <strong>
                {day.daily.resting_hr != null
                  ? `${day.daily.resting_hr} bpm`
                  : "—"}
              </strong>
            </li>
            <li>
              <span>Steps</span>
              <strong>
                {day.daily.steps != null
                  ? day.daily.steps.toLocaleString()
                  : "—"}
              </strong>
            </li>
            <li>
              <span>Avg stress</span>
              <strong>{day.daily.avg_stress ?? "—"}</strong>
            </li>
            <li>
              <span>Body Battery</span>
              <strong>
                {day.daily.body_battery_low != null &&
                day.daily.body_battery_high != null
                  ? `${day.daily.body_battery_low}–${day.daily.body_battery_high}`
                  : "—"}
              </strong>
            </li>
          </ul>
        </div>
      </div>

      <div className="da-week-strip">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            className={`da-chip${i === idx ? " active" : ""}`}
            onClick={() => setIdx(i)}
          >
            <span>{d.weekday}</span>
            <strong>{d.totals.distance_km}k</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
