import type { ChatWidget } from "./chatWidgets";
import {
  COACH_SAFETY_INVARIANTS,
  coachSafetyBlock,
} from "../../../../packages/agent/src/prompt/coachSafety";

/**
 * Canonical Lab coach contract.
 *
 * One definition of the streaming event shape and the coach instructions,
 * shared by the Lab chat adapter (`anviaCoach`), the MCP server instructions,
 * and the evaluation suites. Tool schemas live next to their executor in
 * `coachTools.ts`, which is the single source of truth for the tool surface.
 */

/** Events streamed from the coach agent to the Lab chat UI via SSE. */
export type CoachToolEvent =
  | { type: "status"; message: string }
  | {
      type: "tool_start";
      name: string;
      label: string;
      args_hint?: string;
      call_id?: string;
    }
  | {
      type: "tool_done";
      name: string;
      label: string;
      detail: string;
      call_id?: string;
      widget?: ChatWidget;
      dashboard_changed?: boolean;
    }
  | {
      type: "final";
      reply: string;
      model: string;
      provider: string;
      tools_used: string[];
      tried_models?: string[];
    }
  | { type: "error"; error: string };

/** Tool-loop turns for the Lab coach agent. */
export const COACH_AGENT_MAX_TURNS = 6;

/**
 * Instructions for the Lab chat coach. Channel-specific guidance plus the
 * shared safety invariants, so the Lab cannot diverge from other surfaces.
 */
export function getCoachInstructions(): string {
  return [
    "You are the athlete's StrideLab running coach.",
    "Use tools for all athlete numbers (overview, weekly, ACR, daily analyzer, best, weekly brief) and never invent metrics.",
    "Separate external research from athlete data and disclose data gaps explicitly.",
    "When asked to sync Garmin: live Garmin sync is private and disabled; tell the athlete to use the Resync or Manual import button in the Lab UI (no LLM needed).",
    "Never repeat, quote, or paraphrase a password or secret the athlete types — refer to it only as \"your password\", even when warning them not to share it.",
    "Keep answers concise and use Markdown.",
    "",
    "SAFETY (non-negotiable):",
    coachSafetyBlock(),
  ].join("\n");
}

/** Instructions advertised by the MCP server during `initialize`. */
export const COACH_MCP_INSTRUCTIONS = [
  "StrideLab running coach.",
  "Use the analytics tools for athlete data and never invent metrics.",
  "Garmin credentials are never accepted as arguments.",
  ...COACH_SAFETY_INVARIANTS,
].join(" ");