import type { DailyAnalyzerDay } from "./insights";
import type { ActivityRow, OverviewPayload } from "./loadMath";
import { round1 } from "./loadMath";

export type DeeperInsight = {
  id: string;
  title: string;
  value: string;
  baseline: string | null;
  sentence: string;
  tone: "good" | "watch" | "caution" | "neutral";
  glossary_ids?: string[];
};

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function isEasy(a: ActivityRow): boolean {
  const te = a.aerobic_te;
  const ana =
    typeof (a as { anaerobic_te?: number | null }).anaerobic_te === "number"
      ? (a as { anaerobic_te?: number }).anaerobic_te
      : null;
  if (typeof ana === "number" && ana >= 2.5) return false;
  if (typeof te === "number" && te <= 2.5) return true;
  const pace = a.avg_pace_min_per_km;
  if (pace != null && pace >= 5.8) return true;
  return false;
}

/** Deterministic Overview deeper cards from data we already sync. */
export function buildDeeperInsights(opts: {
  overview: OverviewPayload;
  activities: ActivityRow[];
  dailyDays: DailyAnalyzerDay[];
  asOf: Date;
}): DeeperInsight[] {
  const { overview, activities, dailyDays } = opts;
  const out: DeeperInsight[] = [];
  const asOfMs = opts.asOf.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const last28 = activities.filter((a) => {
    const t = Date.parse(a.date ?? "");
    return !Number.isNaN(t) && t <= asOfMs && t >= asOfMs - 28 * dayMs;
  });
  const last7 = last28.filter((a) => {
    const t = Date.parse(a.date ?? "");
    return t >= asOfMs - 7 * dayMs;
  });

  // Load vs recovery
  {
    const acr = overview.acr_trimp;
    const zone = overview.acr_trimp_zone;
    const sleepH = overview.recovery.sleep_hours;
    const hrv = overview.recovery.hrv;
    let tone: DeeperInsight["tone"] = "neutral";
    let sentence = "Need a bit more load and recovery history.";
    if (acr != null) {
      if (zone === "high_risk" || zone === "caution") {
        tone = zone === "high_risk" ? "caution" : "watch";
        sentence =
          sleepH != null && sleepH < 6.5
            ? "Load is elevated and sleep looks soft — protect recovery."
            : "Acute load is high vs your chronic baseline — keep easy volume honest.";
      } else if (zone === "optimal") {
        tone = "good";
        sentence =
          hrv != null
            ? "Load and recovery look aligned — HRV is available as a check."
            : "Load sits in a workable band relative to recent weeks.";
      } else if (zone === "undertraining") {
        tone = "watch";
        sentence = "Chronic load is light — a quality session may fit if you feel good.";
      }
    }
    out.push({
      id: "load_vs_recovery",
      title: "Load vs recovery",
      value:
        acr != null
          ? `ACR ${acr.toFixed(2)}`
          : overview.trimp > 0
            ? `TRIMP ${round1(overview.trimp)}`
            : "—",
      baseline:
        overview.recovery.resting_hr != null
          ? `RHR ${overview.recovery.resting_hr} · sleep ${overview.recovery.sleep_hours ?? "—"} h`
          : sleepH != null
            ? `Sleep ${sleepH} h`
            : null,
      sentence,
      tone,
      glossary_ids: ["acr", "trimp", "hrv"],
    });
  }

  // Easy-day discipline
  {
    const easy = last28.filter(isEasy).length;
    const pct = last28.length ? Math.round((easy / last28.length) * 100) : null;
    let tone: DeeperInsight["tone"] = "neutral";
    let sentence = "Tag more sessions or sync TE to judge easy-day share.";
    if (pct != null) {
      if (pct >= 70) {
        tone = "good";
        sentence = "Most recent sessions look easy — good base for adaptation.";
      } else if (pct >= 50) {
        tone = "watch";
        sentence = "Easy share is moderate — watch stacking hard days.";
      } else {
        tone = "caution";
        sentence = "Few easy days in 28d — junk miles or too much intensity.";
      }
    }
    out.push({
      id: "easy_discipline",
      title: "Easy-day discipline",
      value: pct != null ? `${pct}% easy` : "—",
      baseline: last28.length ? `${easy}/${last28.length} sessions · 28d` : null,
      sentence,
      tone,
      glossary_ids: ["te"],
    });
  }

  // Efficiency
  {
    const eff = overview.efficiency_trimp_per_km;
    const prior = last28.filter((a) => (a.distance_km ?? 0) > 0.5);
    const priorEff = mean(
      prior
        .map((a) => {
          const t = a.trimp ?? a.load_score;
          const d = a.distance_km;
          if (t == null || d == null || d < 0.5) return null;
          return t / d;
        })
        .filter((n): n is number => n != null),
    );
    let tone: DeeperInsight["tone"] = "neutral";
    let sentence = "Efficiency needs distance + TRIMP on recent runs.";
    if (eff != null && priorEff != null) {
      const delta = ((eff - priorEff) / priorEff) * 100;
      if (delta <= -8) {
        tone = "good";
        sentence = "This week’s TRIMP per km is lower than your 28d mix — efficient.";
      } else if (delta >= 12) {
        tone = "watch";
        sentence = "More TRIMP per km than usual — heat, hills, or harder intent.";
      } else {
        tone = "good";
        sentence = "Effort per kilometre is near your recent average.";
      }
    } else if (eff != null) {
      sentence = "Week efficiency recorded — build 28d history for comparison.";
    }
    out.push({
      id: "efficiency",
      title: "Efficiency",
      value: eff != null ? `${eff.toFixed(1)} TRIMP/km` : "—",
      baseline: priorEff != null ? `28d avg ${round1(priorEff)}` : null,
      sentence,
      tone,
      glossary_ids: ["trimp"],
    });
  }

  // Consistency
  {
    const active7 = new Set<string>();
    for (const a of last7) {
      if (a.date) active7.add(a.date.slice(0, 10));
    }
    const n = active7.size;
    const target = 4;
    let tone: DeeperInsight["tone"] = "neutral";
    let sentence = "Aim for regular easy days more than one heroic session.";
    if (n >= target) {
      tone = "good";
      sentence = "Frequency looks solid this week.";
    } else if (n >= 2) {
      tone = "watch";
      sentence = "A few active days — consistency still building.";
    } else {
      tone = "caution";
      sentence = "Very few active days — missed days matter more than one hard run.";
    }
    out.push({
      id: "consistency",
      title: "Consistency",
      value: `${n}/7 days`,
      baseline: `Target ≥${target} · ${overview.sessions} sessions`,
      sentence,
      tone,
    });
  }

  // Sleep–stress
  {
    const sleepH = overview.recovery.sleep_hours;
    const score = overview.recovery.sleep_score;
    const stress = overview.recovery.avg_stress;
    const hrv = overview.recovery.hrv;
    const nights = dailyDays.filter(
      (d) => d.sleep.total_hours != null && d.sleep.total_hours > 0,
    );
    let tone: DeeperInsight["tone"] = "neutral";
    let sentence = "Sync sleep and daily wellness for this card.";
    if (sleepH != null || stress != null) {
      const short = sleepH != null && sleepH < 6.5;
      const stressed = stress != null && stress >= 40;
      if (short && stressed) {
        tone = "caution";
        sentence = "Short sleep plus elevated stress — ease intensity.";
      } else if (short || (score != null && score < 70)) {
        tone = "watch";
        sentence = "Sleep looks soft — protect bedtime before adding quality.";
      } else if (hrv != null && overview.recovery.hrv_status) {
        tone = "good";
        sentence = `Sleep OK · HRV ${Math.round(hrv)} (${overview.recovery.hrv_status.replaceAll("_", " ").toLowerCase()}).`;
      } else {
        tone = "good";
        sentence = "Recovery signals are usable for planning tomorrow.";
      }
    }
    out.push({
      id: "sleep_stress",
      title: "Sleep–stress",
      value:
        sleepH != null
          ? `${sleepH} h`
          : score != null
            ? `Score ${score}`
            : "—",
      baseline:
        [
          score != null ? `score ${score}` : null,
          stress != null ? `stress ${stress}` : null,
          nights.length ? `${nights.length} nights lookback` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      sentence,
      tone,
      glossary_ids: ["hrv", "body_battery"],
    });
  }

  return out;
}
