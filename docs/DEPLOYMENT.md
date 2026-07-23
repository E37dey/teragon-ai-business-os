# DEPLOYMENT — TERAGON AI BUSINESS OS (Phase 10, W9-D)

Production deployment runbook for Netlify. **The deploy itself is
OPERATOR-GATED** — every step that authenticates to or contacts Netlify is
marked **OPERATOR_ACTION_REQUIRED** and must be run by the Lead/operator with
their own Netlify credentials. This repo's release engineering (config, smoke,
runbooks) is complete and verified locally; nothing here logs into Netlify on
its own.

## Deployment classification

- **Browser-local demo**: all app data lives in the browser (IndexedDB schema
  v6, synthetic seed via `seedIfEmpty()`). No server database. No real customer
  data ships.
- **Mode A — remote AI disabled**: `AI_REMOTE_ENABLED=false` (the default). Every
  AI operation refuses with `AI_PROVIDER_NOT_CONFIGURED`; **no provider is
  contacted**. The site is fully functional on the local rules engine. Enabling
  remote AI is a deliberate, separate operator action (see the env table +
  `docs/AI_PROVIDER_SETUP.md`).

## Prerequisites

| Requirement | Value / note |
|---|---|
| Node (local) | v22 LTS or newer (baseline verified on v25.8.1) |
| Netlify build image Node | pinned `NODE_VERSION="22"` in `netlify.toml` |
| Netlify CLI | v26.x (`npm i -g netlify-cli`) — operator machine only |
| Build command | `npm run build` (→ `tsc -b && vite build`) |
| Publish dir | `dist` |
| Functions dir | `netlify/functions` (ai-* endpoints) |
| A Netlify account + team | operator-owned |

## Environment variables (NAMES ONLY — never commit values)

Server-side only, read by Netlify Functions via `src/server/config.ts`. Set in
**Netlify UI → Site configuration → Environment variables → scope: Functions**.
NEVER prefix with `VITE_` (that bundles into the browser). All are optional —
missing values yield the honest "לא הוגדר"/"מושבת" health state, never a crash.

| Name | Purpose |
|---|---|
| `AI_PROVIDER` | `test` \| `anthropic` \| `openai`; unset ⇒ "לא הוגדר" |
| `AI_MODEL` | exact model id (code never hardcodes one) |
| `AI_API_KEY` | provider key — server-side only, never logged/echoed |
| `AI_BASE_URL` | optional provider/gateway base-URL override |
| `AI_REQUEST_TIMEOUT_MS` | per-attempt timeout (default 20000) |
| `AI_MAX_OUTPUT_TOKENS` | max output tokens (default 2048) |
| `AI_DAILY_BUDGET` | daily budget in accounting units (0/empty ⇒ no gate) |
| `AI_RATE_LIMIT_PER_MINUTE` | per-user AND per-session limit (default 10) |
| `AI_MAX_CONCURRENT_REQUESTS` | concurrent in-flight per instance (default 4) |
| `AI_REMOTE_ENABLED` | master switch; **keep `false` for Mode A** |

Build-time (browser, optional — see `docs/integration-requests-w9d.md` REQ-1):

| Name | Purpose |
|---|---|
| `VITE_APP_VERSION` | shown on System Health / Settings; else "לא סופק בזמן build" |
| `VITE_BUILD_COMMIT` | commit SHA on System Health / Settings; else same |

## Pre-deploy verification (run locally — no Netlify contact)

```bash
npm ci
npm run lint            # oxlint — 0/0
npm run typecheck       # tsc -b — 0 errors
npm run typecheck:tests # 0 errors
npm test                # vitest — all pass
npm run build           # tsc -b && vite build
npm run scan:secrets    # dist/ secret scan — CLEAN
node scripts/deployment/preview-smoke.mjs   # build + every route 200 + headers + scan
```

`preview-smoke.mjs` serves `dist/` locally with the exact `netlify.toml` headers
(incl. CSP) and confirms every route deep-links to `index.html` with 200 — a
faithful dress rehearsal of the SPA fallback and security headers without ever
touching Netlify.

## Deploy — OPERATOR steps

> All commands below run on the **operator's** machine with their Netlify login.
> W9-D/CI must NOT run these.

### 1. Authenticate — **OPERATOR_ACTION_REQUIRED**

```bash
netlify login          # opens a browser OAuth flow (operator credentials)
```

### 2. Link or create the site — **OPERATOR_ACTION_REQUIRED**

```bash
# existing site:
netlify link
# OR new site:
netlify sites:create --name teragon-ai-business-os
netlify link
```

### 3. Set Function env in the Netlify UI (Mode A default) — **OPERATOR_ACTION_REQUIRED**

Leave `AI_REMOTE_ENABLED` unset or `false` for Mode A. Add provider vars only
when remote AI is intentionally enabled (see `docs/AI_PROVIDER_SETUP.md`).

### 4. Deploy a Preview (Deploy Preview) — **OPERATOR_ACTION_REQUIRED**

```bash
netlify deploy --build            # builds + uploads a draft, prints a preview URL
```

Verify on the preview URL (see "Verify the live deploy" below) BEFORE production.

### 5. Deploy to Production — **OPERATOR_ACTION_REQUIRED**

```bash
netlify deploy --build --prod     # promotes to the production domain
```

## Verify the live deploy (any deploy URL)

1. **App loads & routes**: open the URL; hard-refresh on a deep link, e.g.
   `<url>/governance` — must render (SPA fallback 200), not a Netlify 404.
2. **Security headers** (replace `<url>`):
   ```bash
   curl -sI <url>/ | grep -iE 'content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'
   ```
   Expect the CSP (`default-src 'self'; script-src 'self'; …`), `X-Frame-Options:
   DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
   strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
   microphone=(), geolocation=()`.
3. **Cache headers**:
   ```bash
   curl -sI <url>/assets/<somehash>.js | grep -i cache-control   # immutable, 1y
   curl -sI <url>/ | grep -i cache-control                        # max-age=0
   ```
4. **No secret in bundle**:
   ```bash
   grep -rEil "sk-[A-Za-z0-9]{8}|AI_API_KEY|x-api-key|ANTHROPIC|OPENAI_API" <downloaded dist>/assets
   # must be empty
   ```
5. **AI health honest (Mode A)**:
   ```bash
   curl -s <url>/.netlify/functions/ai-health   # expect state "מושבת"
   ```
   No provider is contacted; the client shows the local-rules fallback with full
   disclosure.

## No-secret guarantee

- No `AI_*` value is ever committed (`.env.example` documents NAMES only).
- No `VITE_`-prefixed secret exists — only non-sensitive version/commit.
- `npm run scan:secrets` (run in preview-smoke and CI) fails the release if any
  key-shaped string, env value, or provider-auth wiring reaches `dist/`.

## Rollback

See `docs/ROLLBACK.md`.
