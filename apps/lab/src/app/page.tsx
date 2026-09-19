import { Dashboard } from "@/components/Dashboard";
import {
  buildAcr,
  buildDailyAnalyzer,
  buildOverview,
  buildOverviewDecision,
  buildWeekly,
  buildYourBestPayload,
  listRecentActivities,
} from "@/lib/data";
import { readDashboardLayout } from "@/lib/dashboardLayout";
import {
  loadLabEnv,
  llmConfigured,
  llmModel,
  llmProvider,
} from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  loadLabEnv();
  const [overview, insights, weekly, acr, recent, daily, best, layout] =
    await Promise.all([
      buildOverview(12),
      buildOverviewDecision(12),
      buildWeekly(12),
      buildAcr(12),
      listRecentActivities(40),
      buildDailyAnalyzer(7),
      buildYourBestPayload(),
      readDashboardLayout(),
    ]);

  const llm_ok = llmConfigured();
  const provider = llmProvider();

  return (
    <Dashboard
      overview={overview}
      insights={insights}
      weeks={weekly.weeks}
      forecast={weekly.forecast}
      hrv={weekly.hrv}
      acrKm={acr.km}
      acrTrimp={acr.trimp}
      alignment={acr.current.alignment}
      activities={recent.activities}
      dailyAnalyzer={daily.days}
      yourBest={best}
      layout={layout}
      health={{
        llm_ok,
        model: llm_ok ? `${provider}:${llmModel()}` : null,
      }}
    />
  );
}
