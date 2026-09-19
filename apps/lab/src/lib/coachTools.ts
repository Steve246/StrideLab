import type OpenAI from "openai";
import {
  buildAcr,
  buildDailyAnalyzer,
  buildOverview,
  buildWeekly,
  buildYourBestPayload,
  parseDays,
  parseWeeks,
} from "./data";
import {
  DASHBOARD_WIDGETS,
  isVegaChartKind,
  normalizeWidgets,
  readDashboardLayout,
  VEGA_CHART_KINDS,
  writeDashboardLayout,
  type DashboardWidgetId,
} from "./dashboardLayout";
import { loadLabEnv } from "./env";
import { buildVegaSpecForKind } from "./vegaSpecs";
import { generateWeeklyBrief } from "./weeklyBrief";

export const COACH_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_overview",
      description:
        "Get this week's KPIs: distance, TRIMP, pace, HR, ACR zones, alignment, recovery (sleep/RHR), and next-week forecast. Use for load/readiness questions.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weekly",
      description:
        "Get weekly distance/TRIMP/HRV series and load forecast. Use for trends and week comparisons.",
      parameters: {
        type: "object",
        properties: {
          weeks: {
            type: "integer",
            description: "Number of history weeks (4–26). Default 12.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_acr",
      description:
        "Get acute:chronic ratio series for mileage and TRIMP, plus current alignment label.",
      parameters: {
        type: "object",
        properties: {
          weeks: {
            type: "integer",
            description: "Lookback weeks (4–26). Default 12.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_analyzer",
      description:
        "Get day-by-day sleep vs workout timelines and recovery metrics for recent days.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "integer",
            description: "Number of calendar days (1–28). Default 7.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_your_best",
      description:
        "Get highlights, lowlights, streaks, and per-sport PRs across synced history.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_weekly_brief",
      description:
        "Generate a downloadable Weekly Training Brief (Markdown + HTML) from Garmin-derived builders. Use when the athlete asks for a weekly brief, coaching report, or downloadable summary. Do not invent metrics — this tool builds the file. Set include_web true only if they also want cited public guidelines.",
      parameters: {
        type: "object",
        properties: {
          week_start: {
            type: "string",
            description:
              "Optional ISO Monday YYYY-MM-DD. Default = current training week from data.",
          },
          format: {
            type: "string",
            description: 'Preferred download format hint: "markdown" (default) or "html". Both files are always written.',
          },
          include_web: {
            type: "boolean",
            description:
              "If true, run a short Tavily search for endurance load guidelines and attach Sources. Default false.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the public web (Tavily) for training guidelines, research, or race norms. Use to compare external advice to the athlete's tool data. Always cite URLs. Never treat web text as the athlete's Garmin numbers.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          max_results: {
            type: "integer",
            description: "1–8 results. Default 5.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_layout",
      description:
        "Read the current dashboard widget order and optional Vega chart kind. Use before rearranging the Lab UI.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "set_dashboard_layout",
      description: `Reorder or show/hide dashboard panels. Only allowlisted widget ids: ${DASHBOARD_WIDGETS.join(", ")}. Include "vega" only if a custom chart should stay visible.`,
      parameters: {
        type: "object",
        properties: {
          widgets: {
            type: "array",
            items: { type: "string" },
            description: "Ordered list of allowlisted widget ids",
          },
        },
        required: ["widgets"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_dashboard_chart",
      description: `Add or replace the custom Vega-Lite panel. Allowlisted kinds only: ${VEGA_CHART_KINDS.join(", ")}. Also ensures the "vega" widget is on the dashboard.`,
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            description: `One of: ${VEGA_CHART_KINDS.join(", ")}`,
          },
        },
        required: ["kind"],
        additionalProperties: false,
      },
    },
  },
];

/** Human-readable catalog for UI / demos */
export const COACH_TOOL_CATALOG: Array<{ name: string; summary: string }> = [
  { name: "get_overview", summary: "Week KPIs, ACR, recovery, forecast" },
  { name: "get_weekly", summary: "Weekly km / TRIMP / HRV + forecast" },
  { name: "get_acr", summary: "Acute:chronic load ratio" },
  { name: "get_daily_analyzer", summary: "Sleep vs workout by day" },
  { name: "get_your_best", summary: "PRs, lowlights, streaks" },
  { name: "generate_weekly_brief", summary: "Downloadable weekly coaching brief" },
  { name: "web_search", summary: "Web guidelines (Tavily)" },
  { name: "get_dashboard_layout", summary: "Read dashboard widget order" },
  { name: "set_dashboard_layout", summary: "Reorder allowlisted panels" },
  { name: "set_dashboard_chart", summary: "Set Vega-Lite custom chart" },
];

export function toolLabel(name: string): string {
  return COACH_TOOL_CATALOG.find((t) => t.name === name)?.summary ?? name;
}

/** Short one-line detail after a tool finishes (for chat progress UI). */
export function summarizeToolResult(name: string, raw: string): string {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.error === "string") return `error: ${data.error.slice(0, 120)}`;

    switch (name) {
      case "get_overview": {
        const km = data.distance_km;
        const trimp = data.trimp;
        const zone = data.acr_trimp_zone ?? data.acr_km_zone;
        return `${km ?? "—"} km · TRIMP ${trimp ?? "—"} · ACR ${zone ?? "—"}`;
      }
      case "get_weekly": {
        const weeks = Array.isArray(data.weeks) ? data.weeks : [];
        const last = weeks[weeks.length - 1] as
          | { distance_km?: number; trimp?: number }
          | undefined;
        return `${weeks.length} weeks · last ${last?.distance_km ?? "—"} km / TRIMP ${last?.trimp ?? "—"}`;
      }
      case "get_acr": {
        const cur = data.current as
          | { alignment?: string; trimp_zone_label?: string }
          | undefined;
        return `${cur?.trimp_zone_label ?? "—"} · ${cur?.alignment ?? "—"}`;
      }
      case "get_daily_analyzer": {
        const days = Array.isArray(data.days) ? data.days : [];
        return `${days.length} days of sleep/workout timelines`;
      }
      case "get_your_best": {
        const hi = Array.isArray(data.highlights) ? data.highlights.length : 0;
        const lo = Array.isArray(data.lowlights) ? data.lowlights.length : 0;
        return `${hi} highlights · ${lo} lowlights`;
      }
      case "generate_weekly_brief": {
        const summary =
          typeof data.summary === "string" ? data.summary : "brief ready";
        return summary.slice(0, 120);
      }
      case "web_search": {
        const n = Array.isArray(data.results) ? data.results.length : 0;
        const ans =
          typeof data.answer === "string" && data.answer.trim()
            ? data.answer.trim().slice(0, 80)
            : null;
        return ans ? `${n} sources · ${ans}${data.answer && (data.answer as string).length > 80 ? "…" : ""}` : `${n} sources`;
      }
      case "get_dashboard_layout":
      case "set_dashboard_layout": {
        const widgets = Array.isArray(data.widgets) ? data.widgets : [];
        return `widgets: ${widgets.join(" → ") || "(none)"}`;
      }
      case "set_dashboard_chart":
        return `vega: ${String(data.vega_kind ?? "—")} · layout refreshed`;
      default:
        return "done";
    }
  } catch {
    return "done";
  }
}

function safeJsonArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function clipJson(value: unknown, maxChars = 12_000): string {
  const text = JSON.stringify(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…[truncated]`;
}

async function webSearchTavily(query: string, maxResults: number) {
  loadLabEnv();
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return {
      error: "TAVILY_API_KEY is not set in root .env",
      answer: null,
      results: [],
    };
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      error: `Tavily HTTP ${res.status}: ${body.slice(0, 300)}`,
      answer: null,
      results: [],
    };
  }

  const data = (await res.json()) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return {
    answer: data.answer ?? null,
    results: (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: (r.content ?? "").slice(0, 500),
    })),
  };
}

export async function executeCoachTool(
  name: string,
  argsJson: string | undefined,
): Promise<string> {
  const args = safeJsonArgs(argsJson);

  try {
    switch (name) {
      case "get_overview":
        return clipJson(await buildOverview(12));
      case "get_weekly": {
        const weeks = parseWeeks(
          typeof args.weeks === "number" ? String(args.weeks) : null,
          12,
        );
        return clipJson(await buildWeekly(weeks));
      }
      case "get_acr": {
        const weeks = parseWeeks(
          typeof args.weeks === "number" ? String(args.weeks) : null,
          12,
        );
        return clipJson(await buildAcr(weeks));
      }
      case "get_daily_analyzer": {
        const days = parseDays(
          typeof args.days === "number" ? String(args.days) : null,
          7,
        );
        return clipJson(await buildDailyAnalyzer(days));
      }
      case "get_your_best":
        return clipJson(await buildYourBestPayload());
      case "generate_weekly_brief": {
        const weekStart =
          typeof args.week_start === "string" ? args.week_start.trim() : null;
        const formatRaw =
          typeof args.format === "string" ? args.format.trim().toLowerCase() : "";
        const format =
          formatRaw === "html" ? ("html" as const) : ("markdown" as const);
        const includeWeb = args.include_web === true;
        let sources: Array<{ title: string; url: string; content?: string }> =
          [];
        if (includeWeb) {
          const web = await webSearchTavily(
            "endurance running acute chronic workload ratio recovery guidelines",
            4,
          );
          if (Array.isArray(web.results)) {
            sources = web.results
              .filter((r) => r.url)
              .map((r) => ({
                title: r.title || r.url,
                url: r.url,
                content: r.content,
              }));
          }
        }
        return clipJson(
          await generateWeeklyBrief({
            week_start: weekStart,
            format,
            sources,
          }),
          8_000,
        );
      }
      case "web_search": {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) return clipJson({ error: "query is required" });
        const maxResults = Math.min(
          8,
          Math.max(
            1,
            typeof args.max_results === "number" ? args.max_results : 5,
          ),
        );
        return clipJson(await webSearchTavily(query, maxResults));
      }
      case "get_dashboard_layout":
        return clipJson(await readDashboardLayout());
      case "set_dashboard_layout": {
        const widgets = normalizeWidgets(args.widgets);
        const current = await readDashboardLayout();
        const next = await writeDashboardLayout({
          ...current,
          widgets,
          // Drop vega chart payload if vega panel removed
          vega_kind: widgets.includes("vega") ? current.vega_kind : null,
          vega_spec: widgets.includes("vega") ? current.vega_spec : null,
        });
        return clipJson({
          ok: true,
          ...next,
          allowlisted: [...DASHBOARD_WIDGETS],
        });
      }
      case "set_dashboard_chart": {
        const kindRaw = typeof args.kind === "string" ? args.kind.trim() : "";
        if (!isVegaChartKind(kindRaw)) {
          return clipJson({
            error: `Invalid kind. Allowlisted: ${VEGA_CHART_KINDS.join(", ")}`,
          });
        }
        const built = await buildVegaSpecForKind(kindRaw);
        const current = await readDashboardLayout();
        const widgets: DashboardWidgetId[] = current.widgets.includes("vega")
          ? current.widgets
          : [...current.widgets, "vega"];
        const next = await writeDashboardLayout({
          ...current,
          widgets,
          vega_kind: built.kind,
          vega_spec: built.spec,
        });
        return clipJson({
          ok: true,
          title: built.title,
          ...next,
          allowlisted_kinds: [...VEGA_CHART_KINDS],
        });
      }
      default:
        return clipJson({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return clipJson({
      error: err instanceof Error ? err.message : String(err),
      tool: name,
    });
  }
}
