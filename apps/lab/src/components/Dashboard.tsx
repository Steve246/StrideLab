"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { DashboardLayout } from "@/lib/dashboardLayoutShared";
import type { DailyAnalyzerDay, YourBestPayload } from "@/lib/insights";
import type {
  ActivityRow,
  AcrPoint,
  ForecastWeek,
  HrvWeek,
  OverviewPayload,
  WeekBucket,
} from "@/lib/loadMath";
import type { OverviewInsights } from "@/lib/overviewInsights";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityTable } from "./ActivityTable";
import { CoachChat } from "./CoachChat";
import { DualAcrChart } from "./DualAcrChart";
import { KpiRow } from "./KpiRow";
import { LAB_TAB_TITLES, LabRail, type LabTabId } from "./LabRail";
import { OverviewSummary } from "./OverviewSummary";
import { WeeklyMileageLoad } from "./WeeklyMileageLoad";
import { YourBest } from "./YourBest";
import { GarminDataSourcesPanel } from "./GarminDataSourcesPanel";

type Props = {
  overview: OverviewPayload;
  insights: OverviewInsights;
  weeks: WeekBucket[];
  forecast: ForecastWeek[];
  hrv: HrvWeek[];
  acrKm: AcrPoint[];
  acrTrimp: AcrPoint[];
  alignment: string;
  activities: ActivityRow[];
  dailyAnalyzer: DailyAnalyzerDay[];
  yourBest: YourBestPayload;
  layout: DashboardLayout;
  health: { llm_ok: boolean; model: string | null };
};

export function Dashboard({
  overview,
  insights,
  weeks,
  forecast,
  hrv,
  acrKm,
  acrTrimp,
  alignment,
  activities,
  dailyAnalyzer,
  yourBest,
  layout: _layout,
  health,
}: Props) {
  void _layout;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LabTabId>("overview");
  const [chatOpen, setChatOpen] = useState(true);
  const [resyncing, setResyncing] = useState(false);
  const [resyncMsg, setResyncMsg] = useState<string | null>(null);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 960px)");
    const sync = () => {
      if (mq.matches) setChatOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const refreshAfterLayoutChange = useCallback(async () => {
    setLayoutBusy(true);
    try {
      startTransition(() => {
        router.refresh();
      });
    } finally {
      window.setTimeout(() => setLayoutBusy(false), 350);
    }
  }, [router]);

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

  const showOverlay = layoutBusy || isPending;

  function renderTab() {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewSummary
            overview={overview}
            insights={insights}
            dailyAnalyzer={dailyAnalyzer}
          />
        );
      case "load":
        return <KpiRow overview={overview} />;
      case "weekly":
        return (
          <WeeklyMileageLoad weeks={weeks} forecast={forecast} hrv={hrv} />
        );
      case "acr":
        return (
          <DualAcrChart
            km={acrKm}
            trimp={acrTrimp}
            alignment={alignment}
          />
        );
      case "best":
        return <YourBest data={yourBest} />;
      case "log":
        return <ActivityTable activities={activities} />;
      default:
        return null;
    }
  }

  return (
    <div
      className={cn(
        "lab-shell",
        chatOpen && "chat-open",
        showOverlay && "is-updating",
      )}
    >
      <LabRail
        active={activeTab}
        onSelect={setActiveTab}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        resyncing={resyncing}
        onResync={() => void onResync()}
        llmOk={health.llm_ok}
      />

      <main className="lab-main">
        {showOverlay ? (
          <Alert className="mb-4 rounded-none bg-card/95 backdrop-blur">
            <AlertTitle>Updating dashboard…</AlertTitle>
            <AlertDescription>
              Refreshing data after coach / resync changes.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="lab-main-meta">
          <div>
            <h1 className="lab-main-title">{LAB_TAB_TITLES[activeTab]}</h1>
            <p className="lab-main-sub">
              {overview.as_of}
              {overview.last_sync
                ? ` · synced ${new Date(overview.last_sync).toLocaleString()}`
                : ""}
              {" · "}
              <span className="tabular-nums">{overview.activity_count}</span>{" "}
              activities
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GarminDataSourcesPanel mode="manual" />
            <GarminDataSourcesPanel mode="live" />
            <Badge
              variant={health.llm_ok ? "secondary" : "destructive"}
              className="rounded-none font-normal"
            >
              {health.llm_ok ? health.model ?? "LLM online" : "LLM offline"}
            </Badge>
            <Button
              type="button"
              variant={chatOpen ? "outline" : "default"}
              size="sm"
              className="rounded-none"
              onClick={() => setChatOpen((v) => !v)}
            >
              {chatOpen ? "Hide coach" : "Show coach"}
            </Button>
          </div>
        </div>

        {resyncMsg ? (
          <Alert className="mb-4 rounded-none">
            <AlertTitle>Resync</AlertTitle>
            <AlertDescription>{resyncMsg}</AlertDescription>
          </Alert>
        ) : null}

        {renderTab()}
      </main>

      {chatOpen ? (
        <>
          <div
            className="lab-chat-backdrop"
            onClick={() => setChatOpen(false)}
            aria-hidden
          />
          <div className="lab-chat-slot">
            <div className="lab-chat-close-row">
              <span className="text-sm font-medium">Coach</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-none"
                onClick={() => setChatOpen(false)}
                aria-label="Close coach chat"
              >
                <X className="size-4" />
              </Button>
            </div>
            <CoachChat
              open
              llmOkInitial={health.llm_ok}
              onDashboardChanged={() => void refreshAfterLayoutChange()}
              onClose={() => setChatOpen(false)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
