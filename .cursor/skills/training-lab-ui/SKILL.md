---
name: training-lab-ui
description: >-
  Visual system for StrideLab (apps/lab): endurance analytics dashboard
  + tool-calling coach chat on shadcn/ui + Tailwind. Use when redesigning Lab UI,
  styling dashboard panels, KPI cards, coach chat, layout chrome, or chart shells.
  Combines Swiss grid discipline, anti-slop frontend-design rules, and micro-polish
  from make-interfaces-feel-better. Prefer teal single accent; never purple SaaS defaults.
---

# Training Lab UI

Source inspiration: [awesome-ai-tools-for-ui](https://github.com/maxbogo/awesome-ai-tools-for-ui).  
Companion skills in this repo: `swiss-design`, `frontend-design`, `make-interfaces-feel-better`, `web-design-guidelines`, `hallmark`.

## Product brief

| Axis | Choice |
|------|--------|
| Subject | Personal endurance training lab (Garmin TRIMP / ACR / sleep / PRs) |
| Audience | One athlete-coach |
| Primary job | Scan load risk and recovery, then ask the coach with live tools |
| Layout | Analytics dashboard — not a marketing landing page |
| Kit | [shadcn/ui](https://ui.shadcn.com/) + existing Recharts / Vega panels |

## Design plan (locked)

### Color (one accent)

| Token | Hex | Role |
|-------|-----|------|
| Ink | `#0f172a` | Primary text / primary buttons |
| Teal | `#21918c` | **Only** accent (links, active chips, focus ring) |
| Mist | `#f1f5f9` | Page background |
| Paper | `#ffffff` | Surfaces |
| Rule | `#e2e8f0` | Hairline structure |
| Mute | `#64748b` | Secondary text via opacity when possible |
| Optimal / caution / risk | `#2f7d4a` / `#c47f17` / `#b33a3a` | Load zones only |

Do **not** use purple gradients, cream+terracotta Anthropic defaults, or yellow CTA noise from generic generators.

### Layout

```
┌────┬──────────────────────────┬─────────────┐
│Rail│ Tab content              │ Coach (opt) │
│    │ Overview | Load | Weekly │             │
│    │ ACR | Best | Log         │             │
└────┴──────────────────────────┴─────────────┘
```

- **Overview:** week summary only + Daily Analyzer  
- **Load:** detailed metrics + recovery snapshot (tight padding)  
- **ACR:** ratio + acute/chronic series + recent table (literature-aware)  
- **Best / Log:** enriched PRs + activity table  
- No Custom (Vega) or Layout tabs in the rail  

### Type

- **UI:** Geist (modern product sans) + Geist Mono for tools/metrics labels  
- Tabular nums on KPIs  

### Motion

- Resync / layout update: opacity + short status alert only  
- No staggered fade-up on every card  
- Respect `prefers-reduced-motion`  

### Micro-polish (`make-interfaces-feel-better`)

- Concentric radii (outer = inner + padding)  
- Shadows for elevation sparingly; borders for structure  
- Icon stroke matches text weight; `tabular-nums` on live numbers  
- Font smoothing antialiased on `body`  

## Anti-patterns (reject)

- Inter / Roboto / purple-on-white SaaS kit  
- Numbered 01/02/03 markers on non-sequential content  
- Hover-lift on every card  
- Decorating empty space with gradient blobs  
- Inventing widget IDs outside the dashboard allowlist  

## Implementation map

| Piece | Path |
|-------|------|
| Theme | `apps/lab/src/app/globals.css` |
| Shell | `apps/lab/src/components/Dashboard.tsx` |
| KPIs | `apps/lab/src/components/KpiRow.tsx` |
| Panel wrapper | `apps/lab/src/components/LabPanel.tsx` |
| Coach | `apps/lab/src/components/CoachChat.tsx` |
| shadcn UI | `apps/lab/src/components/ui/*` |

## When building

1. Read this skill + `swiss-design` for grid/type.  
2. Cross-check `frontend-design` anti-defaults.  
3. Apply polish via `make-interfaces-feel-better`.  
4. Keep analytics widgets functional; restyle shells, do not invent metrics.  
