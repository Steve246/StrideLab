/** Compact in-chat widgets derived from coach tool results (P3.4 + Phase B brief). */

export type ChatWidget =
  | {
      kind: "kpi";
      title: string;
      items: Array<{ label: string; value: string }>;
    }
  | {
      kind: "bars";
      title: string;
      unit: string;
      bars: Array<{ label: string; value: number }>;
    }
  | {
      kind: "list";
      title: string;
      items: string[];
    }
  | {
      kind: "layout";
      title: string;
      widgets: string[];
      chart?: string | null;
    }
  | {
      kind: "download";
      title: string;
      summary: string;
      brief_id: string;
      downloads: Array<{ label: string; href: string }>;
    };

export function buildChatWidget(
  toolName: string,
  raw: string,
): ChatWidget | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.error === "string") return null;

    switch (toolName) {
      case "get_overview": {
        const items = [
          { label: "Distance", value: `${fmt(data.distance_km)} km` },
          { label: "TRIMP", value: fmt(data.trimp) },
          {
            label: "ACR (TRIMP)",
            value: String(data.acr_trimp_zone ?? data.acr_km_zone ?? "—"),
          },
          {
            label: "Alignment",
            value: String(data.alignment ?? "—"),
          },
        ];
        return { kind: "kpi", title: "This week", items };
      }
      case "get_weekly": {
        const weeks = Array.isArray(data.weeks) ? data.weeks : [];
        const bars = weeks.slice(-8).map((w) => {
          const row = w as { week_start?: string; distance_km?: number };
          return {
            label: String(row.week_start ?? "").slice(5),
            value: Number(row.distance_km ?? 0),
          };
        });
        if (!bars.length) return null;
        return {
          kind: "bars",
          title: "Recent weekly km",
          unit: "km",
          bars,
        };
      }
      case "get_acr": {
        const cur = data.current as
          | {
              alignment?: string;
              trimp_zone_label?: string;
              trimp?: { acr?: number | null } | null;
            }
          | undefined;
        const acrVal = cur?.trimp?.acr;
        return {
          kind: "kpi",
          title: "ACR now",
          items: [
            {
              label: "TRIMP ACR",
              value:
                typeof acrVal === "number" ? acrVal.toFixed(2) : "—",
            },
            { label: "Zone", value: String(cur?.trimp_zone_label ?? "—") },
            { label: "Alignment", value: String(cur?.alignment ?? "—") },
          ],
        };
      }
      case "get_your_best": {
        const highlights = Array.isArray(data.highlights) ? data.highlights : [];
        const items = highlights.slice(0, 4).map((h) => {
          if (typeof h === "string") return h;
          const row = h as { title?: string; value?: string; detail?: string };
          return (
            [row.title, row.value].filter(Boolean).join(": ") ||
            row.detail ||
            "—"
          );
        });
        if (!items.length) return null;
        return { kind: "list", title: "Highlights", items };
      }
      case "generate_weekly_brief": {
        const briefId =
          typeof data.brief_id === "string" ? data.brief_id : null;
        const downloadMd =
          typeof data.download_md === "string" ? data.download_md : null;
        const downloadHtml =
          typeof data.download_html === "string" ? data.download_html : null;
        if (!briefId || (!downloadMd && !downloadHtml)) return null;
        const downloads: Array<{ label: string; href: string }> = [];
        if (downloadMd) downloads.push({ label: "Markdown", href: downloadMd });
        if (downloadHtml) downloads.push({ label: "HTML", href: downloadHtml });
        return {
          kind: "download",
          title: "Weekly Training Brief",
          summary:
            typeof data.summary === "string" ? data.summary : "Ready to download",
          brief_id: briefId,
          downloads,
        };
      }
      case "get_dashboard_layout":
      case "set_dashboard_layout":
      case "set_dashboard_chart": {
        const widgets = Array.isArray(data.widgets)
          ? data.widgets.map(String)
          : [];
        return {
          kind: "layout",
          title:
            toolName === "get_dashboard_layout"
              ? "Dashboard layout"
              : "Layout updated",
          widgets,
          chart:
            typeof data.vega_kind === "string"
              ? data.vega_kind
              : data.vega_kind === null
                ? null
                : undefined,
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function fmt(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  return "—";
}
