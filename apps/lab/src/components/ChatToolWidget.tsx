"use client";

import type { ChatWidget } from "@/lib/chatWidgets";
import { Button } from "@/components/ui/button";

export function ChatToolWidget({ widget }: { widget: ChatWidget }) {
  if (widget.kind === "kpi") {
    return (
      <div className="chat-widget">
        <div className="chat-widget-title">{widget.title}</div>
        <div className="kpi-grid chat-widget-kpi-grid">
          {widget.items.map((item) => (
            <div key={item.label} className="kpi">
              <div className="label">{item.label}</div>
              <div className="value">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (widget.kind === "bars") {
    const max = Math.max(...widget.bars.map((b) => b.value), 1);
    return (
      <div className="chat-widget">
        <div className="chat-widget-title">{widget.title}</div>
        <div className="chat-widget-bars">
          {widget.bars.map((b) => (
            <div key={b.label} className="chat-widget-bar-row">
              <span className="chat-widget-bar-label">{b.label}</span>
              <div className="chat-widget-bar-track">
                <div
                  className="chat-widget-bar-fill"
                  style={{ width: `${Math.round((b.value / max) * 100)}%` }}
                />
              </div>
              <span className="chat-widget-bar-val">
                {b.value.toFixed(1)}
                {widget.unit ? ` ${widget.unit}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (widget.kind === "list") {
    return (
      <div className="chat-widget">
        <div className="chat-widget-title">{widget.title}</div>
        <ul className="chat-widget-list">
          {widget.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (widget.kind === "download") {
    return (
      <div className="chat-widget">
        <div className="chat-widget-title">{widget.title}</div>
        <p className="note" style={{ marginTop: 4, marginBottom: 10 }}>
          {widget.summary}
        </p>
        <div className="flex flex-wrap gap-2">
          {widget.downloads.map((d) => (
            <Button
              key={d.href}
              asChild
              size="sm"
              variant="outline"
              className="rounded-none"
            >
              <a href={d.href} download>
                Download {d.label}
              </a>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-widget">
      <div className="chat-widget-title">{widget.title}</div>
      <div className="legend">
        {widget.widgets.map((w) => (
          <span key={w} className="coach-tool-chip active">
            {w}
          </span>
        ))}
      </div>
      {widget.chart ? (
        <p className="note" style={{ marginBottom: 0 }}>
          Vega chart: {widget.chart}
        </p>
      ) : null}
    </div>
  );
}
