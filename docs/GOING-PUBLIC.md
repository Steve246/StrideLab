# Going public (StrideLab)

Checklist for publishing this repo as a **public** GitHub project while keeping
personal training data, API keys, and local AI tooling private.

Contributor workflow lives in the [README — Contributing](../README.md#contributing)
section. This page is for **maintainers** flipping visibility and locking branches.

## What stays private (never commit)

| Path / secret | Why |
| --- | --- |
| `.env`, `.env.*` (except `.env.example`) | LLM, Garmin, Tavily, and other keys |
| `packages/agent/data/` | Activities, enrichment, Personal API key file |
| `DI_CONNECT/` | Raw Garmin export folders |
| `.cursor/` | Local Cursor skills, MCP config, debug logs |
| `.opencode/` | Local OpenCode skills and package caches |
| Real paths / keys in docs or screenshots | Leak machine layout or credentials |

## Pre-publish self-check

```bash
git status
git check-ignore -v .env packages/agent/data .cursor .opencode

git grep -n -E 'sk-|API_KEY=.+[^=]$|/Users/|/home/[^/]+/' -- \
  ':!pnpm-lock.yaml' ':!*.svg' ':!docs/images/*' || true
```

If a secret was **ever** committed, rotate it and scrub history (or start a
clean public repo) before setting visibility to Public.

## Branch model

| Branch | Role |
| --- | --- |
| `main` | Stable public default; protected |
| `dev` | Integration / WIP; protect if used |

Create `dev` once from an up-to-date `main`:

```bash
git checkout main && git pull
git checkout -b dev
git push -u origin dev
```

GitHub **Settings → Branches**:

1. Protect `main` and `dev`.
2. Require a pull request before merging.
3. Require at least one approving review.
4. Restrict who can push / merge (maintainers only).
5. Block force pushes and branch deletion.

Do **not** add strangers as write collaborators. They fork → PR → you merge.

## Related

- [README — Contributing](../README.md#contributing)
- [BUGS.md](./BUGS.md)
- [PRD-garmin-personal-sync.md](./PRD-garmin-personal-sync.md)
