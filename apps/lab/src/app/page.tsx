import { Dashboard } from "@/components/Dashboard";
import {
  buildAcr,
  buildOverview,
  buildWeekly,
  listRecentActivities,
} from "@/lib/data";
import { loadLabEnv, openaiConfigured, openaiModel } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  loadLabEnv();
  const [overview, weekly, acr, recent] = await Promise.all([
    buildOverview(12),
    buildWeekly(12),
    buildAcr(12),
    listRecentActivities(40),
  ]);

  const llm_ok = openaiConfigured();

  return (
    <Dashboard
      overview={overview}
      weeks={weekly.weeks}
      forecast={weekly.forecast}
      acrKm={acr.km}
      acrTrimp={acr.trimp}
      alignment={acr.current.alignment}
      activities={recent.activities}
      health={{ llm_ok, model: llm_ok ? openaiModel() : null }}
    />
  );
}
