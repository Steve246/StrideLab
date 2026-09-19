# Project UI skills

Installed from [awesome-ai-tools-for-ui](https://github.com/maxbogo/awesome-ai-tools-for-ui) for Steven Training Lab.

| Skill | Purpose |
|-------|---------|
| `training-lab-ui` | **Primary** — locked Lab visual system (teal accent, Swiss grid, shadcn) |
| `swiss-design` | IBM Plex, 12-col grid, one accent, opacity hierarchy |
| `frontend-design` | Anthropic anti-template / distinctive UI guidance |
| `make-interfaces-feel-better` | Micro-polish (radii, tabular nums, motion) |
| `web-design-guidelines` | Vercel Web Interface Guidelines review |
| `hallmark` | Anti-slop design gates + component cookbook |
| `ui-skills` MCP | External catalog for targeted UI research and audits |

Cursor loads project skills from `.cursor/skills/*/SKILL.md`. Prefer `training-lab-ui` for any Lab dashboard work.

## UI Skills usage

Use the UI Skills MCP catalog for focused research, not as a replacement for the
local visual system. Keep this precedence for Training Lab work:

1. `training-lab-ui` and `swiss-design` govern the product's visual language.
2. UI Skills `ui-skills-root` routes the request to the smallest useful external skill.
3. `frontend-ui-engineering` informs component architecture, responsive behavior, and accessibility.
4. `improve-ui` is read-only audit guidance for a coherent rendered surface.
5. `make-interfaces-feel-better`, `web-design-guidelines`, and `hallmark` provide local polish and review checks.

For the dual-source Garmin UI, prefer `ui-skills-root` plus
`frontend-ui-engineering`; use `improve-ui` after the surface is rendered. Do not
load more than three UI Skills for one task.
