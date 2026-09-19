# PRD: Dual-Source Garmin Data

**Product:** Steven Personal Running Lab  
**Surfaces:** `apps/lab` dashboard, `packages/agent` data layer, optional local Garmin connector  
**Status:** Planned — architecture clarified  
**Priority:** High after the repository/data-store foundation  
**Updated:** 2026-09-19  
**Related:** [PRD-agentic-training-lab.md](./PRD-agentic-training-lab.md)

**Deployment/quality plan:** [PRD-manual-first-observability-evals.md](./PRD-manual-first-observability-evals.md)

Manual import is the default deployment path. Live Garmin remains private and
opt-in until the worker/token/MFA lifecycle and authenticated hosting are ready.

---

## 1. Summary

Add two complementary data adapter classes:

1. **Manual Garmin export** — the existing `DI_CONNECT` folder importer, with no
   account credentials and no dependency on live Garmin services.
2. **Garmin Connect adapter** — the first live connector based on the
   GarminSynapse-style unofficial `python-garminconnect` flow, isolated behind a
   server-side boundary.

Both sources must produce the same normalized activity and health records. The
dashboard, analytics, coach, and future MCP tools must not need source-specific
logic.

The product boundary is vendor-agnostic. Garmin Connect is the first live
vendor adapter, not the permanent source model. Future live adapters such as
Coros, Polar, Apple Health, Strava, or another provider must implement the same
live adapter contract without changing the dashboard, repository, analytics, or
agent tools.

The two sources are complementary, not mutually exclusive. Live sync is the
fast path for recent freshness; manual sync is the detail and archive path for
richer fields and historical backfill. Both contribute to the same merged
training history. A failed live login or sync must never make existing data
unavailable, and live sync must never erase richer manual data.

## 2. Problem

The current product supports local exports:

```text
GARMIN_EXPORT_DIR -> DI_CONNECT -> summarizedActivities.json
  -> normalized activities.json -> dashboard
```

This is reliable but requires the user to periodically export and unpack data.
Live Garmin Connect access would reduce that friction, but the unofficial login
stack is sensitive to Garmin endpoint, anti-bot, and MFA changes. Making it the
only source would reduce reliability and make credentials a mandatory product
dependency.

## 3. Goals

| Goal | Success signal |
| --- | --- |
| Preserve manual import | Existing `DI_CONNECT` sync works unchanged |
| Add optional live login | User can connect Garmin Connect from the UI |
| Support MFA | User can complete a two-step verification flow |
| Share one data contract | Dashboard and analytics are source-agnostic |
| Make provenance visible | UI shows source, status, and last sync |
| Preserve history | Disconnect or failed sync never deletes imported data |
| Protect credentials | Passwords and MFA codes never enter the LLM path |
| Combine source strengths | Live refreshes quickly; manual import backfills and preserves detail |
| Prepare for MCP | Future MCP tools call shared source services |
| Fit the Lab UI | New controls preserve the Swiss/teal/shadcn system |
| Work on mobile | Source and MFA flows work at 320px and above |

## 4. Non-goals

- Public multi-user Garmin SaaS.
- Replacing manual `DI_CONNECT` import.
- Implementing Garmin's official API.
- Passing credentials through coach chat or MCP tool arguments.
- Supporting every Garmin endpoint in v1.
- Raw FIT download, device management, or write operations in v1.
- Arbitrary SQL access from the UI or agent.
- Automatically deleting records absent from one sync.
- Multiple Garmin accounts in v1.
- MCP-UI embedded forms.

## 5. Users and jobs

### Primary user

Steven, running the local Training Lab on his own machine.

### Jobs to be done

- "Keep using my Garmin export without setting up a live account."
- "Connect Garmin once and sync recent data from the dashboard."
- "Complete MFA without exposing my code to the coach."
- "If Garmin is down, keep showing my existing data and let me import manually."
- "Know which source last updated my dashboard."

## 6. Product decisions

### 6.1 Manual is the detail and archive adapter

The current `POST /api/resync` endpoint remains supported during migration.
Manual import is preferred for first-time history backfill, detailed activity
fields, and recovery when live Garmin is unavailable. It remains available when
Garmin Connect is connected.

### 6.2 Live is the fast refresh adapter family

Live sync is optimized for a short lookback window, normally seven days. Garmin
Connect is the first implementation, but the backend must address it as a
vendor adapter, not as a special-case source. Live sync is
the preferred action after a workout when the user wants the dashboard updated
quickly. It is not assumed to contain the complete historical archive unless a
live backfill is explicitly requested.

The UI must distinguish:

```text
Sync live data
  -> fast recent refresh

Import manual export
  -> detailed archive/backfill
```

### 6.3 Adapters are additive and non-destructive

Manual import and live sync are independent actions, not mutually exclusive
source selections. The repository keeps one merged history with adapter,
vendor, account, and freshness metadata where practical.

Merge policy:

1. Match activities by `activity_id`.
2. Add new live activities immediately.
3. Fill missing fields on matching records from either source.
4. Never replace a richer non-null manual field with a live `null` or lower-
   fidelity summary.
5. Allow a later manual import to enrich a live summary.
6. Never delete a record because it is absent from a live lookback window.

Health and sleep records use the same additive approach by date.

### 6.4 Login is server-side only

```text
Browser -> Next.js API route -> local connector -> Garmin Connect
```

The browser must not implement Garmin authentication directly.

### 6.5 Credentials never enter AI

Garmin credentials and MFA codes must not be accepted by coach chat, OpenAI or
Devscale tool arguments, Anvia prompts, or MCP tools.

### 6.6 Sync is append/update-only

Incoming records may insert or update matching records. A source must not delete
records just because they are absent from a later response.

### 6.7 One source-neutral adapter contract

Both adapters implement the same service interface:

```ts
type DataAdapterKind = "manual_export" | "live";
type LiveVendor = "garmin_connect" | string;

interface DataAdapter {
  kind: DataAdapterKind;
  vendor: "garmin_export" | LiveVendor;
  getStatus(): Promise<DataAdapterStatus>;
  sync(input?: SyncInput): Promise<SyncResult>;
  disconnect?(): Promise<void>;
}
```

### 6.8 Three-layer ownership model

The system has three explicit layers with different responsibilities:

| Layer | Owns | Must not own |
| --- | --- | --- |
| Python Garmin worker | Garmin login, MFA session, Garmin tokens, refresh, upstream API calls, Garmin normalization | Browser UI, LLM prompts, public network exposure |
| TypeScript backend | Browser API, authorization boundary, source selection, job state, merge/repository writes, redacted status | Garmin password persistence, raw upstream cookies, direct browser-to-Garmin calls |
| Agents and MCP clients | Read status, request safe sync, consume normalized analytics | Credentials, MFA, raw token/session state, arbitrary upstream requests |

The browser talks only to the TypeScript backend. Agents talk only to the
backend-owned source service or its MCP facade. The Python worker is never
directly reachable by a browser, model, or remote MCP client.

### 6.9 Long-lived worker is required for live auth

The Python worker is a long-lived local process, not a new subprocess for every
request. This is required because:

- MFA may pause an in-progress Garmin client.
- A restored client/session should be reused across syncs.
- Concurrent login and sync requests must be serialized.
- Browser fallback resources need explicit startup and shutdown cleanup.

The worker may persist durable state in an OS-secured store, but in-memory
objects such as an active MFA challenge remain owned by the worker. The backend
must address the worker through a private local IPC or localhost HTTP boundary.

### 6.10 Local-first transport, authenticated remote transport later

Use these transports in order:

1. **Local development:** backend launches or supervises the worker through a
   private local process boundary; agents use MCP stdio.
2. **Single-machine production:** worker runs as a managed local service bound
   to `127.0.0.1`; backend calls it over localhost with a random shared secret.
3. **Remote/private deployment:** agents use MCP Streamable HTTP only behind
   HTTPS, authentication, origin validation, and an explicit tenant boundary.

Do not expose the worker port or an unauthenticated MCP endpoint on the LAN.

### 6.11 Garmin authentication uses the library token lifecycle

The Garmin adapter must use `python-garminconnect`'s supported mobile SSO and
DI OAuth lifecycle rather than treating a serialized client dump as the primary
credential store:

```text
Garmin mobile SSO
  -> service ticket
  -> DI access_token + refresh_token
  -> secure tokenstore
  -> proactive refresh before expiry
  -> API calls
```

Requirements:

- Use the library's tokenstore load/dump behavior with a `0700` directory and
  `0600` token file.
- Attempt cached-token resume before credential login.
- Validate cached tokens against a read-only Garmin API call.
- If cached tokens are rejected with `401`/`403`, clear the poisoned local cache
  and perform a fresh login instead of looping on the cache.
- Refresh DI tokens before expiry and persist rotated refresh tokens.
- Clear the plaintext password from the worker client after successful auth.
- Keep access/refresh tokens out of browser responses, logs, MCP results, sync
  ledgers, and context snapshots.
- Treat local logout as token-cache removal only; do not claim Garmin-side token
  revocation unless a verified revocation API is implemented.

The connector must not persist a second incompatible token format unless there
is a migration plan. If a project-specific metadata file is needed, it may store
masked account identity and timestamps, but not token material.

### 6.12 MFA and challenge continuity

The worker is the owner of the live `Garmin` instance during MFA. A new process
per HTTP request is invalid for this flow.

```text
login_start(return_on_mfa=true)
  -> needs_mfa
  -> worker stores pending Garmin client + opaque challenge ID
  -> browser submits code
  -> login_resume(same worker instance)
  -> dump tokenstore
  -> connected
```

MFA requirements:

- Use the library's `prompt_mfa`/`return_on_mfa` and `resume_login` mechanisms.
- Challenge TTL is five minutes by default.
- Failed codes leave the pending challenge available for retry until expiry.
- Expired/restarted worker challenges return `mfa_expired`, not a misleading
  invalid-password message.
- MFA codes are write-only inputs and are never logged or returned.

## 7. Target architecture

```text
                         +--------------------------+
                         | Browser: Training Lab UI |
                         | Data Sources + dashboard |
                         +------------+-------------+
                                      | HTTPS/local HTTP
                                      v
                         +--------------------------+
                         | TypeScript backend       |
                         | Next.js API + source svc  |
                         | auth boundary + job state |
                         +------+---------------+-----+
                                |               |
                     manual    |               | private localhost IPC
                     import    |               v
                                |    +--------------------------+
                                |    | Python Garmin worker     |
                                |    | garminconnect/curl_cffi  |
                                |    | Playwright fallback      |
                                |    | MFA + token/session      |
                                |    +------------+-------------+
                                |                 |
                                +--------+--------+
                                         v
                              +--------------------------+
                              | Source-neutral service   |
                              | normalize / merge / jobs |
                              +------------+-------------+
                                           |
                                           v
                              +--------------------------+
                              | Repository               |
                              | JSON transition / LibSQL |
                              +------------+-------------+
                                           ^
                                           |
                         +-----------------+------------------+
                         | Agents / MCP clients              |
                         | stdio local; HTTP remote later    |
                         +------------------------------------+
```

### Connector recommendation

Start with an isolated Python worker, not the full GarminSynapse dashboard. It
owns `python-garminconnect`, `curl_cffi`, optional Playwright fallback, MFA
state, token refresh, Garmin calls, and upstream response normalization.

The worker exposes a narrow internal protocol. It must not write protocol data
to logs or expose raw Garmin responses by default. The backend performs the
application-level normalization, merge, and repository write so the same logic
is used by manual import and live sync.

The worker lifecycle is managed explicitly:

```text
backend startup
  -> start or discover worker
  -> worker health check
  -> worker loads secure session metadata
  -> worker reports ready / unavailable

backend shutdown
  -> stop accepting new jobs
  -> let current request finish or cancel safely
  -> worker closes browser/session resources
```

Use FastAPI lifespan-style startup/shutdown if the worker is implemented as a
FastAPI service. The worker binds to `127.0.0.1` only and requires an internal
random bearer secret or Unix-domain socket permission.

## 8. Authentication flow

```text
1. User opens the Data Sources surface.
2. Browser submits email/password to /api/garmin/login/start.
3. Server calls the local connector.
4. Connector tries python-garminconnect + curl_cffi.
5. If MFA is required, return mfa_required and an opaque challenge ID.
6. UI submits the code to /api/garmin/login/resume.
7. Connector resumes the pending session.
8. Server persists session/token state securely.
9. UI shows connected status and offers sync.
```

The GarminSynapse pattern may be used as an implementation reference:

- Primary `curl_cffi` browser-TLS impersonation.
- Playwright fallback for browser sign-in challenges.
- Serialized client/session state for refresh.
- Five-minute in-memory MFA challenge expiry.

This remains an unofficial integration and must be labeled as such in the UI.

### 8.1 Detailed login state machine

```text
DISCONNECTED
  -> STARTING_WORKER
  -> AUTHENTICATING
  -> MFA_REQUIRED
  -> AUTHENTICATING
  -> CONNECTED

Any state may transition to ERROR with a redacted reason.
CONNECTED -> REFRESHING -> CONNECTED
CONNECTED -> EXPIRED -> AUTHENTICATING or DISCONNECTED
MFA_REQUIRED -> EXPIRED when the challenge TTL elapses
```

The backend owns the user-visible state. The worker returns a correlation ID,
not its in-memory Garmin object. The challenge record contains only an opaque
ID, expiry, and worker-side reference.

### 8.2 Browser login sequence

```text
User                Browser             Backend             Python worker       Garmin
 |                     |                   |                    |                 |
 | click Connect       |                   |                    |                 |
 |-------------------->|                   |                    |                 |
 |                     | POST login/start  |                    |                 |
 |                     |------------------>|                    |                 |
 |                     |                   | login_start        |                 |
 |                     |                   |------------------->|                 |
 |                     |                   |                    | sign in         |
 |                     |                   |                    |---------------->| 
 |                     |                   |                    |<----------------|
 |                     |                   | MFA_REQUIRED or OK  |                 |
 |                     |<-----------------|<-------------------|                 |
 | enter MFA code      |                   |                    |                 |
 |-------------------->|                   |                    |                 |
 |                     | POST login/resume |                    |                 |
 |                     |------------------>| login_resume       |                 |
 |                     |                   |------------------->|                 |
 |                     |                   |                    | resume          |
 |                     |                   |                    |---------------->| 
 |                     |                   |<-------------------|<----------------|
 |                     | connected status  |                    |                 |
 |                     |<-----------------|                    |                 |
```

The backend never returns a password, cookie, JWT, serialized Garmin client,
or raw upstream headers to the browser.

### 8.3 Sync sequence

```text
User or agent
  -> request sync(source=garmin_connect, days=7)
  -> backend creates sync job and checks no conflicting job exists
  -> worker fetches pages/metrics from Garmin
  -> worker returns typed batches and warnings
  -> backend validates and normalizes batches
  -> backend merges by activity_id/date
  -> repository transaction commits
  -> status and last_sync update
  -> dashboard/MCP receives redacted SyncResult
```

The UI should show stages from backend job events, not infer progress from a
spinner. A sync can finish `partial` while preserving successfully committed
records and listing warnings.

### Credential storage

Preferred order:

1. macOS Keychain or equivalent OS credential store.
2. An OS-abstracted secure store for other local platforms.
3. Restrictive local token/session file only as a documented fallback.

Do not copy GarminSynapse's Base64 password storage. Base64 is obfuscation, not
encryption. Never log passwords, MFA codes, cookies, serialized client state, or
bearer tokens.

### 8.4 Auth state model

The public status model must distinguish:

```text
disconnected
loading_cached_token
refreshing
connected
mfa_required
mfa_expired
cache_rejected
reauth_required
rate_limited
bot_challenge
error
```

`401`/`403` from a cached token is a recovery transition, not a generic login
failure. `429` must produce a retry-after state with backoff. Browser/anti-bot
requirements must be actionable and must not prompt the agent to ask for a
password or MFA code.

## 9. Sync scope

### 9.1 Complementary sync modes

| Mode | Primary job | Typical window | Data expectation |
| --- | --- | --- | --- |
| Live quick sync | Get recent data into the Lab quickly | 7 days | Current Garmin summaries; may omit detail |
| Live backfill | Reduce the gap before a manual export | 30–365 days | Broader live coverage; endpoint-dependent |
| Manual import | Preserve detail and historical completeness | Full export | Richest available export fields |

The normal user journey is:

```text
First setup
  -> manual import for historical baseline

After each workout
  -> live quick sync for fast freshness

Periodically or when detail is missing
  -> manual import for richer fields and archive backfill
```

The dashboard should show both facts when available:

```text
Live refreshed: Today, 08:42
Manual archive: imported 1,248 activities on Sep 19
```

### 9.3 Long-running sync is a service, not an open request

Live sync must not keep a browser request, MCP call, or model context open
indefinitely. The correct operating model is a durable worker that executes
short, bounded sync runs on a schedule or explicit request:

```text
schedule / user / agent
  -> create idempotent sync job
  -> worker runs bounded page/window
  -> persist checkpoint and progress
  -> commit normalized batch
  -> release request
  -> resume or schedule next run
```

Recommended local practice:

- Quick live refresh after a workout or on demand: every 15–60 minutes while
  the user is active, subject to Garmin rate limits.
- Background refresh: every 4–6 hours.
- Full live backfill: explicit action, bounded by a date window, not an endless
  poll.
- Manual export: occasional archive/detail import, such as weekly or when a
  new Garmin export is available.

The worker must use exponential backoff with jitter for transient failures and
must not poll Garmin continuously. A connected account does not mean an open
Garmin request; it means secure session state is available for the next bounded
sync.

### 9.4 Durable sync ledger and checkpoints

Every sync writes a durable ledger record under the repository/data store:

```text
syncs.json
  -> job_id, source, mode, requested_window
  -> status, started_at, completed_at, heartbeat_at
  -> checkpoint/cursor, pages_completed, records_seen
  -> inserted, updated, warnings, redacted error code
```

The ledger is append-oriented and bounded by retention policy. The latest
record for each source is the operational state; the history is for recovery,
debugging, and user-visible freshness.

Checkpoint requirements:

- A checkpoint is written after each successfully normalized/committed batch.
- Restart resumes from the checkpoint or safely replays an idempotent batch.
- A job has a stable idempotency key so client retries do not duplicate work.
- Only one live sync job may own a Garmin account at a time.
- A stale `running` job is recoverable after a heartbeat timeout.
- Partial completion is visible and does not roll back already committed valid
  records.

### 9.5 Durable context versus raw context

Do not use the LLM conversation, process memory, or raw Garmin payloads as the
long-term context store. Store three layers instead:

1. **Canonical records:** normalized activities and dated health/enrichment
   records used by deterministic analytics.
2. **Sync ledger:** source freshness, job history, checkpoints, warnings, and
   provenance needed to explain how records arrived.
3. **Context snapshot:** a compact generated JSON/Markdown summary containing
   current data freshness, recent activity window, recovery signals, load
   summary, and known gaps. Agents fetch this snapshot through tools rather than
   receiving the entire database on every prompt.

The context snapshot is derived and replaceable. It must never be the only copy
of athlete data and must not contain credentials, cookies, or raw session state.

Recommended files during the JSON transition:

```text
data/syncs/syncs.json
data/context/current.json
data/context/current.md
```

When LibSQL is adopted, these become `sync_runs`, `sync_checkpoints`, and
`ai_context_packs` tables with the same logical contract.

### 9.2 Parity requirement

Live and manual data must converge into the same analytics contract, but they do
not need identical raw payloads. The acceptance target is dashboard parity for
the fields used by load, recovery, readiness, and coaching. Manual-only fields
may remain as richer overflow data.

### v1 live sync

- Recent activities and activity summaries.
- Daily summaries.
- Sleep.
- HRV where available.
- Resting heart rate.
- Body battery and stress where available.
- VO2 max and race predictions where available.

### Deferred

- Raw FIT downloads.
- Full second-by-second streams.
- Device management.
- Arbitrary SQL.
- Garmin write operations.

Default request:

```ts
type LiveSyncInput = {
  days?: number;
  includeHealth?: boolean;
  includeActivities?: boolean;
};
```

Defaults: `days = 7`, both include flags true. The UI must offer a separate
backfill control rather than silently expanding every quick sync.

Result envelope:

```ts
type SyncResult = {
  source: "manual_export" | "garmin_connect";
  status: "success" | "partial" | "failed";
  importedActivities: number;
  updatedActivities: number;
  totalActivities: number;
  enrichmentDays: number;
  latestActivityDate: string | null;
  startedAt: string;
  completedAt: string;
  warnings: string[];
};
```

## 10. Data model and merge rules

Normalized records should include provenance:

```ts
type ActivitySourceMetadata = {
  source: "manual_export" | "garmin_connect";
  sourceFile?: string;
  sourceAccount?: string;
  importedAt: string;
  lastSeenAt: string;
};
```

Rules:

- Primary key is Garmin `activity_id`.
- Incoming matching records update existing records using the complementary
  merge policy below.
- New records are inserted.
- Existing records are not deleted.
- Live data may add recent activities or fill missing fields on a manual record.
- Manual import may enrich or replace a live summary when it contains richer
  fields.
- A live `null` never replaces a non-null manual value.
- A manual `null` never removes a valid live value.
- Merged records retain provenance for both observations when both contribute.
- Health records are keyed by date plus source/account where needed.
- Dashboard builders consume one normalized repository contract.

## 11. UI/UX plan

### 11.1 Governing design system

The existing local `training-lab-ui` and `swiss-design` skills govern the visual
language:

- Teal is the single product accent.
- Swiss grid and restrained square panels remain intact.
- Use existing shadcn/ui and Tailwind primitives.
- No purple gradients, generic SaaS cards, or decorative blobs.
- Preserve the current rail, dashboard, chart, and coach layout.
- Use semantic green/amber/red only for status or load meaning.
- Keep motion restrained and respect `prefers-reduced-motion`.

### 11.2 UI Skills cross-reference

The [UI Skills catalog](https://www.ui-skills.com/) is an external research and
review tool. It does not override the local product system.

Use at most three skills for one UI task:

1. [`ui-skills-root`](https://www.ui-skills.com/skills/ibelick/ui-skills-root)
   routes the task to the smallest relevant skill.
2. [`frontend-ui-engineering`](https://www.ui-skills.com/skills/addyosmani/frontend-ui-engineering)
   informs component composition, responsive behavior, state handling, and accessibility.
3. [`improve-ui`](https://www.ui-skills.com/skills/ibelick/improve-ui)
   performs a later read-only audit of one coherent rendered surface.

Local guidance remains authoritative:

```text
training-lab-ui / swiss-design
  -> product visual language
UI Skills root / frontend-ui-engineering
  -> focused external guidance
make-interfaces-feel-better / web-design-guidelines / hallmark
  -> local polish and review
```

Relevant UI Skills playbook references:

- [44px touch targets](https://www.ui-skills.com/playbook/use-large-touch-targets)
- [Concentric border radius](https://www.ui-skills.com/playbook/use-concentric-border-radius)
- [Tabular numerals](https://www.ui-skills.com/playbook/use-tabular-nums-for-data)
- [Text balance](https://www.ui-skills.com/playbook/use-text-balance)

### 11.3 Placement

Add two independent controls in the existing dashboard header, next to the LLM
status badge: **Manual import** and **Live sync**. Each opens only its own
focused workflow panel. Do not combine both workflows into one tabs menu or put
a credential form in the narrow rail.

The live control is labeled **Live sync**, not Garmin, because it is a vendor
hub. Its first screen lists live vendors. Selecting a vendor opens that vendor's
configuration and sync menu:

```text
Live sync
  -> Live providers
     -> Garmin Connect
        -> Connect account / MFA
        -> Sync live data
        -> Disconnect
```

Future vendors appear beside Garmin Connect without changing the top-level
navigation or manual import workflow.

Do not present Manual export and Garmin Connect as exclusive radio choices or a
single active-source switch. Present them as two independent sync adapters. Both
actions remain available at the same time:

```text
Fast path
[Sync live data]       Garmin Connect adapter · connected · 7-day window

Detail path
[Import manual export] Valid DI_CONNECT adapter · 1,248 activities · full archive
```

Desktop:

```text
[Garmin source badge] [LLM status] [Show coach]
```

Mobile:

```text
header source trigger -> full-height Data Sources sheet
```

### 11.4 Adapter panels

Use `LabPanel` styling and composed components. Manual import and Live sync are
separate header actions and separate sheets. The Live sync sheet has a provider
selection state and a provider-detail state.

```text
Live sync
Choose a live data provider.

[Garmin Connect]

Garmin Connect
Activities and health data · available

<select Garmin Connect>

Garmin Connect
Use live sync for fast recent updates and manual export for richer detail and
historical backfill. Both sources contribute to the same training history.

[Manual export] [Garmin Connect]

Live refresh
Garmin Connect
Connected as s••••@example.com
Last live sync: Today, 08:42
Recent window: 7 days

[Sync live data] [Disconnect]

Manual detail and archive
DI_CONNECT folder
/path/to/Garmin Data
Valid export · 1,248 activities · imported Sep 19
[Import manual export] [Backfill detail]
```

The UI must show live freshness and manual archive freshness separately. It must
not imply that connecting Garmin disables manual import. A future vendor adapter
should appear as another live adapter card without changing this layout.

### 11.5 Source states

Manual:

```text
not configured | configured and valid | configured but missing
importing | imported | error
```

Garmin Connect:

```text
not connected | connecting | MFA required | connected
syncing | token expired | sync error | disconnected
```

Every state needs text, a recovery action when possible, and a non-color cue.

### 11.6 Login and MFA

Use the existing Radix/shadcn dialog primitive with accessible title and
description, focus trapping, Escape behavior, and visible field labels.

Credentials step:

```text
Connect Garmin Connect
Your credentials are sent only to the local Training Lab connector.
They are not sent to coach chat or your AI provider.

Email
Password

[Cancel] [Continue]
```

MFA step:

```text
Verification required
Garmin sent a verification code to your configured device.

Verification code

[Back] [Verify]
```

Use `autocomplete="username"`, `autocomplete="current-password"`, and
`autocomplete="one-time-code"` where supported. Do not close the dialog on a
recoverable error.

### 11.7 Progress and errors

Show meaningful stages rather than an indefinite spinner:

```text
Connecting to Garmin Connect
Fetching activities
Fetching health data
Merging 12 activities
Updating dashboard
```

Errors must explain what happened and what to do next. Never show raw Python
traces, cookies, or upstream authentication internals.

Examples:

```text
Manual export folder not found.
Check GARMIN_EXPORT_DIR and try again.
```

```text
Garmin Connect is temporarily unavailable.
Your existing dashboard data is still available.
Try again later or use manual export.
```

### 11.8 Responsive and accessibility requirements

- Data Sources becomes a full-height sheet on narrow screens.
- Source cards stack vertically.
- Critical controls have a minimum 44px touch target.
- Test at 320px, 768px, 1024px, and 1440px.
- Use `aria-live="polite"` for sync progress.
- Use `aria-live="assertive"` for authentication errors.
- All controls are keyboard-operable.
- Status is not conveyed by color alone.
- Use `tabular-nums` for counts and changing timestamps.
- Use `text-balance` for headings and `text-pretty` for explanatory copy.
- Respect reduced motion.

## 12. API contract

```text
GET  /api/garmin/status
POST /api/garmin/source
POST /api/garmin/login/start
POST /api/garmin/login/resume
POST /api/garmin/sync
POST /api/garmin/disconnect
```

`/api/resync` remains as a compatibility route for the manual adapter during
migration. `POST /api/garmin/sync` accepts an explicit adapter kind and vendor so
the action does not depend on mutable global source state.

### 12.1 Backend-to-worker internal contract

The internal worker protocol is separate from the public browser and MCP API.
It is versioned and authenticated:

```ts
type WorkerRequest =
  | { version: 1; requestId: string; action: "health" }
  | { version: 1; requestId: string; action: "login_start"; email: string; password: string }
  | { version: 1; requestId: string; action: "login_resume"; challengeId: string; code: string }
  | { version: 1; requestId: string; action: "status" }
  | { version: 1; requestId: string; action: "sync"; days: number }
  | { version: 1; requestId: string; action: "logout" };
```

Worker responses must be typed and redacted:

```ts
type WorkerResponse = {
  version: 1;
  requestId: string;
  ok: boolean;
  status?: "ready" | "connected" | "mfa_required" | "expired" | "error";
  challengeId?: string;
  accountLabel?: string;
  activityBatches?: Array<Record<string, unknown>>;
  warnings?: string[];
  errorCode?: string;
  errorMessage?: string;
};
```

Rules:

- `requestId` is used for logs and correlation, never as a secret.
- Password and MFA code are write-only inputs and never echoed.
- Worker stdout is protocol-only for stdio mode; diagnostics use stderr.
- Health checks must not force a Garmin login.
- Sync jobs are idempotent by `(source, account, activity_id)`.
- Backend timeouts cancel the job or mark it unknown; they do not delete data.

### 12.2 Public backend contract

Public routes return application state, not worker state:

```text
GET  /api/garmin/status
POST /api/garmin/source
POST /api/garmin/login/start
POST /api/garmin/login/resume
POST /api/garmin/sync
GET  /api/garmin/sync/:jobId
POST /api/garmin/disconnect
```

`POST /api/garmin/sync` should return a job ID when sync can exceed the normal
request timeout. The first local implementation may await the job, but the
contract must support polling or streamed progress before remote deployment.

### Status response

```json
{
  "activeSource": "manual_export",
  "manual": {
    "configured": true,
    "valid": true,
    "latestImportAt": "2026-09-19T08:42:00Z"
  },
  "connect": {
    "status": "disconnected"
  }
}
```

### Login behavior

`POST /api/garmin/login/start` accepts credentials only over the local server
boundary. It returns either `connected` or `mfa_required` with an opaque,
server-side challenge ID. It must not return credentials or session state.

`POST /api/garmin/login/resume` accepts only the opaque challenge ID and MFA
code, then returns redacted connection status.

### Disconnect behavior

Disconnect clears local session/token material and pending MFA state, but keeps
all imported activities and health records. If manual export is configured, it
becomes the active source.

## 13. MCP and agent integration

The agent must not expose credential-bearing tools such as
`garmin_login(email, password)`.

Future source-neutral tools may be:

```text
get_data_status
sync_garmin
set_data_source
disconnect_garmin
```

They call the same application service used by the UI. `sync_garmin` accepts a
safe adapter selection such as `manual_export` or `live`, plus an optional live
vendor (`garmin_connect` in v1). The agent reports status but cannot request or
handle credentials. It must not infer one adapter from a global source toggle.

### 13.1 Agent permission model

Agents receive least-privilege, source-neutral capabilities:

| Capability | Default | Reason |
| --- | --- | --- |
| `get_data_status` | allowed | Read-only operational state |
| `sync_garmin` | allowed with confirmation | Causes upstream calls and writes data |
| `get_sync_status` | allowed | Read-only job progress |
| `set_data_source` | explicit confirmation | Changes future sync behavior |
| `disconnect_garmin` | explicit confirmation | Removes connection state |
| `garmin_login` | prohibited | Credential-bearing operation |
| arbitrary Garmin endpoint | prohibited | Prevents data exfiltration and instability |

An agent must not infer that `sync_garmin` means login. If the source is not
connected, it returns a structured action-needed result:

```json
{
  "status": "action_required",
  "action": "connect_garmin_in_lab_ui",
  "message": "Connect Garmin Connect in the Training Lab Data Sources panel first."
}
```

### 13.2 MCP transport design

Local clients use stdio because the MCP specification says the client launches
the server subprocess and the server must write only JSON-RPC messages to
stdout. This is the default for Cursor, Claude Desktop, and local agent runners.

Remote clients use Streamable HTTP only in a later deployment. That endpoint
must:

- Bind to localhost when local.
- Validate `Origin` to prevent DNS rebinding.
- Require authentication for every request.
- Use HTTPS outside localhost.
- Validate token audience and scopes.
- Never pass an MCP access token through to Garmin.
- Keep the Garmin worker private behind the backend.

MCP authorization guidance applies to HTTP transports; stdio should use local
process permissions and environment/configuration rather than browser-style
OAuth. See the references in §20.

### 13.3 MCP request flow

```text
Local MCP client
  -> launches Running Lab MCP server over stdio
  -> tools/list
  -> get_data_status
  -> sync_garmin(days=7)
  -> backend/source service checks active source
     -> manual: DI_CONNECT importer
     -> live: backend job -> Python worker -> Garmin
  -> repository commit
  -> structured result returned to agent
```

The agent sees counts, dates, warnings, and action-needed messages. It does not
see passwords, MFA codes, cookies, raw token state, or unconstrained Garmin
responses.

### 13.4 External AI access modes

| Client location | Recommended transport | Requirements |
| --- | --- | --- |
| Same laptop | MCP stdio | Client can launch local process |
| Same private network | Streamable HTTP over Tailscale/VPN | Auth, origin validation, HTTPS/private network |
| Public hosted AI | Authenticated remote MCP | HTTPS, OAuth/OIDC, tenant isolation, rate limits |

The first release targets same-laptop stdio. Do not tell users that a hosted
LLM can reach localhost without a bridge or authenticated remote deployment.

## 14. Implementation phases

### Phase 0: Foundation

- Define source-neutral types and provenance fields.
- Confirm the JSON-to-LibSQL repository boundary.
- Add merge-by-activity-ID tests.
- Add durable sync ledger, job idempotency key, heartbeat, and checkpoint contract.
- Add compact current context snapshot generated from canonical records.

### Phase 1: Status and UI shell

- Add source status service and `GET /api/garmin/status`.
- Add header source badge and Data Sources panel.
- Show manual path validity and existing last import.
- Keep current manual resync operational.

### Phase 2: Manual adapter hardening

- Put existing manual resync behind the source abstraction.
- Preserve `/api/resync`.
- Return explicit validation and provenance results.

### Phase 3: Isolated live connector

- Add long-lived Python worker package or adapter.
- Implement login start/resume/status/logout.
- Implement worker health, startup/shutdown, serialized request handling, token/session persistence, and MFA expiry.
- Add redacted structured errors.
- Add internal protocol version and request correlation.
- Add bounded sync windows, pagination checkpoints, retry/backoff, and worker
  heartbeat.
- Use the library tokenstore, cached-token validation, DI refresh,
  poisoned-cache recovery, and local logout semantics.
- Keep one worker process alive across `login_start`, `login_resume`, refresh,
  and sync requests.

### Phase 4: Live activity sync

- Fetch recent activities.
- Normalize and merge into the existing activity contract.
- Add progress stages, partial success, and retry behavior.

### Phase 5: Health enrichment

- Add daily summaries, sleep, HRV, RHR, body battery, stress, VO2 max, and race predictions where supported.
- Ensure readiness and dashboard builders consume normalized records.

### Phase 6: MCP and agent exposure

- Add shared tool registry.
- Add source-neutral status/sync tools.
- Add stdio MCP server against the repository layer.
- Document Cursor/Claude setup without credential-bearing tools.
- Add confirmation semantics for writes and source changes.
- Add `action_required` responses instead of login prompts.
- Add Streamable HTTP only after local security model is complete.

### Phase 7: Hardening

- Add OS keychain storage.
- Add redacted observability.
- Add freshness warnings and manual fallback copy.
- Complete JSON-to-LibSQL migration when the main roadmap reaches that phase.
- Add scheduled refresh with rate-limit-aware cadence and stale-job recovery.
- Apply retention to sync logs while retaining canonical athlete records.

## 15. Proposed files

```text
apps/lab/src/components/GarminSourceBadge.tsx
apps/lab/src/components/GarminDataSourcesPanel.tsx
apps/lab/src/components/GarminLoginDialog.tsx
apps/lab/src/components/GarminMfaStep.tsx
apps/lab/src/components/GarminSyncProgress.tsx

apps/lab/src/app/api/garmin/status/route.ts
apps/lab/src/app/api/garmin/source/route.ts
apps/lab/src/app/api/garmin/login/start/route.ts
apps/lab/src/app/api/garmin/login/resume/route.ts
apps/lab/src/app/api/garmin/sync/route.ts
apps/lab/src/app/api/garmin/disconnect/route.ts

packages/agent/src/garmin/source.ts
packages/agent/src/garmin/sourceStatus.ts
packages/agent/src/garmin/normalize.ts
packages/agent/src/garmin/merge.ts
packages/agent/src/garmin/connectClient.ts
packages/agent/src/garmin/syncLedger.ts
packages/agent/src/garmin/contextSnapshot.ts

packages/garmin-connector/src/garmin_connector/auth.py
packages/garmin-connector/src/garmin_connector/client.py
packages/garmin-connector/src/garmin_connector/normalize.py
packages/garmin-connector/src/garmin_connector/storage.py
packages/garmin-connector/src/garmin_connector/server.py
packages/garmin-connector/src/garmin_connector/checkpoints.py
```

Reuse existing UI primitives and avoid creating duplicate dialog, sheet, alert,
button, or panel components.

## 16. Testing plan

### Unit and connector tests

- Manual path validation and missing path.
- Multiple summary-file import.
- Activity normalization and merge behavior.
- Provenance metadata.
- Login success and invalid credentials.
- MFA required, success, failure, and expiry.
- Token refresh and Garmin unavailable.
- Partial health response and rate limiting.
- Error redaction.
- Disconnect preserving records.

### API tests

- Status with no source.
- Status with manual source.
- Login does not log or return secrets.
- MFA resume.
- Sync while disconnected.
- Partial sync failure.
- Disconnect fallback to manual.

### UI tests

- Open Data Sources panel.
- Select each source.
- Login success and failure.
- MFA transition and focus.
- Sync progress and completion.
- Manual fallback after live failure.
- Disconnect confirmation.
- Keyboard operation and mobile layout.

## 17. Security requirements

- Credentials only enter server-side login routes.
- No credentials in URLs, chat, prompts, tool arguments, or logs.
- Local connector binds to localhost.
- Token/session storage uses restrictive permissions or OS keychain.
- Disconnect clears session/token material.
- Existing data survives disconnect and failed sync.
- Errors redact upstream authentication details.
- UI explicitly describes the connector as unofficial and potentially breakable.
- Python worker is not browser-accessible and is bound to localhost or a Unix socket.
- Backend-to-worker requests use a private bearer secret or OS-level socket permissions.
- Remote MCP validates Origin, HTTPS, token audience, scopes, and tenant context.
- MCP tokens are never forwarded to Garmin or any upstream service.
- Login, sync, and disconnect operations are audit-correlated without secrets.

Suggested disclosure:

> Garmin Connect sync uses an unofficial connector and may stop working if
> Garmin changes its sign-in or data services. Manual export remains available
> as a fallback.

## 18. Acceptance criteria

### Product

- [ ] Manual `DI_CONNECT` import remains functional.
- [ ] Garmin Connect is optional.
- [ ] Live quick sync provides fast recent freshness without requiring a manual export.
- [ ] Manual import provides richer detail and historical backfill without disabling live sync.
- [ ] Live and manual records merge into one additive history.
- [ ] A live null or lower-fidelity field cannot erase a richer manual field.
- [ ] User can see active source, status, and last sync.
- [ ] User can connect, complete MFA, sync, and disconnect.
- [ ] Live sync reaches the existing activity and analytics pipeline.
- [ ] Existing records remain after disconnect or failed sync.
- [ ] Source provenance is stored.
- [ ] Manual fallback is visible when live sync fails.

### UI/UX

- [ ] `training-lab-ui` remains the governing visual system.
- [ ] UI Skills MCP is available for focused research and audits.
- [ ] Components use composition rather than one over-configured Garmin panel.
- [ ] Loading, error, empty, MFA, connected, expired, and disconnected states are specified.
- [ ] Critical controls have at least 44px touch targets.
- [ ] Login and MFA use accessible dialog/sheet primitives.
- [ ] UI copy uses sentence case and stable action verbs.
- [ ] UI works at 320px, 768px, 1024px, and 1440px.
- [ ] Reduced motion is supported.
- [ ] Existing teal/Swiss/shadcn language is preserved.

### Security

- [ ] Passwords and MFA codes never enter LLM prompts or tool arguments.
- [ ] Sensitive auth material is not logged.
- [ ] Local connector binds to localhost.
- [ ] Disconnect clears session/token material.
- [ ] Storage is not Base64-only obfuscation.

### Architecture

- [ ] Manual and live sources implement a common contract.
- [ ] Garmin login resumes cached DI tokens before requesting credentials.
- [ ] DI access/refresh tokens auto-refresh and persist safely.
- [ ] Rejected cached tokens self-heal through cache clear and fresh login.
- [ ] MFA challenge survives the `login_start` to `login_resume` boundary.
- [ ] Local logout clears the tokenstore without claiming remote revocation.
- [ ] Manual and live adapters remain independently actionable, not a single source toggle.
- [ ] Live quick sync and manual detail/archive sync have separate windows and status timestamps.
- [ ] New live vendors can be added behind the adapter contract without dashboard or MCP changes.
- [ ] Dashboard builders are source-agnostic.
- [ ] MCP and agent tools use shared application services.
- [ ] Credential-bearing login is not an AI tool.
- [ ] Source behavior can migrate from JSON to LibSQL without a UI rewrite.

## 19. Open decisions before implementation

1. **Worker framework:** minimal Python worker with standard library HTTP/stdio,
   or FastAPI/Uvicorn. Recommended: FastAPI/Uvicorn for lifespan, health, and
   typed internal routes; keep the worker surface private.
2. **Worker supervision:** backend-spawned process for local development, or a
   separately managed process for long-running use. Recommended: support both
   through one health-checked worker client.
3. **Repository timing:** implement temporarily against JSON or wait for LibSQL.
   Recommended: define the contract now and avoid deep persistence duplication.
4. **Credential storage:** use macOS Keychain first or a restricted token file.
   Recommended: Keychain-backed storage with an isolated fallback.
5. **Manual path UX:** retain `.env` or add upload/folder selection. Recommended:
   retain `.env` in v1 and make its status visible.
6. **Live sync scope:** activities only or activities plus health. Recommended:
   activities first, then health enrichment behind the same contract.

## 20. Design references and rationale

This plan uses the following external system-design references:

### Model Context Protocol transports

[MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

Applied decisions:

- stdio first for same-machine clients.
- Streamable HTTP later for independent remote servers.
- MCP server stdout is protocol-only.
- Local HTTP binds to `127.0.0.1`.
- HTTP deployments validate `Origin` and authenticate requests.

### MCP authorization

[MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)

Applied decisions:

- Do not apply browser OAuth to local stdio unnecessarily.
- If HTTP MCP is added, use a proper authorization boundary.
- Validate token audience and never pass client tokens through to Garmin.
- Keep Garmin credentials in the product's UI/backend flow, not MCP.

### Twelve-Factor processes

[Twelve-Factor processes](https://12factor.net/processes)

Applied decisions:

- Treat the worker as a process type with explicit lifecycle and supervision.
- Keep durable session/job state in a backing store rather than relying only on
  an arbitrary request subprocess.
- Do not use sticky request routing as the MFA/session design.

### FastAPI lifespan

[FastAPI lifespan events](https://fastapi.tiangolo.com/advanced/events/)

Applied decisions:

- If FastAPI is selected, initialize shared worker resources before serving
  requests and close browser/session resources on shutdown.
- Health/readiness endpoints distinguish worker process readiness from Garmin
  account authentication.

### Design-system references

The UI follows the existing local `training-lab-ui` system and the planned UI
Skills cross-reference in §11.2. The architecture above deliberately keeps
credential operations in a focused Data Sources flow, uses explicit state
labels, and gives agents action-needed responses rather than attempting to turn
MCP into a credential form.
