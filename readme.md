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

Create a `.env` file at the project root:

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your_openai_api_key
TAVILY_API_KEY=your_tavily_api_key
GARMIN_EXPORT_DIR=/path/to/DI_CONNECT
```

`TAVILY_API_KEY` is only needed if you use web search for coach validation.

`GARMIN_EXPORT_DIR` should point at your Garmin export `DI_CONNECT` folder (or a parent that contains it). After setting it, restart Studio — saying **sync** imports from that folder with no path in the prompt.

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
- **Coach chat:** needs `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`, `OPENAI_BASE_URL`) in root `.env`.
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

1. Tool finds `DI-Connect-Fitness/*_summarizedActivities.json` and maps **in code** (units: distance cm→km, duration ms→min, elev cm→m).
2. Merges into `activities/activities.json` by `activity_id`.
3. Also imports enrichment from Wellness / Aggregator / Metrics into `data/enrichment/` for readiness analysis.

FIT files inside `UploadedFiles_*.zip` are not required for this summary import.

**Training load:** session `trimp` / `load_score` is Banister TRIMP (HR × duration). Garmin Training Effect is stored separately as `aerobic_te` / `anaerobic_te` (0–5).

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
