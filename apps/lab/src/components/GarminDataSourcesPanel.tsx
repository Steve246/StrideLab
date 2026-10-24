"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Cloud, FolderSync, Loader2, RefreshCw, Unplug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ConnectStatus, GarminSource, GarminSourceStatus } from "@/lib/garminSource";

const KEY_FAQ = "https://developer.garmin.com/gc-developer-program/personal/personal-faq/";

type LiveVendor = "garmin" | null;

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString();
}

function statusLabel(status: ConnectStatus) {
  return {
    disconnected: "Not connected",
    connected: "Connected",
    expired: "API key expired",
    error: "API key is not working",
  }[status];
}

function manualOriginLabel(status: GarminSourceStatus | null) {
  if (!status || status.manual.origin === "none") return "Not configured";
  if (status.manual.origin === "ui") return "Saved in Lab UI";
  if (status.manual.origin === "env") return "Root .env fallback";
  return "Explicit path";
}

export function GarminDataSourcesPanel({ mode }: { mode: "manual" | "live" }) {
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState<LiveVendor>(null);
  const [status, setStatus] = useState<GarminSourceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<GarminSource | "key" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "risk">("risk");
  const [apiKey, setApiKey] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);
  const [debugRequests, setDebugRequests] = useState<
    Array<{ id: string; status: number; path: string; responseBody: string; curl: string }>
  >([]);

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/garmin/status", { cache: "no-store" });
      const next = (await response.json()) as GarminSourceStatus;
      setStatus(next);
      setSourcePath(next.manual.rawPath ?? "");
      if (next.connect.debugRequests?.length) {
        setDebugRequests(next.connect.debugRequests);
      }
    } catch {
      setMessageTone("risk");
      setMessage("Could not read Garmin source status.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSource() {
    setSavingSource(true);
    setSourceMessage(null);
    try {
      const response = await fetch("/api/garmin/source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: sourcePath }),
      });
      const result = (await response.json()) as { error?: string; valid?: boolean };
      if (!response.ok) throw new Error(result.error ?? "Could not save the source.");
      await loadStatus();
      setSourceMessage(result.valid ? "Source saved. You can import now." : "Saved, but no DI_CONNECT folder was found yet at that path.");
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : "Could not save the source.");
    } finally {
      setSavingSource(false);
    }
  }

  async function resetSource() {
    setSavingSource(true);
    setSourceMessage(null);
    try {
      const response = await fetch("/api/garmin/source", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not reset the source.");
      await loadStatus();
      setSourceMessage("Reverted to the .env default (GARMIN_EXPORT_DIR).");
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : "Could not reset the source.");
    } finally {
      setSavingSource(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setVendor(null);
      setMessage(null);
      setApiKey("");
      setDebugRequests([]);
      return;
    }
    void loadStatus();
  }, [open]);

  async function saveKey() {
    setBusy("key");
    setMessage(null);
    try {
      const response = await fetch("/api/garmin/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "This API key is not working.");
      setApiKey("");
      await loadStatus();
      setMessageTone("ok");
      setMessage("API key saved. You can sync recent data now.");
    } catch (error) {
      setMessageTone("risk");
      setMessage(error instanceof Error ? error.message : "This API key is not working.");
    } finally {
      setBusy(null);
    }
  }

  async function sync(source: GarminSource) {
    setBusy(source);
    setMessage(null);
    setDebugRequests([]);
    try {
      const response = await fetch("/api/garmin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adapter: source === "manual_export" ? "manual_export" : "live",
          vendor: source === "garmin_connect" ? "garmin_connect" : undefined,
          source,
          days: source === "garmin_connect" ? status?.syncDays : undefined,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        importedActivities?: number;
        sleepDays?: number;
        warnings?: string[];
        debugRequests?: Array<{ id: string; status: number; path: string; responseBody: string; curl: string }>;
      };
      if (!response.ok) throw new Error(result.error ?? "Garmin sync failed.");
      await loadStatus();
      if (result.warnings?.length) {
        setMessageTone("risk");
        setMessage(
          `Synced ${result.importedActivities ?? 0} activities and ${result.sleepDays ?? 0} sleep nights.\n${result.warnings.join("\n")}`,
        );
        setDebugRequests(result.debugRequests ?? []);
        return;
      }
      window.location.reload();
    } catch (error) {
      setMessageTone("risk");
      setMessage(error instanceof Error ? error.message : "Garmin sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setMessage(null);
    try {
      const response = await fetch("/api/garmin/disconnect", { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not remove the saved key.");
      await loadStatus();
      setMessageTone("ok");
      setMessage("Saved API key removed. Imported history was kept.");
    } catch (error) {
      setMessageTone("risk");
      setMessage(error instanceof Error ? error.message : "Could not remove the saved key.");
    } finally {
      setBusy(null);
    }
  }

  const isManual = mode === "manual";
  const liveEnabled = status?.liveEnabled ?? false;
  const connected = status?.connect.status === "connected";
  const keyProblem = status?.connect.status === "error" || status?.connect.status === "expired";
  const alertBody = message ?? (vendor === "garmin" ? status?.connect.message : null) ?? null;
  const alertTone = message ? messageTone : "risk";
  const sheetTitle = isManual
    ? "Manual import"
    : vendor === "garmin"
      ? "Garmin Connect"
      : "Live sync";

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 border border-border bg-card px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(true)}
        aria-label={isManual ? "Open manual Garmin import" : "Open live sync"}
      >
        {isManual ? <FolderSync className="size-4 text-[color:var(--color-teal)]" /> : <Cloud className="size-4 text-[color:var(--color-teal)]" />}
        <span className="text-xs">{isManual ? "Manual import" : "Live sync"}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-l border-border bg-card p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border p-5 pr-14">
            <SheetTitle className="flex items-center gap-3 text-xl font-light tracking-tight">
              {!isManual && vendor === "garmin" ? (
                <img src="/garmin.svg" alt="" className="h-4 w-auto" />
              ) : null}
              {sheetTitle}
            </SheetTitle>
            <SheetDescription className="text-pretty">
              {isManual
                ? "Import detailed history from a local Garmin DI_CONNECT export. This does not require a Garmin login."
                : !liveEnabled
                  ? "Live sync is off in this deployment. Enable it in `.env` to connect a provider."
                  : vendor === "garmin"
                    ? "Paste your Garmin Personal API key to sync your own data. The key stays on this server."
                    : "Choose a live data provider. Garmin is available now; more vendors can be added later."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 p-5">
            {loading ? (
              <div className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" /> Reading source status…
              </div>
            ) : null}

            {isManual ? (
              <section className="border border-border p-4" aria-labelledby="manual-source-title">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="manual-source-title" className="font-medium">Manual export</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {status?.manual.valid ? "Valid DI_CONNECT export folder." : "No valid export folder at this path yet."}
                    </p>
                  </div>
                  {status?.manual.valid ? <Check className="size-4 text-[color:var(--color-optimal)]" /> : <CircleAlert className="size-4 text-[color:var(--color-caution)]" />}
                </div>

                <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void saveSource(); }}>
                  <label className="block text-sm font-medium" htmlFor="manual-source-path">Source folder</label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Point at your Garmin export folder. A `DI_CONNECT` folder, or a parent folder that contains one, both work.
                  </p>
                  <input
                    id="manual-source-path"
                    className="min-h-11 w-full border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={sourcePath}
                    onChange={(event) => setSourcePath(event.target.value)}
                    placeholder="/path/to/Garmin Data"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button className="min-h-11 rounded-none" type="submit" disabled={savingSource || sourcePath.trim() === (status?.manual.rawPath ?? "")}>
                      {savingSource ? <Loader2 className="size-4 animate-spin" /> : <FolderSync className="size-4" />} Save source
                    </Button>
                    <Button className="min-h-11 rounded-none" type="button" variant="outline" disabled={savingSource || !status?.manual.hasOverride} onClick={() => void resetSource()}>
                      <ArrowLeft className="size-4" /> Reset to .env
                    </Button>
                  </div>
                </form>

                <dl className="mt-4 space-y-1 text-sm leading-6">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Active source</dt>
                    <dd className="font-medium">{manualOriginLabel(status)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Last import</dt>
                    <dd className="tabular-nums">{formatDate(status?.manual.latestImportAt ?? null)}</dd>
                  </div>
                </dl>
                {sourceMessage ? <p className="mt-3 border border-border bg-muted p-3 text-sm leading-6" role="status">{sourceMessage}</p> : null}
                <Button className="mt-4 min-h-11 rounded-none" variant="outline" disabled={busy !== null || !status?.manual.valid} onClick={() => void sync("manual_export")}>
                  {busy === "manual_export" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Import detail archive
                </Button>
              </section>
            ) : null}

            {!isManual && !liveEnabled ? (
              <section className="border border-border bg-muted p-4" aria-labelledby="live-private-title">
                <h2 id="live-private-title" className="font-medium">Live sync is off</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Set `GARMIN_LIVE_ENABLED=true` in the root `.env`, then open Live sync again to choose Garmin and paste your Personal API key.
                </p>
              </section>
            ) : null}

            {!isManual && liveEnabled && !vendor ? (
              <section className="space-y-3" aria-labelledby="live-vendors-title">
                <div>
                  <h2 id="live-vendors-title" className="font-medium">Providers</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Select a provider to configure its API key and sync.</p>
                </div>

                <button
                  type="button"
                  className="flex min-h-24 w-full items-center gap-4 border border-border p-4 text-left transition-colors hover:border-[color:var(--color-teal)] hover:bg-[color:var(--color-teal)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setVendor("garmin");
                    if (status?.connect.debugRequests?.length) {
                      setDebugRequests(status.connect.debugRequests);
                    }
                  }}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center border border-border bg-muted px-2" aria-hidden>
                    <img src="/garmin.svg" alt="" className="h-4 w-auto max-w-full" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">Garmin</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Personal API · available</span>
                    {status?.connect.status === "connected" ? (
                      <span className="mt-1 block text-xs text-[color:var(--color-teal)]">Connected {status.connect.accountLabel}</span>
                    ) : null}
                  </span>
                </button>

                <div
                  className="flex min-h-24 w-full items-center gap-4 border border-dashed border-border p-4 text-left opacity-60"
                  aria-disabled="true"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center border border-border bg-muted text-xs font-medium tracking-wide text-muted-foreground" aria-hidden>
                    COROS
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">COROS</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Coming later</span>
                  </span>
                </div>
              </section>
            ) : null}

            {!isManual && liveEnabled && vendor === "garmin" ? (
              <section className="border border-border p-4" aria-labelledby="garmin-api-title">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="garmin-api-title" className="font-medium">Personal API key</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{statusLabel(status?.connect.status ?? "disconnected")}</p>
                  </div>
                  {connected ? <Check className="size-4 text-[color:var(--color-optimal)]" /> : <CircleAlert className="size-4 text-[color:var(--color-risk)]" />}
                </div>

                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Create a key in Garmin Connect, then paste it in the box below. Garmin shows the key once.{" "}
                  <a className="text-[color:var(--color-teal)] underline-offset-4 hover:underline" href={KEY_FAQ} target="_blank" rel="noreferrer">
                    How to create a key
                  </a>
                </p>

                {status?.connect.keyOrigin === "env" ? (
                  <p className="mt-3 text-sm">Using the API key from local `.env` ({status.connect.accountLabel}).</p>
                ) : null}
                {connected && status?.connect.keyOrigin === "ui" ? (
                  <p className="mt-3 text-sm">
                    Saved key {status.connect.accountLabel}. Last sync:{" "}
                    <span className="tabular-nums">{formatDate(status.connect.lastSyncAt)}</span>
                  </p>
                ) : null}

                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveKey();
                  }}
                >
                  <label className="block text-sm font-medium" htmlFor="garmin-api-key">
                    API key
                  </label>
                  <textarea
                    id="garmin-api-key"
                    className={`min-h-28 w-full resize-y border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      keyProblem || (message && alertTone === "risk")
                        ? "border-[color:var(--color-risk)]"
                        : "border-input"
                    }`}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Paste your Garmin Personal API key here"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={keyProblem || undefined}
                    aria-describedby={alertBody ? "garmin-key-alert" : undefined}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button className="min-h-11 rounded-none" type="submit" disabled={busy !== null || !apiKey.trim()}>
                      {busy === "key" ? <Loader2 className="size-4 animate-spin" /> : null} Validate and save
                    </Button>
                    <Button
                      className="min-h-11 rounded-none"
                      type="button"
                      variant="outline"
                      disabled={busy !== null || !status?.connect.keyOrigin}
                      onClick={() => void sync("garmin_connect")}
                    >
                      {busy === "garmin_connect" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{" "}
                      Sync last {status?.syncDays ?? 7} days
                    </Button>
                    {status?.connect.keyOrigin === "ui" ? (
                      <Button className="min-h-11 rounded-none" type="button" variant="destructive" disabled={busy !== null} onClick={() => void disconnect()}>
                        {busy === "disconnect" ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />} Remove saved key
                      </Button>
                    ) : null}
                  </div>
                </form>
              </section>
            ) : null}

            {alertBody ? (
              <Alert
                id="garmin-key-alert"
                variant={alertTone === "risk" ? "destructive" : "default"}
                className="rounded-none"
                role={alertTone === "risk" ? "alert" : "status"}
              >
                <CircleAlert />
                <AlertTitle>
                  {alertTone === "ok" ? "Garmin sync" : keyProblem ? "API key is not working" : "Sync needs attention"}
                </AlertTitle>
                <AlertDescription>
                  <span className="whitespace-pre-wrap">{alertBody}</span>
                </AlertDescription>
              </Alert>
            ) : null}

            {!isManual && vendor === "garmin" && debugRequests.length > 0 ? (
              <section className="space-y-3 border border-border p-4" aria-labelledby="garmin-debug-title">
                <div>
                  <h2 id="garmin-debug-title" className="font-medium">Dev debug curls</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Replay these in a terminal. Export `GARMIN_PERSONAL_API_KEY` first — curls never embed your secret.
                  </p>
                </div>
                {debugRequests.map((item) => (
                  <div key={`${item.id}-${item.path}`} className="space-y-2">
                    <p className="text-sm font-medium">
                      {item.id} · HTTP {item.status}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground break-all">{item.path}</p>
                    {item.responseBody ? (
                      <pre className="max-h-40 overflow-auto border border-border bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                        {item.responseBody}
                      </pre>
                    ) : null}
                    <pre className="max-h-56 overflow-auto border border-border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
                      {item.curl}
                    </pre>
                  </div>
                ))}
              </section>
            ) : null}

            <p className="text-xs leading-5 text-muted-foreground">
              {isManual
                ? "Manual import contributes detailed records to the shared training history."
                : vendor === "garmin"
                  ? `Garmin sync pulls activities, sleep, daily recovery, and HRV for the last ${status?.syncDays ?? 7} days — the datasets the dashboard uses.`
                  : "Live providers contribute recent data to the shared training history."}
            </p>
          </div>

          <SheetFooter className="border-t border-border p-5">
            {!isManual && vendor ? (
              <Button
                variant="ghost"
                className="min-h-11 rounded-none"
                onClick={() => {
                  setVendor(null);
                  setMessage(null);
                  setApiKey("");
                  setDebugRequests(status?.connect.debugRequests ?? []);
                }}
              >
                <ArrowLeft className="size-4" /> Providers
              </Button>
            ) : null}
            <Button variant="ghost" className="min-h-11 rounded-none" onClick={() => setOpen(false)}>
              <X className="size-4" /> Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
