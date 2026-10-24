# PRD: Garmin Connect Personal API Sync

**Product:** StrideLab Lab (`apps/lab`)  
**Status:** Shipped  
**Updated:** 2026-10-24  
**Parent:** [PRD-stridelab.md](./PRD-stridelab.md)  
**Garmin docs:** [Personal API FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/), [Swagger](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)

## 1. Summary

Live sync uses the official Garmin Connect Personal API. The athlete pastes a
Personal API key (or sets `GARMIN_PERSONAL_API_KEY`). Lab mints a 24h Bearer
token and pulls only datasets that feed the dashboard.

## 2. Configuration

```env
GARMIN_LIVE_ENABLED=true
GARMIN_PERSONAL_API_KEY=
GARMIN_PERSONAL_SYNC_DAYS=7   # 1–365; ~84–90 for 12-week graphs
```

### Key storage (two optional sources)

| Source | Where | Notes |
| --- | --- | --- |
| Live sync UI | `packages/agent/data/garmin-personal-key.json` | Owner-only (`0600`), gitignored with `packages/agent/data/` |
| Env | `GARMIN_PERSONAL_API_KEY` in root `.env` | Manual; `.env` is gitignored |

**Precedence:** UI file wins over env. Disconnect in Live sync deletes the file
only; it does not clear `.env`. The app must **not** auto-write `.env` (Next
loads env at process start; see [BUG-GARMIN-PERSONAL-002](./BUGS.md)).

Never commit real keys. Prefer either paste-once into `.env` *or* Live sync — if
both exist, the UI file is what sync uses.

## 3. Dashboard data map (sync scope)

| Lab file | Used for | Personal API |
| --- | --- | --- |
| `activities/activities.json` | Overview, Load, Weekly, ACR, Best, Log | Activity search |
| `enrichment/sleep.json` | Recovery KPIs, Daily Analyzer | Sleep summaries (≤31d chunks) |
| `enrichment/daily.json` | RHR, body battery, stress | Daily summaries v2 (≤365d) |
| `enrichment/health_status.json` | Weekly HRV chart | HRV daily (≤28d chunks) |

**Not synced** (no dashboard consumer): weight, nutrition, SpO2, fitness age,
cycle, profile, HR zones, FIT download, per-activity workouts, standalone
steps/stress/hydration/body-battery reports (those fields come from daily
summaries v2).

## 4. Rate-limit notes

Garmin does not publish a numeric quota. Soft 4xx responses return
`debugRequests` (path, body snippet, curl) and persist on
`connect.debugRequests`. Keeping only four endpoint families keeps request
volume low even for 90-day windows.

## 5. Related bugs

- [BUG-GARMIN-PERSONAL-001](./BUGS.md) — `/weight/all` 400; fixed by dropping unused weight sync.
- [BUG-GARMIN-PERSONAL-002](./BUGS.md) — dual key stores (UI file overrides `.env`); accepted, no auto-`.env` write.
