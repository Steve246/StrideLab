"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Award,
  CalendarDays,
  ChartColumn,
  Gauge,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExternalMenu } from "./ExternalMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type LabTabId =
  | "overview"
  | "load"
  | "weekly"
  | "acr"
  | "best"
  | "log";

const TABS: Array<{
  id: LabTabId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "load", label: "Load", icon: Gauge },
  { id: "weekly", label: "Weekly", icon: ChartColumn },
  { id: "acr", label: "ACR", icon: Activity },
  { id: "best", label: "Best", icon: Award },
  { id: "log", label: "Log", icon: CalendarDays },
];

type Props = {
  active: LabTabId;
  onSelect: (id: LabTabId) => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  resyncing: boolean;
  onResync: () => void;
  llmOk: boolean;
};

export function LabRail({
  active,
  onSelect,
  chatOpen,
  onToggleChat,
  resyncing,
  onResync,
  llmOk,
}: Props) {
  return (
    <aside className="lab-rail" aria-label="Lab navigation">
      <div className="lab-rail-brand" title="StrideLab">
        <span className="lab-rail-mark" aria-label="StrideLab">
          <svg viewBox="0 0 32 32" role="img" aria-hidden="true">
            <path d="M7 22.5 12.5 9l4 9 3.5-6 5 10" />
            <path d="M5 25h22" />
          </svg>
        </span>
      </div>

      <nav className="lab-rail-nav">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn("lab-rail-tab", isActive && "active")}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelect(tab.id)}
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                  <span className="lab-rail-tab-label">{tab.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="md:hidden">
                {tab.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="lab-rail-external">
        <ExternalMenu />
      </div>

      <div className="lab-rail-footer">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lab-rail-icon-btn"
              onClick={onResync}
              disabled={resyncing}
              aria-label="Resync Garmin"
            >
              <RefreshCw
                className={cn("size-4", resyncing && "animate-spin")}
                strokeWidth={1.75}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {resyncing ? "Resyncing…" : "Resync Garmin"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={chatOpen ? "default" : "ghost"}
              size="icon"
              className="lab-rail-icon-btn"
              onClick={onToggleChat}
              aria-pressed={chatOpen}
              aria-label={chatOpen ? "Hide coach chat" : "Show coach chat"}
            >
              <MessageSquare className="size-4" strokeWidth={1.75} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {chatOpen ? "Hide coach" : "Show coach"}
          </TooltipContent>
        </Tooltip>

        <span
          className={cn("lab-rail-llm-dot", llmOk ? "ok" : "warn")}
          title={llmOk ? "LLM online" : "LLM offline"}
          aria-label={llmOk ? "LLM online" : "LLM offline"}
        />
      </div>
    </aside>
  );
}

export const LAB_TAB_TITLES: Record<LabTabId, string> = {
  overview: "Overview",
  load: "Load & recovery",
  weekly: "Weekly load",
  acr: "Acute:chronic",
  best: "Your best",
  log: "Activity log",
};
