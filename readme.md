# Steven Personal Running Lab

Personal endurance coaching lab powered by Anvia agents and tools.

## Tools

1. Importing data via Garmin (`garTools`)
2. Analyze training readiness (`readyTools`)
3. Analyze training load and projected future (`fitTools`)
4. Build training on a calendar basis from your target (`coachPersonalTools`)
   - Ultra Marathon focus
   - Ultra Trail focus
   - Running focus (42K, 21K, 10K, 5K)
   - Triathlon focus (IM, Half IM, tri distance)
5. Export data weekly (`exportTools`)
   - Social media — compact stats
   - Details — HTML report

## Prerequisites

- Node.js 20+ (22 recommended)
- [pnpm](https://pnpm.io/) 11+

## Setup

From the repository root:

```bash
pnpm install
```

Create a `.env` file at the project root (see `.env.example`):

```env
LLM_PROVIDER=devscale

# Devscale AI gateway — https://gateway.devscale.id/console/documentation
DEVSCALE_BASE_URL=https://gateway.devscale.id/v1
DEVSCALE_API_KEY=your_devscale_key
DEVSCALE_MODEL=gpt-4.1

# Direct OpenAI — used when LLM_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1

TAVILY_API_KEY=your_tavily_api_key
GARMIN_EXPORT_DIR=/path/to/DI_CONNECT
GARMIN_LIVE_ENABLED=false
```

Set `LLM_PROVIDER=devscale` (default) or `openai`. Keep both key sets in `.env` and switch with that one variable.

## Run (Anvia Studio)

Start the local agent + Studio UI from the repo root:

```bash
pnpm agent-studio
```

Then open [http://localhost:4021](http://localhost:4021) in your browser.

This runs `packages/agent` with env loaded from the root `.env` file.

## Run (Training Lab dashboard)

Next.js dashboard that reads `packages/agent/data/` JSON (no AI on charts). Coach chat talks to **OpenAI directly** (Anvia Studio is optional / for debugging).

```bash
pnpm lab:dev
```

Open [http://localhost:4030](http://localhost:4030).

- **Resync Garmin:** click **Resync Garmin** in the header (uses `GARMIN_EXPORT_DIR`, no LLM). Or CLI: `pnpm --filter agent resync`.
- **Data adapters:** use the separate **Live sync** and **Manual import** controls in the dashboard header. Live sync uses Garmin Connect first for fast recent refreshes; manual `DI_CONNECT` import provides richer detail and historical backfill. Neither path deletes the other adapter's data.
- **Manual-first Docker:** see `docs/PRD-manual-first-observability-evals.md` for VM/Docker deployment, persistent data volumes, private live-login gating, Anvia Lens, and evaluation setup.
- **Coach chat:** `LLM_PROVIDER` + Devscale or OpenAI keys in root `.env` (Studio not required).
- **Studio** (`pnpm agent-studio` on :4021) is only for agent debugging / tool playground — not required for the Lab UI.

## Data layout

Runtime data is stored under `packages/agent/data/`:

| Path | Purpose |
|------|---------|
| `data/raw/` | Optional loose CSV/FIT/GPX exports |
| `data/activities/activities.json` | Normalized activities (merged) |
| `data/enrichment/` | Sleep, daily UDS (RHR/steps), VO2max, race predictions, HRV status |
| `data/readiness/` | Readiness snapshots |
| `data/load/` | Training load reports |
| `data/plans/` | Calendar plans |
| `data/exports/` | Weekly export outputs |
| `data/viz/` | Chart HTML sandbox (weekly distance / load graphs) |

Personal data under `packages/agent/data/` is gitignored.

### Garmin DI_CONNECT import

Preferred source is a full Garmin Connect export folder (`DI_CONNECT`):

1. Tool finds **all** `DI-Connect-Fitness/*_summarizedActivities.json` chunks (Garmin often splits history across `*_1_*`, `*_301_*`, etc. — never rely on one filename) and maps **in code** (units: distance cm→km, duration ms→min, elev cm→m).
2. Merges into `activities/activities.json` by `activity_id`.
3. Also imports enrichment from Wellness / Aggregator / Metrics into `data/enrichment/` for readiness analysis.

FIT files inside `UploadedFiles_*.zip` are not required for this summary import.

**Training load:** session `trimp` / `load_score` is Banister TRIMP (HR × duration). Garmin Training Effect is stored separately as `aerobic_te` / `anaerobic_te` (0–5).

## Garmin Connect login flow

Live sync is optional and uses Garmin Connect as its first vendor through a separate local connector process. The dashboard never sends Garmin credentials to the coach or to the LLM provider.

Install the first live vendor adapter into a repository-local Python environment:

```env
pnpm garmin:setup
```

Then add this to the root `.env`:

```env
GARMIN_CONNECTOR_COMMAND=garmin-connector
```

Start the dashboard from a new shell so it sees the updated environment:

```bash
pnpm lab:dev
```

The dashboard has two separate header controls:

```text
Manual import
  -> Import detail archive

Live sync
  -> choose a live vendor
  -> Garmin Connect
  -> enter email and password
  -> connector authenticates with Garmin
  -> if required, enter MFA code
  -> session/token state is retained by the connector
  -> choose Sync live data
```

The browser calls these server-side routes:

```text
POST /api/garmin/login/start
POST /api/garmin/login/resume
GET  /api/garmin/status
POST /api/garmin/sync
POST /api/garmin/disconnect
```

The repository now includes the first local Garmin Connect adapter under `packages/garmin-connector`. `pnpm garmin:setup` creates `.venv-garmin`; without `GARMIN_CONNECTOR_COMMAND`, the backend uses that repository-local environment automatically. Manual import continues to work independently. The intended operating model is: manual import establishes the detailed archive, then live sync keeps recent data fresh between exports.

The connector stores its serialized Garmin session state at:

```text
~/.running-lab/garmin.json
```

The file is created with owner-only permissions. It contains session state, not a password. Remove it by using **Disconnect** in the Live sync panel or deleting it manually after stopping the dashboard.

Connector smoke test without logging in:

```bash
printf '%s\n' '{"action":"health"}' '{"action":"status"}' | garmin-connector
```

Expected initial status:

```json
{"ok":true,"status":"ready"}
{"ok":true,"status":"disconnected","accountLabel":null,"message":null}
```

The connector is intentionally a narrow local adapter. It does not expose a public HTTP port, does not send credentials to an LLM, and writes protocol responses only to stdout.

## Garmin MCP export

The agent package exposes a local stdio MCP server:

```bash
pnpm --filter agent mcp
```

Register it in Cursor or Claude:

```json
{
  "mcpServers": {
    "running-lab-garmin": {
      "command": "pnpm",
      "args": ["--filter", "agent", "mcp"]
    }
  }
}
```

The MCP server exposes source-neutral tools:

```text
get_data_status
  -> returns active source, manual export status, and live connection status

sync_garmin
  -> syncs the active source
  -> manual mode runs the deterministic DI_CONNECT importer
  -> live mode requires the configured connector boundary

get_training_context
  -> returns the compact derived training snapshot and recent sync ledger
  -> does not return Garmin passwords, cookies, or token/session state
```

The MCP server intentionally does **not** expose `garmin_login(email, password)` or MFA as tools. Login is completed in the local dashboard so credentials do not enter chat history, model prompts, or MCP tool arguments. After login, an MCP client can inspect status and request a sync.

MCP transport flow:

```text
Cursor / Claude
  -> launches packages/agent/scripts/mcp.ts
  -> sends JSON-RPC over stdin
  -> MCP server calls the shared Garmin source service
  -> returns structured JSON over stdout
```

The server must write protocol messages only to stdout; diagnostics belong on stderr. The current implementation is intentionally local stdio, not a network service.

## Long-running sync and context storage

Do not keep a browser request, MCP call, or LLM conversation open for an unlimited live sync. The recommended pattern is a durable worker that runs bounded sync jobs:

```text
scheduled/manual request
  -> create idempotent sync job
  -> fetch a bounded Garmin window
  -> commit a normalized batch
  -> save checkpoint and heartbeat
  -> release the request
  -> resume or schedule the next job
```

The local transition implementation stores:

```text
packages/agent/data/syncs/syncs.json
  -> job status, source, window, checkpoint, counters, warnings

packages/agent/data/context/current.json
packages/agent/data/context/current.md
  -> compact derived training context for agents
```

Canonical activities and enrichment remain the source of truth. The context snapshot is derived and replaceable. This prevents prompts from growing with every sync and lets agents ask for current context through `get_training_context`.

Best-practice cadence is bounded and rate-limit-aware:

- Live quick refresh: on demand or roughly every 15–60 minutes while actively training.
- Background refresh: every 4–6 hours.
- Full backfill: explicit bounded date window, not an endless poll.
- Manual export: periodic archive/detail import, such as weekly or when richer fields are needed.

The worker should use exponential backoff with jitter, persist progress after each page/batch, recover stale jobs, and retain only a bounded sync history. A connected Garmin account means reusable authenticated session state, not a permanently open request.

HR profile for TRIMP (`.env`):
- Leave `ATHLETE_HR_REST` / `ATHLETE_HR_MAX` **empty** → auto from Garmin (RHR median ~90d, HRmax ~p95 of last 180d activities).
- Set numbers to override. `ATHLETE_SEX=male|female` sets Banister `k`.
- Resolved profile is written to `data/enrichment/athlete_hr.json` on sync.

## Example Studio prompts

Sync from `.env` (preferred once `GARMIN_EXPORT_DIR` is set):

```text
sync
```

Or:

```text
Sync my Garmin data
```

Import with an explicit path (overrides env for that call):

```text
Import my Garmin data from /Users/you/Downloads/Garmin Data/DI_CONNECT
```

Analyze readiness (uses activities + enrichment when present):

```text
Analyze my readiness for the last 14 days.
```

## Monorepo layout

- `packages/agent` — Anvia agent, tools, prompts, and Studio entry (`src/agent.ts`)
