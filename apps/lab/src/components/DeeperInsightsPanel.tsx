"use client";

import type { DeeperInsight } from "@/lib/deeperInsights";
import { METRIC_GLOSSARY, glossaryById } from "@/lib/metricGlossary";
import { cn } from "@/lib/utils";
import { LabPanel } from "./LabPanel";

function toneClass(tone: DeeperInsight["tone"]) {
  switch (tone) {
    case "good":
      return "border-[#21918c]/35 bg-[#21918c]/6";
    case "watch":
      return "border-amber-500/35 bg-amber-500/6";
    case "caution":
      return "border-destructive/35 bg-destructive/6";
    default:
      return "border-border/80 bg-card";
  }
}

export function DeeperInsightsPanel({
  insights,
}: {
  insights: DeeperInsight[];
}) {
  if (!insights.length) return null;

  return (
    <LabPanel
      title="Deeper insights"
      description="What the numbers mean this week — tap a term below for a plain definition."
      contentClassName="!px-4 pt-3"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((card) => (
          <article
            key={card.id}
            className={cn("border p-3", toneClass(card.tone))}
          >
            <div className="text-xs text-muted-foreground">{card.title}</div>
            <div className="mt-1 text-xl font-medium tracking-tight tabular-nums">
              {card.value}
            </div>
            {card.baseline ? (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {card.baseline}
              </div>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed">{card.sentence}</p>
            {card.glossary_ids?.length ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                See:{" "}
                {card.glossary_ids
                  .map((id) => glossaryById(id)?.label ?? id)
                  .join(" · ")}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <details className="mt-4 border border-border/60 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          What these metrics mean
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {METRIC_GLOSSARY.map((t) => (
            <li key={t.id}>
              <span className="font-medium text-foreground">{t.label}</span>
              {" — "}
              {t.blurb}
            </li>
          ))}
        </ul>
      </details>
    </LabPanel>
  );
}
