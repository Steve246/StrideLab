"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  Globe,
  Loader2,
  Radio,
  Server,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { PublicExternalConfig } from "@/lib/externalChannels";

/**
 * External channels.
 *
 * MCP is the channel-agnostic capability layer; Telegram, Studio, Claude and
 * Cursor are interchangeable clients of it. This panel explains how to connect
 * each surface and never exposes tokens or credentials.
 */
export function ExternalMenu() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PublicExternalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || config) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/external", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not read external configuration.");
        return response.json() as Promise<PublicExternalConfig>;
      })
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not read external configuration.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, config]);

  const stdioConfig = config
    ? JSON.stringify(
        {
          mcpServers: {
            stridelab: {
              command: config.mcp.stdio.command,
              args: config.mcp.stdio.args,
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="lab-rail-tab"
          aria-label="External channels"
        >
          <Globe className="size-[18px]" strokeWidth={1.75} />
          <span className="lab-rail-tab-label">External</span>
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-l border-border bg-card p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border p-5 pr-14">
          <SheetTitle className="text-xl font-light tracking-tight">
            External channels
          </SheetTitle>
          <SheetDescription className="text-pretty text-sm leading-6">
            StrideLab exposes one MCP server. Telegram, Anvia Studio, Claude and
            Cursor all connect to it as interchangeable clients, so the tools and
            safety rules never drift between surfaces.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-5">
          {loading ? (
            <div
              className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" /> Reading connection status…
            </div>
          ) : null}

          {error ? (
            <p className="border border-border bg-muted p-3 text-sm leading-6" role="alert">
              {error}
            </p>
          ) : null}

          {config ? (
            <>
              <section
                className="border border-border p-4"
                aria-labelledby="external-mcp-title"
              >
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-[color:var(--color-teal)]" />
                  <h2 id="external-mcp-title" className="font-medium">
                    MCP server
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The capability layer. It publishes{" "}
                  <span className="tabular-nums font-medium text-foreground">
                    {config.mcp.toolCount}
                  </span>{" "}
                  coach and data tools, and never accepts Garmin credentials or
                  MFA codes.
                </p>

                <h3 className="mt-4 text-sm font-medium">Local connection (stdio)</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Use this configuration in Claude, Cursor, Anvia Studio, or any
                  local MCP client.
                </p>
                <div className="mt-2 flex items-start gap-2">
                  <pre className="min-w-0 flex-1 overflow-x-auto border border-border bg-muted p-3 font-mono text-xs leading-5">
                    {stdioConfig}
                  </pre>
                  <CopyButton value={stdioConfig} label="Copy MCP config" />
                </div>

                <h3 className="mt-4 text-sm font-medium">Remote connection (HTTP)</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {config.mcp.http.enabled
                    ? `Enabled at ${config.mcp.http.endpoint}. A bearer token is required and remote callers stay read-only for dashboard changes.`
                    : "Disabled. Set MCP_HTTP_ENABLED=true and MCP_HTTP_AUTH_TOKEN to let remote chat adapters connect."}
                </p>
                <dl className="mt-2 space-y-1 text-sm leading-6">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Endpoint</dt>
                    <dd className="break-all font-mono text-xs">
                      {config.mcp.http.endpoint}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Authentication</dt>
                    <dd>{config.mcp.http.authRequired ? "Bearer token" : "Not configured"}</dd>
                  </div>
                </dl>
              </section>

              {config.showIntegrations ? (
              <section
                className="border border-border p-4"
                aria-labelledby="external-telegram-title"
              >
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-[color:var(--color-teal)]" />
                  <h2 id="external-telegram-title" className="font-medium">
                    Telegram
                  </h2>
                  <span
                    className={`ml-auto text-sm ${
                      config.telegram.status === "enabled"
                        ? "text-[color:var(--color-optimal)]"
                        : "text-muted-foreground"
                    }`}
                  >
                    {config.telegram.status === "enabled"
                      ? "Enabled"
                      : config.telegram.status === "configured"
                        ? "Configured, not enabled"
                        : "Not configured"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Telegram is the first chat adapter. It connects to the same MCP
                  server, so it gets the same tools. Garmin login, MFA, and
                  manual import stay in the Lab UI — the bot links you back
                  instead of accepting credentials.
                </p>

                <dl className="mt-3 space-y-1 text-sm leading-6">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Allowed chats</dt>
                    <dd className="tabular-nums">{config.telegram.allowedChatCount}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  {config.telegram.botUrl ? (
                    <Button asChild className="min-h-11 rounded-none">
                      <a
                        href={config.telegram.botUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Bot className="size-4" /> Open bot
                        <ArrowUpRight className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-11 rounded-none"
                  >
                    <a href={config.lab.url} target="_blank" rel="noreferrer">
                      <Terminal className="size-4" /> Manage Garmin in Lab
                      <ArrowUpRight className="size-4" />
                    </a>
                  </Button>
                </div>

                {config.telegram.status !== "enabled" ? (
                  <p className="mt-3 border border-border bg-muted p-3 text-sm leading-6">
                    To run the bot: set{" "}
                    <code className="font-mono text-xs">
                      TELEGRAM_BOT_TOKEN
                    </code>
                    ,{" "}
                    <code className="font-mono text-xs">
                      TELEGRAM_ALLOWED_CHAT_IDS
                    </code>
                    , and{" "}
                    <code className="font-mono text-xs">TELEGRAM_ENABLED=true</code>
                    , then run{" "}
                    <code className="font-mono text-xs">pnpm telegram</code>.
                  </p>
                ) : null}
              </section>
              ) : null}

              <section
                className="border border-border p-4"
                aria-labelledby="external-observability-title"
              >
                <div className="flex items-center gap-2">
                  <Radio className="size-4 text-[color:var(--color-teal)]" />
                  <h2 id="external-observability-title" className="font-medium">
                    {config.showIntegrations ? "Studio & Lens" : "Anvia Studio"}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {config.showIntegrations
                    ? "Anvia Studio debugs the agent and tools. Anvia Lens receives traces and eval runs."
                    : "Anvia Studio debugs the agent and tools."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="min-h-11 rounded-none">
                    <a href={config.studio.url} target="_blank" rel="noreferrer">
                      <Terminal className="size-4" /> Anvia Studio
                      <ArrowUpRight className="size-4" />
                    </a>
                  </Button>
                  {!config.showIntegrations ? null : config.lens.enabled ? (
                    <Button asChild variant="outline" className="min-h-11 rounded-none">
                      <a href={config.lens.url} target="_blank" rel="noreferrer">
                        <Radio className="size-4" /> Anvia Lens
                        <ArrowUpRight className="size-4" />
                      </a>
                    </Button>
                  ) : (
                    <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
                      Lens not configured (`ANVIA_LENS_BASE_URL`).
                    </span>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border p-5">
          <Button
            variant="ghost"
            className="min-h-11 rounded-none"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="min-h-11 shrink-0 rounded-none"
      aria-label={label}
      onClick={() => {
        const clipboard = navigator.clipboard;
        if (!clipboard) return;
        void clipboard.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}