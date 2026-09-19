# PRD: Agentic Training Lab — Briefs, LibSQL, MCP Platform

**Product:** Steven Training Lab (`apps/lab`) + Anvia agent (`packages/agent`)  
**Related:** [PRD-daily-analyzer-your-best.md](./PRD-daily-analyzer-your-best.md) (shipped)  
**Status:** Active roadmap (planning — not implementing this doc)  
**Updated:** 2026-09-13  
**Framing:** AI Training Analytics Investigator for endurance athletes (Devscale AI Product Engineering final) → evolve toward a **platform-agnostic MCP analytics surface** others can use with their own data

---

## Status snapshot (PO)

| Priority | Phase | Focus | Status |
|----------|-------|--------|--------|
| — | **A** | Tool calling + data tools + web_search + streamed tools UI | **Done** |
| — | **E (UI)** | Configurable dashboard + Vega-Lite + in-chat widgets | **Done** |
| **P1** | **B** | Downloadable Weekly Training Brief (chat-requested) | **Done** |
| **P2** | **C** | LibSQL durable store + AI-consumable context layer | **Backlog** (after B) |
| **P3** | **D** | Platform-agnostic MCP + bring-your-own data (Garmin kept as primary adapter) | **Backlog** (after C) |
| Later | **E′** | Telegram + anomalies/scenarios *(former Phase C)* | **Deferred** |
| Later | **F** | RAG / knowledge corpus *(former Phase D)* | **Deferred** |

**Current PO rule:** Phase B brief is shipped. Next: **LibSQL (Phase C)** then **MCP (Phase D)**. Do not start LibSQL/MCP until brief acceptance stays green.

---

## 0. Current priority stack (authoritative)

| # | Outcome | Why now |
|---|---------|---------|
| **1** | **Downloadable weekly brief** from a chat request | Completes P0 deliverable; structured coaching artifact, not only chat prose |
| **2** | **LibSQL** replaces ad-hoc JSON files as system of record; **keep AI-easy context** | VPS-ready, queryable, multi-athlete path; JSON “context richness” must not be lost |
| **3** | **MCP + platform-agnostic** access: anyone who **supplies data** (Garmin DI_CONNECT or equivalent) gets the same analytics/coach tools | Product becomes reusable beyond Steven’s laptop path |

---

## 1. Problem

The Lab already has strong **deterministic analytics** (TRIMP, ACR, forecast, Daily Analyzer, Your Best, HRV) and a coach chat with **tool calling**. Gaps vs the next product bar:

1. **No exportable weekly brief** — chat answers are ephemeral; finals expect a structured deliverable  
2. **JSON-on-disk as sole store** — fine locally (~1 athlete), awkward for VPS multi-user, concurrent sync, and clean MCP tenancy  
3. **Steve-centric paths** — `GARMIN_EXPORT_DIR` + hardcoded machine paths; tools are Lab/Anvia-specific, not a standard MCP catalog others can plug into  
4. Deferred: Telegram channel, RAG playbooks  

Chat can pull metrics via tools but cannot yet **generate + download** a weekly brief, and data is not yet **portable behind MCP**.

---

## 2. Goals

| Goal | Success signal |
|------|----------------|
| Chat-requested weekly brief | User asks in coach chat → tool builds brief → **download MD/HTML** |
| Grounded athlete numbers | Metrics from builders/DB views — never invented |
| LibSQL system of record | Activities/enrichment/briefs live in LibSQL; Lab + agent read via repository |
| AI still gets rich context | Tools return the same (or better) structured JSON envelopes + optional markdown context packs |
| Platform-agnostic MCP | Cursor / Claude Desktop / Lab call the same MCP tools against **tenant-supplied** data |
| Garmin remains first-class | DI_CONNECT multi-file sync (BUG-SYNC-01 rules) stays the primary ingest adapter |

### Non-goals (near term)

- **MCP-UI** (embedded UI protocol in chat) — still dropped  
- Billing / public SaaS marketing site  
- LLM inventing arbitrary React/HTML or replacing Banister TRIMP / ACR math  
- Full Telegram bot (**deferred** to Phase E′)  
- Full RAG corpus (**deferred** to Phase F)  
- Turso Cloud dependency — **LibSQL/SQLite self-host on VPS** is enough; Turso Cloud optional later  

---

## 3. Users & JTBD

| User | JTBD | Capability |
|------|------|------------|
| Steven (primary today) | “Give me this week’s coaching brief as a file.” | `generate_weekly_brief` + download |
| Steven | “Am I overreaching? Use my real numbers.” | Data tools → LibSQL-backed |
| Future athlete (via MCP) | “I pointed my Garmin export / DB at your MCP — show overview/ACR like the Lab.” | MCP tools + tenant store |
| Future athlete | “I don’t use Garmin but I have activities CSV/JSON.” | Secondary ingest adapters (after Garmin) |

---

## 4. Architecture (target — after Phase D)

```text
                    ┌─────────────────────────────┐
                    │  Clients (platform-agnostic) │
                    │  Lab UI · Cursor · Claude MCP│
                    └──────────────┬──────────────┘
                                   │ MCP (stdio / later HTTP)
                                   ▼
                    ┌─────────────────────────────┐
                    │  Training Lab MCP server     │
                    │  get_overview · get_weekly · │
                    │  get_acr · get_daily_… ·     │
                    │  generate_weekly_brief ·     │
                    │  ingest_garmin / sync · …    │
                    └──────────────┬──────────────┘
                                   │ repository API
                                   ▼
                    ┌─────────────────────────────┐
                    │  LibSQL (self-host / file)   │
                    │  per-tenant or shared+tenant │
                    │  + ai_context views/packs    │
                    └──────────────┬──────────────┘
                                   ▲
                    ┌──────────────┴──────────────┐
                    │ Ingest adapters             │
                    │ 1) Garmin DI_CONNECT (primary)
                    │ 2) later: CSV / FIT / API   │
                    └─────────────────────────────┘

Lab Next.js (FE + /api/chat) remains a first-party client of the same tool/repository layer.
```

**Today (pre–Phase C):** builders read `packages/agent/data/*.json`.  
**Phase C:** repository reads LibSQL; optional JSON export/snapshot for debug.  
**Phase D:** MCP exposes the same tools with tenant context.

---

## 5. Prioritized backlog

### Priority 1 — Phase B: Weekly Training Brief

| ID | Item | Status |
|----|------|--------|
| P0.6 | `generate_weekly_brief` coach tool + `/api/briefs/[id]` download | **Done** |
| P1.1 | Download UI: chat card Download Markdown / HTML | **Done** |
| B.3 | Persist brief under `packages/agent/data/briefs/` (+ meta.json) | **Done** |
| B.4 | Brief sections locked (see §6.4) | **Done** |

### Priority 2 — Phase C: LibSQL + AI-consumable context

| ID | Item | Status |
|----|------|--------|
| C.1 | Schema: activities, enrichment (sleep/daily/vo2/race/hrv), briefs, layout, athlete profile | **Todo** |
| C.2 | Repository layer (`getActivities`, `upsertActivities`, …) used by Lab builders + agent sync | **Todo** |
| C.3 | Migrate existing JSON → LibSQL one-shot + verify counts/dates | **Todo** |
| C.4 | **AI context strategy** (see §6.6) — views + tool envelopes + optional markdown packs | **Todo** |
| C.5 | VPS path: single file or libSQL server on box; no Turso Cloud required | **Todo** |
| C.6 | Deprecate raw JSON as source of truth (keep export for backup/debug) | **Todo** |

### Priority 3 — Phase D: MCP + platform-agnostic data

| ID | Item | Status |
|----|------|--------|
| D.1 | Shared tool registry (one schema → Lab OpenAI tools + MCP tools) | **Todo** |
| D.2 | MCP server (stdio first): overview, weekly, ACR, daily, best, brief, garmin sync | **Todo** |
| D.3 | Tenant / athlete context (API key or config profile → LibSQL DB or `tenant_id`) | **Todo** |
| D.4 | Garmin DI_CONNECT ingest via MCP (`ingest_garmin` / `sync`) — multi-file rules (BUG-SYNC-01) | **Todo** |
| D.5 | Document “bring your own data” contract for third parties | **Todo** |
| D.6 | Lab chat uses shared implementations (no duplicated metric math) | **Todo** |

### Deferred — Phase E′ (was old Phase C)

| ID | Item | Status |
|----|------|--------|
| P1.2 | Telegram bot | Deferred |
| P1.3 | Telegram share + brief file | Deferred |
| P1.4 | `what_changed` anomaly tool | Deferred |
| P1.5 | `simulate_load` what-if tool | Deferred |

### Deferred — Phase F (was old Phase D / P2 RAG)

| ID | Item | Status |
|----|------|--------|
| P2.1 | Knowledge corpus | Deferred |
| P2.2 | `search_knowledge` | Deferred |
| P2.3 | shadcn + UI skills | **Mostly done** (keep polishing as needed) |

### Done — foundation

| ID | Item | Status |
|----|------|--------|
| P0.1–P0.5 | Tool loop, data tools, web_search, prompt, SSE tool cards | **Done** |
| P1.6 | Loading / tool progress | **Done** |
| P3.1–P3.4 | Dashboards, Vega, in-chat widgets | **Done** |
| BUG-SYNC-01 | Multi-file summarizedActivities merge | **Fixed** |

---

## 6. Feature specs

### 6.1 Tool calling (shipped)

- OpenAI-compatible `tools` on Devscale/OpenAI  
- Server-side tool loop + SSE `tool_start` / `tool_done` / `final`  
- Prefer `DEVSCALE_MODEL=deepseek-v4-flash-0731`

### 6.2 Data tools (shipped; backend store changes in Phase C)

| Name | Implementation today | After Phase C |
|------|----------------------|---------------|
| `get_overview` | `buildOverview(12)` | Same API, LibSQL-backed repo |
| `get_weekly` | `buildWeekly` | idem |
| `get_acr` | `buildAcr` | idem |
| `get_daily_analyzer` | `buildDailyAnalyzer` | idem |
| `get_your_best` | `buildYourBestPayload` | idem |

### 6.3 `web_search` (shipped)

- Tavily; cite URLs; never treat web as athlete data  

### 6.4 Weekly brief (Phase B — Priority 1) — **spec**

**Trigger:** User asks in coach chat (e.g. “generate my weekly brief”, “download this week’s coaching report”) **or** clicks Brief in UI.

**Tool:** `generate_weekly_brief`

| Input | Notes |
|-------|--------|
| `week_start` optional | ISO Monday; default = current training week |
| `format` | `markdown` (default) \| `html` |
| `include_web` | optional; if true, may call `web_search` for cited guidelines only |

**Sections (required):**

1. **as_of** / week range / athlete timezone  
2. **Load & volume** — distance, TRIMP, sessions, WoW  
3. **ACR / form** — effort + mileage zones; plain-language alignment  
4. **Recovery** — sleep / RHR / HRV signals when present  
5. **Highlights & risks** — grounded in tools, not invented  
6. **Next-week targets** — conservative, tied to forecast/ACR  
7. **Sources** — only if web used  

**Outputs:**

- Tool result JSON: `{ brief_id, as_of, path, format, summary }`  
- File under `packages/agent/data/briefs/` (Phase B) → LibSQL `briefs` table + file blob/path (Phase C)  
- Chat UI: download link / button for the generated file  

**Acceptance:**

- [ ] Chat request produces a brief without inventing metrics (tools/builders only)  
- [ ] User can download `.md` or `.html` from the Lab  
- [ ] Brief reflects post–BUG-SYNC-01 data freshness  

### 6.5 P3 UI tools (shipped)

Allowlisted widgets + Vega kinds unchanged.

### 6.6 LibSQL + AI-consumable context (Phase C — Priority 2) — **spec**

**Problem:** Today AI “sees” rich JSON (activities list, enrichment blobs, tool return shapes). Moving to LibSQL must **not** force the model to invent SQL or lose narrative context.

**Decision:** LibSQL is the **system of record**. AI does **not** query SQL directly in v1. AI continues to call **tools** that return **structured JSON** (same shapes as today). Extra context is provided via:

| Mechanism | Purpose |
|-----------|---------|
| **A. Tool envelopes (primary)** | Keep/extend current tool JSON (`get_overview`, etc.). Builders load from LibSQL then serialize the same payloads. |
| **B. SQL views for humans/apps** | `v_week_summary`, `v_acr_current`, `v_sleep_7d` — used by repository, not by raw LLM SQL. |
| **C. Context packs (optional)** | On sync or brief generate, write `ai_context_packs` rows or markdown files: short, typed summaries (“This week: … Form: … Sleep: …”) for prompt injection / RAG later. |
| **D. JSON export snapshot (debug)** | Periodic `export_json_backup` for git-free backup and parity tests vs old files. |

**Schema sketch (non-normative):**

- `tenants(id, name, created_at)` — Phase D may introduce; Phase C can use single default tenant  
- `activities` — normalized columns + `payload_json` for overflow fields  
- `sleep_days`, `daily_metrics`, `vo2_points`, `race_predictions`, `health_status_days`  
- `briefs(id, week_start, format, body, created_at)`  
- `athlete_hr_profile`, `dashboard_layout`  
- `ai_context_packs(kind, as_of, markdown_or_json, updated_at)`  

**Hosting:** Self-host **LibSQL/SQLite file** (or libSQL server) on VPS. Turso Cloud optional later — not required.

**Acceptance:**

- [ ] All Lab panels + coach tools work with JSON store deleted/disabled  
- [ ] Tool JSON shapes remain stable (or versioned with adapters)  
- [ ] Migration verified: activity count + latest activity date match  
- [ ] Context pack or tool envelope still gives coach “week story” without dumping entire DB into the prompt  

### 6.7 MCP + platform-agnostic Garmin (Phase D — Priority 3) — **spec**

> **Related plan:** [`PRD-dual-source-garmin.md`](./PRD-dual-source-garmin.md) defines the
> optional live Garmin Connect source, manual-export fallback, source-neutral service
> contract, authentication boundaries, and Data Sources UI. Its UI implementation must
> follow the local `training-lab-ui` skill; the UI Skills MCP catalog is a focused
> reference and audit tool, not a replacement for the product visual system.

**Intent:** People supply their own data; they get **the same analytical capabilities** designed here (overview, load, ACR, daily analyzer, best, brief).

**MCP tools (v1 catalog):**

| Tool | Auth scope |
|------|------------|
| `get_overview` | tenant |
| `get_weekly` | tenant |
| `get_acr` | tenant |
| `get_daily_analyzer` | tenant |
| `get_your_best` | tenant |
| `generate_weekly_brief` | tenant |
| `sync_garmin` / `ingest_garmin` | tenant + path or upload ref |
| `get_data_status` | tenant (counts, latest dates, last sync) |

**Garmin:** Remains **primary** ingest. Must:

- Accept DI_CONNECT or parent “Garmin Data” folder  
- Merge **all** `*summarizedActivities.json` (BUG-SYNC-01)  
- Import enrichment as today  

**Platform-agnostic:**

- No hardcoded absolute paths in prompts; config / tenant settings only  
- Secondary ingest (CSV / generic activities JSON) can follow once Garmin MCP path is stable  
- Lab is one client among many; Cursor/Claude can use the MCP server against a tenant DB  

**Out of scope for D:** MCP-UI widgets; public multi-tenant billing.

**Acceptance:**

- [ ] MCP server runs stdio against a LibSQL-backed tenant  
- [ ] Third-party client can call `get_overview` after Garmin ingest without using Lab UI  
- [ ] Same Banister/ACR math as Lab  
- [ ] Documented onboarding: supply DI_CONNECT → sync → call tools  

---

## 7. UI / visualization decision

| Topic | Decision |
|-------|----------|
| UI kit | **shadcn/ui** + Tailwind v4 |
| Core charts | **Recharts** |
| Custom charts | **Vega-Lite** (allowlisted) |
| MCP-UI | **Dropped** |
| Brief UX | Chat download affordance + optional Brief control in chrome |

---

## 8. Acceptance criteria (by priority)

### Priority 1 / Phase B done when

- [x] Chat can request a weekly brief via tool  
- [x] User downloads MD or HTML from the Lab  
- [x] Numbers come only from builders/tools  

### Priority 2 / Phase C done when

- [ ] LibSQL is source of truth on local + documented VPS layout  
- [ ] AI still consumes rich tool JSON (+ optional context packs)  
- [ ] JSON folder no longer required for Lab boot  

### Priority 3 / Phase D done when

- [ ] MCP catalog live (stdio) for core analytics + Garmin sync + brief  
- [ ] Tenant can supply Garmin data and get Lab-equivalent answers from another MCP client  
- [ ] No Steven-only absolute paths required  

### Deferred

- [ ] Telegram brief delivery  
- [ ] RAG `search_knowledge`  

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Gateway model 502/503 | Fallbacks; prefer deepseek |
| Tool loops burn tokens | Max turns + truncate tool JSON |
| Web hallucinations | Cite URLs; separate from athlete metrics |
| LibSQL migration data loss | Parity tests (count, latest date, sample IDs); JSON backup export |
| AI loses “JSON context” richness | Tool envelopes + context packs; forbid raw SQL-to-LLM in v1 |
| MCP tenancy leaks | Strict tenant scoping on every tool; no shared default write |
| Garmin multi-file drift (BUG-SYNC-01) | Always merge all summarized files; document in ingest + MCP |
| Scope creep into Telegram/RAG | Keep E′/F deferred until B→C→D exit |

---

## 10. Implementation map

| Piece | Path |
|-------|------|
| This PRD | `docs/PRD-agentic-training-lab.md` |
| Daily Analyzer / Your Best PRD | `docs/PRD-daily-analyzer-your-best.md` |
| Coach + tools | `apps/lab/src/lib/openaiCoach.ts`, `coachTools.ts` |
| Chat API | `apps/lab/src/app/api/chat/route.ts` |
| Chat UI | `apps/lab/src/components/CoachChat.tsx` |
| Data builders | `apps/lab/src/lib/data.ts` |
| Garmin sync | `packages/agent/src/garmin/syncDiConnect.ts`, `diConnect.ts` |
| Agent prompts | `packages/agent/src/prompt/instruction.ts` |
| **Phase B (shipped)** | `apps/lab/src/lib/weeklyBrief.ts`, `generate_weekly_brief` in `coachTools.ts`, `/api/briefs/[briefId]`, chat download widget |
| **Phase C (planned)** | LibSQL schema + repository package + context packs |
| **Phase D (planned)** | MCP server package + tenant config + shared tool registry |

---

## 11. Delivery phases (PO schedule)

| Phase | Scope | Exit | Status |
|-------|--------|------|--------|
| **A** | P0.1–P0.5 tools UI | Chat demo with tools | **Done** |
| **E (UI)** | P3.1–P3.4 | Custom viz / layouts | **Done** |
| **B** | Weekly brief tool + download | Downloadable brief from chat | **Done (Priority 1)** |
| **C** | LibSQL + AI context layer | DB is SoR; AI still tool-fed | **Next (Priority 2)** |
| **D** | MCP + BYO data (Garmin primary) | External MCP client works | **Backlog (Priority 3)** |
| **E′** | Telegram + anomalies *(old C)* | Phone workflow | **Deferred** |
| **F** | RAG *(old D)* | Knowledge-grounded coach | **Deferred** |

---

## 12. Open questions

- Brief format default: Markdown only vs HTML email-style?  
- Phase C: embedded SQLite file vs always-on libSQL server on VPS?  
- Phase D tenancy: one LibSQL file per athlete vs one DB + `tenant_id`?  
- MCP transport after stdio: add HTTP/SSE for remote VPS clients in D or later?  
- Secondary ingest (CSV) in D.x or Phase D.2?  
- Telegram: long-polling on VPS vs webhook? *(deferred E′)*  
- RAG v1: embeddings vs keyword? *(deferred F)*  

---

## 13. Known bugs / issues (registered)

| ID | Severity | Symptom | Root cause (current) | Status |
|----|----------|---------|----------------------|--------|
| **BUG-P3-01** | High | `Module not found: Can't resolve 'canvas'` when compiling `/` via `vega-canvas` → `vega` → embed | Vega Node canvas path pulled into Next webpack via static panel import | **Fixed** — `dynamic` Vega panel + `vega-embed` in `useEffect` + webpack `canvas: false` |
| **BUG-P3-02** | High | “I don’t see any P3 UI changes” on reload | No layout chrome; default layout hid custom chart | **Fixed** — `DashboardLayoutBar` + default `vega` slot + seeded weekly_distance chart |
| **BUG-P3-03** | Med | Chat widgets looked off-brand vs Lab panels | Ad-hoc cards vs `.kpi` / chips | **Fixed** — reuse Lab KPI/chip patterns |
| **BUG-P3-04** | Low | Layout changes may not be obvious after coach tools | No persistent layout strip | **Fixed** with BUG-P3-02 |
| **BUG-P3-05** | Critical | `/` and `/api/health` 500: `UnhandledSchemeError: Reading from "node:fs/promises"` | Client `Dashboard.tsx` imported `@/lib/dashboardLayout`, which pulls `node:fs/promises` into the browser webpack graph | **Fixed** — split client-safe `dashboardLayoutShared.ts` (types/constants) from server `dashboardLayout.ts` (fs read/write); client components import shared only |
| **BUG-SYNC-01** | High | Resync “works” but Lab stays on old weeks (e.g. stuck ~2026-08-22 while export has Sep runs) | Garmin Connect export often **splits** history across multiple `DI-Connect-Fitness/*_summarizedActivities.json` files (e.g. `*_1_*` = recent, `*_301_*` = older). Ingestion picked **one** file by **alphabetical** name (`*_301_*` sorts after `*_1_*`), so newer chunks were skipped. Will recur as exports grow / new chunk files appear. | **Fixed** — `findSummarizedActivitiesFiles` + `loadSummarizedActivities(files[])` merge **all** chunks by `activity_id`; AI ingestion prompts document multi-file rule so agents never treat a single summarized file as full history |

**Reproduce BUG-P3-01:** `pnpm lab:dev` → open `/` → watch terminal for `vega-canvas` / `Can't resolve 'canvas'`.  
**Reproduce BUG-P3-02:** cold start with no `packages/agent/data/lab/dashboards.json` → page had no layout bar / custom chart slot.  
**Reproduce BUG-P3-05:** `pnpm lab:dev` → open `/` → terminal shows `node:fs/promises` UnhandledSchemeError from `dashboardLayout.ts` → `Dashboard.tsx`; GET `/` 500.  
**Reproduce BUG-SYNC-01:** Point `GARMIN_EXPORT_DIR` at a DI_CONNECT with ≥2 `*summarizedActivities.json` where the lexicographically last file is **not** the most recent; old sync imported only that file → `activities.json` latest date lags Garmin. After fix: Resync imports all files; latest date matches newest export chunk.
