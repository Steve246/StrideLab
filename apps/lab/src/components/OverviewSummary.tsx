import type { DailyAnalyzerDay } from "@/lib/insights";
import type { OverviewPayload } from "@/lib/loadMath";
import type { OverviewInsights } from "@/lib/overviewInsights";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DailyAnalyzer } from "./DailyAnalyzer";

/** Overview tab: week KPIs + decision cards (not Load / Weekly / ACR / Best). */
export function OverviewSummary({
  overview,
  insights,
  dailyAnalyzer,
}: {
  overview: OverviewPayload;
  insights: OverviewInsights;
  dailyAnalyzer: DailyAnalyzerDay[];
}) {
  const wow = overview.wow_distance_pct;
  const statusTone =
    insights.week_status === "green"
      ? "border-[#21918c]/40 bg-[#21918c]/8"
      : insights.week_status === "yellow"
        ? "border-amber-500/40 bg-amber-500/8"
        : "border-destructive/40 bg-destructive/8";
  const statusDot =
    insights.week_status === "green"
      ? "bg-[#21918c]"
      : insights.week_status === "yellow"
        ? "bg-amber-500"
        : "bg-destructive";

  return (
    <div className="space-y-4">
      <section className="border border-border/80 bg-card p-4">
        <p className="text-sm text-muted-foreground">
          This week · {overview.alignment}
          {overview.forecast_next_week_km != null
            ? ` · next ≈ ${overview.forecast_next_week_km} km / TRIMP ${overview.forecast_next_week_trimp ?? "—"}`
            : ""}
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Distance</div>
            <div className="text-4xl font-medium tracking-tight tabular-nums sm:text-5xl">
              {overview.distance_km}
              <span className="ml-1.5 text-lg font-normal text-muted-foreground">
                km
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">TRIMP</div>
            <div className="text-3xl font-medium tabular-nums">
              {overview.trimp}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Sessions</div>
            <div className="text-3xl font-medium tabular-nums">
              {overview.sessions}
            </div>
          </div>
        </div>

        {wow != null ? (
          <div className="mt-4">
            <Badge variant="secondary" className="rounded-none font-normal">
              {wow > 0 ? "+" : ""}
              {wow}% vs prior week
            </Badge>
          </div>
        ) : null}
      </section>

      <section
        className={cn("border p-4", statusTone)}
        aria-label="Week status"
      >
        <div className="flex flex-wrap items-start gap-3">
          <span
            className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", statusDot)}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-base font-medium tracking-tight">
                {insights.week_status_label}
              </h2>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                week status
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {insights.week_status_reason}
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              <span className="text-muted-foreground">Next · </span>
              {insights.next_action}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <InsightCard
          title="Form"
          hint="Fitness − fatigue (TSB-style)"
          value={
            insights.form.form_label === "Unknown"
              ? "—"
              : insights.form.form_label
          }
          detail={
            insights.form.form_label === "Unknown"
              ? "Need more load history"
              : `Form ${insights.form.form >= 0 ? "+" : ""}${insights.form.form} · fitness ${insights.form.fitness} · fatigue ${insights.form.fatigue}`
          }
        />
        <InsightCard
          title="Consistency"
          hint="Active days, not volume charts"
          value={`${insights.consistency.active_days_7}/7`}
          detail={`${insights.consistency.rest_days_7} rest · ${insights.consistency.active_days_28} active in 28d · ${insights.consistency.sessions_this_week} sessions this week`}
        />
        <InsightCard
          title="Sleep consistency"
          hint="Duration stability across nights"
          value={insights.sleep_consistency.label}
          detail={
            insights.sleep_consistency.nights === 0
              ? "No sleep nights in lookback"
              : [
                  insights.sleep_consistency.avg_hours != null
                    ? `avg ${insights.sleep_consistency.avg_hours} h`
                    : null,
                  insights.sleep_consistency.avg_score != null
                    ? `score ${insights.sleep_consistency.avg_score}`
                    : null,
                  insights.sleep_consistency.hours_spread != null
                    ? `spread ${insights.sleep_consistency.hours_spread} h`
                    : null,
                  `${insights.sleep_consistency.nights} nights`,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
        />
      </div>

      <DailyAnalyzer days={dailyAnalyzer} />
    </div>
  );
}

function InsightCard({
  title,
  hint,
  value,
  detail,
}: {
  title: string;
  hint: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="border border-border/80 bg-card p-3.5">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-medium tracking-tight">{value}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground/80">{hint}</p>
    </section>
  );
}
