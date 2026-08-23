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
```

`TAVILY_API_KEY` is only needed if you use web search for coach validation.

## Run (Anvia Studio)

Start the local agent + Studio UI from the repo root:

```bash
pnpm agent-studio
```

Then open [http://localhost:4021](http://localhost:4021) in your browser.

This runs `packages/agent` with env loaded from the root `.env` file.

## Data layout

Runtime data is stored under `packages/agent/data/`:

| Path | Purpose |
|------|---------|
| `data/raw/` | Garmin CSV/FIT/GPX exports (input) |
| `data/activities/activities.json` | Normalized activities (merged) |
| `data/readiness/` | Readiness snapshots |
| `data/load/` | Training load reports |
| `data/plans/` | Calendar plans |
| `data/exports/` | Weekly export outputs |

Personal data under `packages/agent/data/` is gitignored.

## Example Studio prompts

Import Garmin data (use an absolute file path):

```text
Import my Garmin file at /path/to/packages/agent/data/raw/Activities.csv
```

Analyze readiness:

```text
Analyze my readiness for the last 14 days.
```

## Monorepo layout

- `packages/agent` — Anvia agent, tools, prompts, and Studio entry (`src/agent.ts`)
