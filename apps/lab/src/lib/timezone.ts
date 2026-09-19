/**
 * Athlete-local calendar helpers for day bucketing / timelines.
 * Garmin activity timestamps are UTC; sleep enrichment uses calendarDate (local day).
 */

export function athleteTimeZone(): string {
  return (
    process.env.ATHLETE_TIMEZONE?.trim() ||
    process.env.TZ?.trim() ||
    "Asia/Jakarta"
  );
}

/** YYYY-MM-DD in athlete timezone. */
export function localDayKey(isoOrDate: string | Date, timeZone = athleteTimeZone()): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

/** Minutes from local midnight (0–1439). */
export function localMinutesFromMidnight(
  iso: string,
  timeZone = athleteTimeZone(),
): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Format HH:MM in athlete TZ. */
export function localClock(iso: string, timeZone = athleteTimeZone()): string {
  const mins = localMinutesFromMidnight(iso, timeZone);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
