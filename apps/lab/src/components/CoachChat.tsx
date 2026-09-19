"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatWidget } from "@/lib/chatWidgets";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ChatToolWidget } from "./ChatToolWidget";
import { CoachMarkdown } from "./CoachMarkdown";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "error" | "meta" | "tool";
  text: string;
  toolName?: string;
  toolState?: "running" | "done";
  widget?: ChatWidget;
};

type ToolInfo = { name: string; summary: string };

type StreamEvent =
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
    }
  | { type: "error"; error: string };

const FALLBACK_TOOLS: ToolInfo[] = [
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

let msgSeq = 0;
function mid(prefix: string) {
  msgSeq += 1;
  return `${prefix}-${msgSeq}-${Date.now()}`;
}

export function CoachChat({
  open,
  llmOkInitial,
  onDashboardChanged,
  onClose,
}: {
  open?: boolean;
  llmOkInitial?: boolean;
  onDashboardChanged?: () => void;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "I'm your running coach with tool calling. Ask about load, sleep, PRs, or say “generate my weekly brief” for a downloadable report.",
    },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [llmOk, setLlmOk] = useState<boolean | null>(llmOkInitial ?? null);
  const [model, setModel] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ToolInfo[]>(FALLBACK_TOOLS);
  const [lastTools, setLastTools] = useState<string[]>([]);
  const [showCatalog, setShowCatalog] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Maps tool call_id (or name) → message id for in-place updates */
  const runningToolsRef = useRef<Map<string, string>>(new Map());
  const onDashboardChangedRef = useRef(onDashboardChanged);
  onDashboardChangedRef.current = onDashboardChanged;

  const refreshHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      const d = (await r.json()) as {
        llm_ok?: boolean;
        model?: string | null;
        provider?: string | null;
      };
      setLlmOk(Boolean(d.llm_ok));
      setModel(d.model ? `${d.provider ?? "llm"}:${d.model}` : null);
    } catch {
      setLlmOk(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    const id = window.setInterval(() => void refreshHealth(), 20_000);
    return () => window.clearInterval(id);
  }, [refreshHealth]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/chat/tools", { cache: "no-store" });
        const d = (await r.json()) as { tools?: ToolInfo[] };
        if (Array.isArray(d.tools) && d.tools.length) setCatalog(d.tools);
      } catch {
        /* keep fallback */
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, statusLine]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    if (llmOk === false) {
      setMessages((m) => [
        ...m,
        {
          id: mid("err"),
          role: "error",
          text: "LLM is not configured. Set LLM_PROVIDER and keys in root .env (Devscale or OpenAI).",
        },
      ]);
      void refreshHealth();
      return;
    }

    setInput("");
    setMessages((m) => [
      ...m,
      { id: mid("user"), role: "user", text: message },
    ]);
    setBusy(true);
    setStatusLine("Connecting…");
    setLastTools([]);
    runningToolsRef.current = new Map();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, stream: true }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessages((m) => [
          ...m,
          {
            id: mid("err"),
            role: "error",
            text: data.error ?? `Chat failed (${res.status})`,
          },
        ]);
        setLlmOk(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotFinal = false;
      let gotError = false;
      let layoutTouched = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const raw = line.replace(/^data:\s*/, "");
          let ev: StreamEvent;
          try {
            ev = JSON.parse(raw) as StreamEvent;
          } catch {
            continue;
          }

          if (ev.type === "status") {
            setStatusLine(ev.message);
          } else if (ev.type === "tool_start") {
            setStatusLine(`Calling ${ev.name}…`);
            const key = ev.call_id ?? ev.name;
            const id = mid(`tool-${key}`);
            runningToolsRef.current.set(key, id);
            const hint = ev.args_hint ? ` — ${ev.args_hint}` : "";
            setMessages((m) => [
              ...m,
              {
                id,
                role: "tool",
                toolName: ev.name,
                toolState: "running",
                text: `⏳ Calling \`${ev.name}\`${hint}\n${ev.label}`,
              },
            ]);
          } else if (ev.type === "tool_done") {
            const key = ev.call_id ?? ev.name;
            const id = runningToolsRef.current.get(key);
            runningToolsRef.current.delete(key);
            setStatusLine(`Finished ${ev.name}`);
            if (ev.dashboard_changed) layoutTouched = true;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === id
                  ? {
                      ...msg,
                      toolState: "done" as const,
                      text: `✓ \`${ev.name}\` done\n${ev.detail}`,
                      widget: ev.widget,
                    }
                  : msg,
              ),
            );
            setLastTools((prev) =>
              prev.includes(ev.name) ? prev : [...prev, ev.name],
            );
          } else if (ev.type === "final") {
            gotFinal = true;
            setStatusLine(null);
            if (ev.model) setModel(ev.model);
            const tools = [...new Set(ev.tools_used)];
            setLastTools(tools);
            setHistory((h) => [
              ...h,
              { role: "user", content: message },
              { role: "assistant", content: ev.reply },
            ]);
            setMessages((m) => [
              ...m,
              { id: mid("asst"), role: "assistant", text: ev.reply },
              {
                id: mid("meta"),
                role: "meta",
                text: tools.length
                  ? `Tools this turn: ${tools.join(" → ")}`
                  : "No tools called this turn",
              },
            ]);
            setLlmOk(true);
            if (layoutTouched) onDashboardChangedRef.current?.();
          } else if (ev.type === "error") {
            gotError = true;
            setStatusLine(null);
            setMessages((m) => [
              ...m,
              { id: mid("err"), role: "error", text: ev.error },
            ]);
            setLlmOk(false);
          }
        }
      }

      if (!gotFinal && !gotError) {
        setMessages((m) => [
          ...m,
          {
            id: mid("err"),
            role: "error",
            text: "Stream ended without a final answer.",
          },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: mid("err"),
          role: "error",
          text: err instanceof Error ? err.message : "Network error",
        },
      ]);
    } finally {
      setBusy(false);
      setStatusLine(null);
      runningToolsRef.current = new Map();
    }
  }

  return (
    <aside
      className={cn("lab-coach", open && "open")}
      aria-hidden={open === false}
    >
      <div className="border-b px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Tool-calling coach. Each tool appears as it runs.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={llmOk ? "secondary" : "destructive"} className="rounded-none">
            LLM {llmOk == null ? "…" : llmOk ? "online" : "offline"}
          </Badge>
          {model ? (
            <Badge variant="outline" className="rounded-none font-mono text-[10px]">
              {model}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-none"
            onClick={() => setShowCatalog((v) => !v)}
          >
            {showCatalog ? "Hide tools" : "Show tools"}
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto rounded-none md:hidden"
              onClick={onClose}
            >
              Close
            </Button>
          ) : null}
        </div>

        {showCatalog ? (
          <Card size="sm" className="mt-3 rounded-none shadow-none ring-1 ring-border/80">
            <CardHeader className="pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Tools ({catalog.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {catalog.map((t) => (
                <div key={t.name} className="flex flex-col gap-0.5">
                  <code className="font-mono text-xs font-medium">{t.name}</code>
                  <span className="text-xs text-muted-foreground">
                    {t.summary}
                  </span>
                </div>
              ))}
              {lastTools.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 border-t pt-2">
                  {lastTools.map((name) => (
                    <Badge key={name} variant="secondary" className="rounded-none">
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="chat-messages flex flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`bubble ${m.role}${m.toolState === "running" ? " tool-running" : ""}${m.toolState === "done" ? " tool-done" : ""}`}
            >
              {m.role === "assistant" ? (
                <CoachMarkdown text={m.text} />
              ) : m.role === "tool" ? (
                <>
                  <CoachMarkdown text={m.text} />
                  {m.widget ? <ChatToolWidget widget={m.widget} /> : null}
                </>
              ) : (
                m.text
              )}
            </div>
          ))}
          {busy && statusLine ? (
            <div className="bubble meta">{statusLine}</div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form className="flex flex-col gap-2 border-t p-3" onSubmit={onSubmit}>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            llmOk === false
              ? "Add LLM keys to .env…"
              : "Ask about load, layout, or Vega charts…"
          }
          disabled={busy}
          className="min-h-20 resize-none rounded-none"
        />
        <Button
          type="submit"
          className="rounded-none"
          disabled={busy || !input.trim() || llmOk === false}
        >
          Ask coach
        </Button>
      </form>
    </aside>
  );
}
