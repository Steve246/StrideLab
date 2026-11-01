# PRD: StrideLab Lab (Personal API + insights)

**Product:** StrideLab Lab (`apps/lab`)  
**Status:** Shipped  
**Updated:** 2026-10-26  
**Garmin docs:** [Personal API FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/), [Swagger](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)  
**Also:** [README](../README.md) · [BUGS.md](./BUGS.md) · [GOING-PUBLIC.md](./GOING-PUBLIC.md)

This is the product PRD for Live sync and the dashboard features that read that data.

## 1. Live sync

The athlete pastes a Personal API key (or sets `GARMIN_PERSONAL_API_KEY`). Lab mints a 24h Bearer token and pulls only datasets the dashboard uses. The key is **read-only**. Lab does not send workouts to the watch.

```env
GARMIN_LIVE_ENABLED=true
GARMIN_PERSONAL_API_KEY=
GARMIN_PERSONAL_SYNC_DAYS=7   # 1–365; ~84–90 for 12-week graphs
```

| Source | Where | Notes |
| --- | --- | --- |
| Live sync UI | `packages/agent/data/garmin-personal-key.json` | Owner-only (`0600`), gitignored |
| Env | `GARMIN_PERSONAL_API_KEY` in root `.env` | Manual; gitignored |

UI file wins over env. Disconnect deletes the file only, not `.env`. The app does not write `.env`. See [BUG-GARMIN-PERSONAL-002](./BUGS.md).

| Lab file | Used for | Personal API |
| --- | --- | --- |
| `activities/activities.json` | Overview, Summary, Log, analysis | Activity search |
| `enrichment/sleep.json` | Recovery, Daily Analyzer, Summary | Sleep summaries |
| `enrichment/daily.json` | RHR, body battery, stress | Daily summaries v2 |
| `enrichment/health_status.json` | HRV (weekly + Summary band) | HRV daily |

Not synced: weight, nutrition, SpO2, FIT files, per-activity workouts. Soft 4xx return debug curls on `connect.debugRequests`. Keep the four endpoint families to stay under unpublished rate limits.

Rail **Resync** uses Live sync when a key is connected, otherwise a valid manual `DI_CONNECT` folder.

## 2. What athletes see (no coding)

| Want | Where |
| --- | --- |
| This week + recovery + deeper insight cards | **Overview** |
| Career totals, hours by sport, RHR / sleep / HRV | **Summary** |
| One workout + route | **Log** row or **Daily Analyzer** session |
| Marathon / ultra pointers | **Overview** (two cards under the week totals) |
| Data in | **Live sync** or **Manual import**, then **Resync** |

Empty states point at Live sync or Manual import. Charts work without an LLM key; coach chat needs one.

## 3. Features

| Feature | Where | What it does |
| --- | --- | --- |
| Deeper week insights | Overview | Load vs recovery, easy-day share, efficiency, consistency, sleep–stress, plus a glossary |
| Recovery snapshot | Overview and Load | Latest complete wellness day (skips an empty today), including HRV |
| Marathon pointer | Overview | Longest run in 6 weeks, and whether it is near a 28–32 km long run |
| Ultra trail pointer | Overview | 28-day run climb, and metres of climb per km on that long run |
| Activity map | Log or Daily Analyzer | GPS track from `activity/{id}/details` (`geoPolylineDTO.polyline`) drawn on an OpenStreetMap basemap. Dark dot is the start, amber is the finish |
| Effort load | Same panel | Banister TRIMP, TRIMP per km versus similar-distance runs, plus aerobic and anaerobic training effect |
| Activity signals | Same panel | Climb, cadence, power, max HR, training effect, calories, temperature, VO2, and similar-distance pace/TRIMP |
| Career summary | Summary | Totals, Everest-style climb, hours by sport and month, 90-day RHR / sleep / HRV band |

Story-card download and the 4-week load forecast are not features. The forecast was a maintenance projection, not a plan.

Opening an activity calls `GET /api/activity/[id]/analysis`, which reads local JSON and then the Personal API polyline when a key is connected.

## 4. Not in this release

- Story / TikTok image download.
- FIT file download and GPS replay video.
- Coverage heatmap and Body Battery event timeline.
- Browser setup wizard (keys are still `.env` or Live sync).
- Writing anything back to Garmin.

## 5. Related bugs

- [BUG-GARMIN-PERSONAL-001](./BUGS.md) — unused `/weight/all` 400; endpoint dropped.
- [BUG-GARMIN-PERSONAL-002](./BUGS.md) — UI key file overrides `.env`.
- [BUG-LAB-003](./BUGS.md) — rail Resync follows the active source.
- [BUG-LAB-005](./BUGS.md) — recovery snapshot skips an empty today.
