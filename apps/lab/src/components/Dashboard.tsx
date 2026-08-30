"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  ActivityRow,
  AcrPoint,
  ForecastWeek,
  OverviewPayload,
  WeekBucket,
} from "@/lib/loadMath";
import { ActivityTable } from "./ActivityTable";
import { CoachChat } from "./CoachChat";
import { DualAcrChart } from "./DualAcrChart";
import { KpiRow } from "./KpiRow";
import { WeeklyMileageLoad } from "./WeeklyMileageLoad";

type Props = {
  overview: OverviewPayload;
  weeks: WeekBucket[];
  forecast: ForecastWeek[];
  acrKm: AcrPoint[];
  acrTrimp: AcrPoint[];
  alignment: string;
  activities: ActivityRow[];
  health: { llm_ok: boolean; model: string | null };
};

export function Dashboard({
  overview,
  weeks,
  forecast,
  acrKm,
  acrTrimp,
  alignment,
  activities,
  health,
}: Props) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncMsg, setResyncMsg] = useState<string | null>(null);

  async function onResync() {
    setResyncing(true);
    setResyncMsg(null);
    try {
      const res = await fetch("/api/resync", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        imported?: number;
        total?: number;
      };
      if (!res.ok) {
        setResyncMsg(data.error ?? `Resync failed (${res.status})`);
        return;
      }
      setResyncMsg(
        data.message ??
          `Imported ${data.imported ?? "?"} activities (${data.total ?? "?"} total)`,
      );
      router.refresh();
    } catch (err) {
      setResyncMsg(err instanceof Error ? err.message : "Resync failed");
    } finally {
      setResyncing(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <header className="topbar">
          <div>
            <h1>Steven Training Lab</h1>
            <div className="meta">
              As of {overview.as_of}
              {overview.last_sync
                ? ` · last sync ${new Date(overview.last_sync).toLocaleString()}`
                : " · no enrichment meta yet"}
              {" · "}
              {overview.activity_count} activities
            </div>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="btn-resync"
              onClick={() => void onResync()}
              disabled={resyncing}
            >
              {resyncing ? "Resyncing…" : "Resync Garmin"}
            </button>
            <span
              className={`status-pill ${health.llm_ok ? "ok" : "warn"}`}
            >
              LLM{" "}
              {health.llm_ok
                ? `online (${health.model ?? "openai"})`
                : "offline — set OPENAI_API_KEY"}
            </span>
          </div>
        </header>
        {resyncMsg ? <p className="insight">{resyncMsg}</p> : null}

        <KpiRow overview={overview} />
        <WeeklyMileageLoad weeks={weeks} forecast={forecast} />
        <DualAcrChart km={acrKm} trimp={acrTrimp} alignment={alignment} />
        <ActivityTable activities={activities} />
      </main>

      <div
        className={`chat-backdrop${chatOpen ? " open" : ""}`}
        onClick={() => setChatOpen(false)}
        aria-hidden
      />
      <CoachChat open={chatOpen} llmOkInitial={health.llm_ok} />
      <button
        type="button"
        className="mobile-chat-toggle"
        onClick={() => setChatOpen((v) => !v)}
      >
        {chatOpen ? "Close coach" : "Ask coach"}
      </button>
    </div>
  );
}
