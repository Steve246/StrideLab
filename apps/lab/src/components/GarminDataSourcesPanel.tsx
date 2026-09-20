"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Cloud, FolderSync, KeyRound, Loader2, RefreshCw, Unplug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ConnectStatus, GarminSource, GarminSourceStatus } from "@/lib/garminSource";

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString();
}

function statusLabel(status: ConnectStatus) {
  return {
    disconnected: "Not connected",
    connecting: "Connecting",
    mfa_required: "Verification required",
    connected: "Connected",
    expired: "Session expired",
    error: "Sync error",
  }[status];
}

function manualOriginLabel(status: GarminSourceStatus | null) {
  if (!status || status.manual.origin === "none") return "Not configured";
  if (status.manual.origin === "ui") return "Saved in Lab UI";
  if (status.manual.origin === "env") return "Root .env fallback";
  return "Explicit path";
}

function SourceBadge({ status }: { status: GarminSourceStatus | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Data sources</span>;
  if (status.connect.status === "connected" && status.manual.valid) {
    return <span className="text-xs text-[color:var(--color-teal)]">Live + manual ready</span>;
  }
  if (status.connect.status === "connected") return <span className="text-xs text-[color:var(--color-teal)]">Live sync connected</span>;
  if (status.manual.valid) return <span className="text-xs text-muted-foreground">Manual sync ready</span>;
  return <span className="text-xs text-muted-foreground">Configure a data source</span>;
}

export function GarminDataSourcesPanel({ mode }: { mode: "manual" | "live" }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GarminSourceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<GarminSource | "login" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [vendor, setVendor] = useState<"garmin_connect" | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/garmin/status", { cache: "no-store" });
      const next = (await response.json()) as GarminSourceStatus;
      setStatus(next);
      setSourcePath(next.manual.rawPath ?? "");
    } catch {
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
      const result = (await response.json()) as {
        error?: string;
        valid?: boolean;
        origin?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Could not save the source.");
      await loadStatus();
      setSourceMessage(
        result.valid
          ? "Source saved. You can import now."
          : "Saved, but no DI_CONNECT folder was found yet at that path.",
      );
    } catch (error) {
      setSourceMessage(
        error instanceof Error ? error.message : "Could not save the source.",
      );
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
      setSourceMessage(
        error instanceof Error ? error.message : "Could not reset the source.",
      );
    } finally {
      setSavingSource(false);
    }
  }

  useEffect(() => {
    if (open) void loadStatus();
  }, [open]);

  async function login() {
    setBusy("login");
    setMessage(null);
    try {
      const response = await fetch("/api/garmin/login/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string; status?: string; challengeId?: string };
      if (!response.ok) throw new Error(result.error ?? "Garmin login failed.");
      if (result.status === "mfa_required") {
        setChallengeId(result.challengeId ?? null);
        setMessage("Garmin requested a verification code.");
      } else {
        setPassword("");
        await loadStatus();
        setMessage("Garmin Connect linked. You can sync recent data now.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Garmin login failed.");
    } finally {
      setBusy(null);
    }
  }

  async function resumeLogin() {
    if (!challengeId) return;
    setBusy("login");
    setMessage(null);
    try {
      const response = await fetch("/api/garmin/login/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Garmin verification failed.");
      setChallengeId(null);
      setCode("");
      setPassword("");
      await loadStatus();
      setMessage("Garmin Connect linked. You can sync recent data now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Garmin verification failed.");
    } finally {
      setBusy(null);
    }
  }

  async function sync(source: GarminSource) {
    setBusy(source);
    setMessage(null);
    try {
      const response = await fetch("/api/garmin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adapter: source === "manual_export" ? "manual_export" : "live",
          vendor: source === "garmin_connect" ? "garmin_connect" : undefined,
          source,
          days: 7,
        }),
      });
      const result = (await response.json()) as { error?: string; importedActivities?: number; totalActivities?: number; total?: number };
      if (!response.ok) throw new Error(result.error ?? "Garmin sync failed.");
      await loadStatus();
      setMessage(`Synced ${result.importedActivities ?? result.total ?? 0} activities. Dashboard data is up to date.`);
      window.location.reload();
    } catch (error) {
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
      if (!response.ok) throw new Error(result.error ?? "Disconnect failed.");
      await loadStatus();
      setMessage("Garmin Connect disconnected. Imported history was kept.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disconnect failed.");
    } finally {
      setBusy(null);
    }
  }

  const connected = status?.connect.status === "connected";
  const isManual = mode === "manual";
  const liveEnabled = status?.liveEnabled ?? false;
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 border border-border bg-card px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(true)}
        aria-label={isManual ? "Open manual Garmin import" : "Open live Garmin sync"}
      >
        {isManual ? <FolderSync className="size-4 text-[color:var(--color-teal)]" /> : <Cloud className="size-4 text-[color:var(--color-teal)]" />}
        <span className="text-xs">{isManual ? "Manual import" : "Live sync"}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-l border-border bg-card p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border p-5 pr-14">
            <SheetTitle className="text-xl font-light tracking-tight">{isManual ? "Manual import" : vendor ? "Garmin Connect" : "Live sync"}</SheetTitle>
            <SheetDescription className="text-pretty">
              {isManual
                ? "Import detailed history from a local Garmin DI_CONNECT export. This does not require a Garmin login."
                : !liveEnabled
                  ? "Private integration. Live Garmin is not enabled in this deployment. Use Manual import for now."
                  : vendor
                    ? "Sync recent data through your Garmin Connect account."
                    : "Choose a live data provider. Garmin Connect is available now; more vendors can be added later."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 p-5">
            {loading ? (
              <div className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" /> Reading source status…
              </div>
            ) : null}

            {isManual ? <section className="border border-border p-4" aria-labelledby="manual-source-title">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="manual-source-title" className="font-medium">Manual export</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {status?.manual.valid
                      ? "Valid DI_CONNECT export folder."
                      : "No valid export folder at this path yet."}
                  </p>
                </div>
                {status?.manual.valid ? <Check className="size-4 text-[color:var(--color-optimal)]" /> : <CircleAlert className="size-4 text-[color:var(--color-caution)]" />}
              </div>

              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveSource();
                }}
              >
                <label className="block text-sm font-medium" htmlFor="manual-source-path">
                  Source folder
                </label>
                <p className="text-sm leading-6 text-muted-foreground">
                  Point at your Garmin export folder. A `DI_CONNECT` folder, or a
                  parent folder that contains one, both work. The `.env`
                  `GARMIN_EXPORT_DIR` value stays as the fallback default.
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
                  <Button
                    className="min-h-11 rounded-none"
                    type="button"
                    variant="outline"
                    disabled={savingSource || !status?.manual.hasOverride}
                    onClick={() => void resetSource()}
                  >
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

              {sourceMessage ? (
                <p className="mt-3 border border-border bg-muted p-3 text-sm leading-6" role="status">
                  {sourceMessage}
                </p>
              ) : null}

              <Button className="mt-4 min-h-11 rounded-none" variant="outline" disabled={busy !== null || !status?.manual.valid} onClick={() => void sync("manual_export")}>
                {busy === "manual_export" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Import detail archive
              </Button>
            </section> : null}

            {!isManual && !liveEnabled ? (
              <section className="border border-border bg-muted p-4" aria-labelledby="live-private-title">
                <h2 id="live-private-title" className="font-medium">Private integration</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Live Garmin login is kept in the UI but disabled by default. Enable `GARMIN_LIVE_ENABLED=true` only in a private, authenticated deployment.</p>
              </section>
            ) : null}

            {!isManual && liveEnabled && !vendor ? (
              <section className="space-y-3" aria-labelledby="live-vendors-title">
                <div>
                  <h2 id="live-vendors-title" className="font-medium">Live providers</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Select a provider to configure its account and sync options.</p>
                </div>
                <button
                  type="button"
                  className="flex min-h-24 w-full items-center gap-4 border border-border p-4 text-left transition-colors hover:border-[color:var(--color-teal)] hover:bg-[color:var(--color-teal)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setVendor("garmin_connect")}
                >
                  <span className="flex size-10 items-center justify-center border border-border bg-muted text-[color:var(--color-teal)]" aria-hidden>
                    <Cloud className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">Garmin Connect</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Activities and health data · available</span>
                  </span>
                </button>
              </section>
            ) : null}

            {!isManual && liveEnabled && vendor ? <section className="border border-border p-4" aria-labelledby="connect-source-title">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="connect-source-title" className="font-medium">Garmin Connect</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{statusLabel(status?.connect.status ?? "disconnected")}</p>
                </div>
                {connected ? <Check className="size-4 text-[color:var(--color-optimal)]" /> : <KeyRound className="size-4 text-muted-foreground" />}
              </div>

              {connected ? (
                <>
                  <p className="mt-4 text-sm">{status?.connect.accountLabel ?? "Connected account"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Last sync: {formatDate(status?.connect.lastSyncAt ?? null)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="min-h-11 rounded-none" disabled={busy !== null} onClick={() => void sync("garmin_connect")}>
                      {busy === "garmin_connect" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync live data
                    </Button>
                    <Button className="min-h-11 rounded-none" variant="destructive" disabled={busy !== null} onClick={() => void disconnect()}>
                      {busy === "disconnect" ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />} Disconnect
                    </Button>
                  </div>
                </>
              ) : challengeId ? (
                <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void resumeLogin(); }}>
                  <p className="text-sm">Garmin sent a verification code to your configured device.</p>
                  <label className="block text-xs font-medium" htmlFor="garmin-code">Verification code</label>
                  <input id="garmin-code" className="min-h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" />
                  <Button className="min-h-11 rounded-none" disabled={busy !== null || !code.trim()} type="submit">{busy === "login" ? <Loader2 className="size-4 animate-spin" /> : null} Verify</Button>
                </form>
              ) : (
                <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void login(); }}>
                  <p className="text-xs text-muted-foreground">Credentials go only to the local Garmin connector, not to coach chat or your AI provider.</p>
                  <label className="block text-xs font-medium" htmlFor="garmin-email">Email</label>
                  <input id="garmin-email" className="min-h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
                  <label className="block text-xs font-medium" htmlFor="garmin-password">Password</label>
                  <input id="garmin-password" className="min-h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
                  <Button className="min-h-11 rounded-none" disabled={busy !== null || !email.trim() || !password} type="submit">{busy === "login" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Connect Garmin</Button>
                </form>
              )}
            </section> : null}

            <p className="text-xs leading-5 text-muted-foreground">{isManual ? "Manual import contributes detailed records to the shared training history. Live sync remains available separately for faster recent updates." : "Live providers contribute recent data to the shared training history. Garmin Connect uses an unofficial connector and may stop working if Garmin changes its data services."}</p>
            {message ? <div className="border border-border bg-muted p-3 text-sm" role="status">{message}</div> : null}
          </div>
          <SheetFooter className="border-t border-border p-5">
            {!isManual && vendor ? <Button variant="ghost" className="min-h-11 rounded-none" onClick={() => setVendor(null)}><ArrowLeft className="size-4" /> Providers</Button> : null}
            <Button variant="ghost" className="min-h-11 rounded-none" onClick={() => setOpen(false)}><X className="size-4" /> Close</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
