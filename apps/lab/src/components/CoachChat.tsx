"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant" | "error";
  text: string;
};

export function CoachChat({
  open,
  llmOkInitial,
}: {
  open?: boolean;
  llmOkInitial?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "I'm your running coach via OpenAI (direct). Charts and Resync never use the LLM — ask me about load, pace, plans, or readiness.",
    },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [llmOk, setLlmOk] = useState<boolean | null>(llmOkInitial ?? null);
  const [model, setModel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshHealth = useCallback(async () => {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      const d = (await r.json()) as { llm_ok?: boolean; model?: string | null };
      setLlmOk(Boolean(d.llm_ok));
      setModel(d.model ?? null);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    if (llmOk === false) {
      setMessages((m) => [
        ...m,
        {
          role: "error",
          text: "OpenAI is not configured. Set OPENAI_API_KEY in the repo root .env (Studio is not required).",
        },
      ]);
      void refreshHealth();
      return;
    }

    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await res.json()) as {
        reply?: string;
        model?: string;
        error?: string;
      };

      if (!res.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "error",
            text: data.error ?? `Chat failed (${res.status})`,
          },
        ]);
        setLlmOk(false);
        return;
      }

      const reply = data.reply ?? "(empty reply)";
      if (data.model) setModel(data.model);
      setHistory((h) => [
        ...h,
        { role: "user", content: message },
        { role: "assistant", content: reply },
      ]);
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
      setLlmOk(true);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "error",
          text: err instanceof Error ? err.message : "Network error",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={`app-sidebar${open ? " open" : ""}`}>
      <div className="chat-header">
        <h2>Ask the coach</h2>
        <p>
          Direct OpenAI — Anvia Studio is optional (debugging only). Resync is a
          separate button and never uses the LLM.
        </p>
        <div
          style={{
            marginTop: "0.55rem",
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
          }}
        >
          <span className={`status-pill ${llmOk ? "ok" : "warn"}`}>
            LLM {llmOk == null ? "…" : llmOk ? "online" : "offline"}
          </span>
          {model ? <span className="status-pill ok">{model}</span> : null}
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy ? (
          <div className="bubble assistant">Calling OpenAI…</div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            llmOk === false
              ? "Add OPENAI_API_KEY to .env…"
              : "e.g. Is my load too high? Plan next week."
          }
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim() || llmOk === false}
        >
          Ask coach (OpenAI)
        </button>
      </form>
    </aside>
  );
}
