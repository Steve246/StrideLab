# Going public (StrideLab)

Checklist for publishing this repo as a **public** GitHub project while keeping
personal training data, API keys, and local AI tooling private.

Contributor workflow: [README — Contributing](../README.md#contributing).  
Athlete / non-coder product access: [PRD-garmin-personal-sync.md](./PRD-garmin-personal-sync.md).

## What stays private (never commit)

| Path / secret | Why |
| --- | --- |
| `.env`, `.env.*` (except `.env.example`) | LLM, Garmin, Tavily, and other keys |
| `packages/agent/data/` | Activities, enrichment, Personal API key file |
| `DI_CONNECT/` | Raw Garmin export folders |
| `.cursor/` | Local Cursor skills, MCP config, debug logs |
| `.opencode/` | Local OpenCode skills and package caches |

## Pre-publish self-check

```bash
git status
git check-ignore -v .env packages/agent/data .cursor .opencode

git grep -n -E 'sk-|API_KEY=.+[^=]$|/Users/|/home/[^/]+/' -- \
  ':!pnpm-lock.yaml' ':!*.svg' ':!docs/images/*' || true
```

## Branch model

| Branch | Role |
| --- | --- |
| `main` | Stable public default; protected |
| `dev` | Integration / WIP; protect if used |

GitHub **Settings → Branches**: require PR + review, restrict pushes, block force-push.

## Related

- [README — Contributing](../README.md#contributing)
- [PRD-garmin-personal-sync.md](./PRD-garmin-personal-sync.md)
- [BUGS.md](./BUGS.md)
