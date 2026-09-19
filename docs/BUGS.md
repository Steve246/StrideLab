# Bugs

## BUG-LAB-001: Next.js development server references missing chunk

**Status:** Fixed with recovery workflow  
**Affected surface:** `apps/lab` development server  
**Symptom:** Requests intermittently fail with:

```text
Error: Cannot find module './347.js'
.../.next/server/webpack-runtime.js
```

The dashboard may initially return `200`, then `/api/health`, `_document`, or
other routes return `500` after a hot rebuild. The logs may also show repeated
`Compiled in ...` messages.

### Cause

`.next` is generated build output, not source. A development rebuild left
`webpack-runtime.js` pointing at chunk `347.js` after that generated chunk was
missing. This is a stale/inconsistent Next.js development cache, commonly
triggered by interrupted hot reloads, changing many modules while the dev
server is running, or running another Next build against the same `.next`
directory.

This is not caused by the Garmin API routes or the `/api/health` handler. A
production `next build` completes successfully after regenerating the output.

### Fix

Stop all Lab Next.js processes, then use the clean development command:

```bash
pnpm lab:dev:clean
```

That removes only `apps/lab/.next` and starts a fresh server on port `4030`.

Equivalent command from `apps/lab`:

```bash
pnpm dev:clean
```

Do not run `pnpm lab:build` or `next build` concurrently with `pnpm lab:dev`
against the same `apps/lab/.next` directory. Use the production build only
after stopping the dev server.

### Verification

After the clean server starts, verify both the page and health route:

```bash
curl -fsS http://localhost:4030/ >/dev/null
curl -fsS http://localhost:4030/api/health
```

Expected:

- `/` returns HTTP `200`.
- `/api/health` returns HTTP `200` JSON.
- No `Cannot find module './<chunk>.js'` appears in the server log.

### Prevention

- Use `pnpm lab:dev:clean` after an interrupted Next.js rebuild or chunk error.
- Keep one Next.js process responsible for `apps/lab/.next` at a time.
- Do not treat `.next` as durable state; it is safe to regenerate.
- Keep runtime data under `packages/agent/data`, not under `.next`.

## BUG-GARMIN-LOGIN-001: Live login connector startup and upstream authentication

**Status:** Connector startup fixed; Garmin authentication still blocked  
**Affected surface:** Live sync -> Garmin Connect

### Symptoms

The login request first returned a local connector error because the configured
module name was misspelled:

```env
GARMIN_CONNECTOR_COMMAND=./.venv-garmin/bin/python -m garmin_connecto
```

The correct module is:

```env
GARMIN_CONNECTOR_COMMAND=./.venv-garmin/bin/python -m garmin_connector
```

After that was fixed, a credentialed local smoke test reached the Garmin client,
but Garmin returned:

```text
GarminConnectAuthenticationError
```

### Root causes

- The `.env` module name was truncated from `garmin_connector` to
  `garmin_connecto`.
- The local connector environment was not initially installed.
- The current connector uses direct `garminconnect` login and does not yet have
  the long-lived MFA/browser fallback worker.

### Fixes applied

- Corrected `.env` to use `garmin_connector`.
- Added repository-local setup:

  ```bash
  pnpm garmin:setup
  ```

- Backend defaults to `.venv-garmin/bin/python -m garmin_connector`.
- Connector `garminconnect.Garmin` is constructed with the supplied credentials.
- Connector startup/status smoke test passes.
- Errors are redacted and passwords are never logged or sent to an LLM provider.

### Current test result

The local connector responds correctly to health/status:

```json
{"ok": true, "status": "ready"}
{"ok": true, "status": "disconnected", "accountLabel": null, "message": null}
```

The credentialed test reached Garmin but returned
`GarminConnectAuthenticationError`. This is now an upstream authentication
result, not a missing-module error. Possible causes include MFA,
Cloudflare/anti-bot protection, invalid or expired credentials, account lock, or
an authentication flow change at Garmin.

The password used for testing was supplied only to the local connector process;
it was not printed, logged, or sent to the LLM provider. Credentials must not be
retried through chat or MCP arguments.

### Remaining implementation

Implement the long-lived worker described in
`docs/PRD-dual-source-garmin.md` with:

- MFA challenge persistence and `login_resume`.
- `curl_cffi` strategy configuration.
- Playwright/browser fallback for anti-bot challenges.
- Token refresh and worker lifecycle management.

## BUG-LAB-002: Lens/core package version mismatch breaks the build

**Status:** Fixed by deferring Lens integration until package alignment  
**Affected surface:** Anvia agent/Lens observability

### Symptom

Build or runtime errors included:

```text
Package path ./redaction is not exported from @anvia/core
resolveEvalTraceRef is not exported from @anvia/core/evals
projectEvalOutcome is not exported from @anvia/core/evals
```

### Cause

The project uses the v0-era:

```text
@anvia/core@0.17.0
```

but installed:

```text
@anvia/lens@1.2.0
```

The Lens package declares a peer dependency on `@anvia/core@^1.4.0` and imports
exports that do not exist in core `0.17.0`. pnpm's peer warning did not prevent
installation, so the incompatibility appeared later during bundling/runtime.

### Fix

Remove the incompatible Lens runtime import/dependency from the current agent
process. Keep the existing Anvia logger observer working. Re-enable Lens only
after upgrading the Anvia core/provider/studio packages together and verifying
the Lens compatibility matrix.

The manual-first PRD retains the Lens plan as a gated phase rather than shipping
a broken observability dependency.

## BUG-LAB-003: Direct Anvia dependencies missing from the Lab package

**Status:** Fixed  
**Affected surface:** `apps/lab` Anvia coach adapter

### Symptom

```text
Cannot find module '@anvia/core'
Cannot find module 'zod'
```

### Cause

The Lab coach adapter imported `@anvia/core` and `zod` directly, but only the
agent workspace declared them. With pnpm strict dependency boundaries and
`hoistWorkspacePackages: false`, transitive workspace availability is not a
valid dependency contract.

### Fix

Declare both packages directly in `apps/lab/package.json`:

```text
@anvia/core@0.17.0
zod@4.4.3
```

## BUG-LAB-004: Provider credentials initialized during Next build

**Status:** Fixed  
**Affected surface:** Next.js `/api/chat` page-data collection

### Symptom

```text
Missing OpenAI credentials. Pass apiKey when constructing OpenAIClient.
Failed to collect page data for /api/chat
```

### Cause

`packages/agent/src/providers/openai.ts` constructs `OpenAIClient` at module
load time. A static import from the Next.js Anvia coach adapter caused that
module to execute during `next build`, before request/runtime environment
configuration had been loaded. The provider constructor saw an undefined key.

### Fix

The Lab coach dynamically imports `getModel()` inside the request-time
`buildCoachAgent()` function after `loadLabEnv()` runs. Provider construction no
longer occurs during build-time page-data collection.

This preserves server-only credentials and keeps `next build` credential-free.

## BUG-LAB-005: Invalid Devscale key shown as offline plus stream failure

**Status:** Fixed error handling; credential replacement required  
**Affected surface:** Lab Coach chat / Devscale gateway

### Symptom

The Coach UI showed:

```text
LLM offline
401 Incorrect API key provided
Stream ended without a final answer
```

### Cause

The configured `DEVSCALE_API_KEY` is non-empty, so `/api/health` marked the LLM
as configured/online without validating the key. The actual provider request then
returned HTTP `401 invalid_api_key`.

The browser also appended the generic “Stream ended without a final answer”
message after receiving the real SSE `error` event, producing two errors for one
failed request.

### Fix

- API chat errors now classify invalid keys and rate limits into safe user-facing
  messages without exposing provider internals.
- The Coach UI tracks whether an SSE error was received and does not append a
  misleading missing-final-answer error afterward.
- The provider remains server-side; keys are never sent to the browser or Lens.

### Required configuration

Replace the invalid server-side key in `.env`:

```env
LLM_PROVIDER=devscale
DEVSCALE_BASE_URL=https://gateway.devscale.id/v1
DEVSCALE_API_KEY=<valid Devscale key>
```

Then restart the Lab:

```bash
pnpm lab:dev:clean
```

The key cannot be repaired in application code. A non-empty but revoked or
incorrect provider key must be replaced by the deployment owner.

The key was present in the local `.env` during investigation, but the direct
Devscale `/v1/models` and `/v1/chat/completions` probes returned HTTP `401
invalid_api_key`. This confirms the failure is provider-side key validation,
not dotenv loading. The health response now exposes only a non-secret key
prefix and configuration state; it never exposes the full key.
