# TERAGON — Supabase + Netlify Automation Runbook (Gate S1)

Fully scripted, cross-platform (Node ESM) Supabase + Netlify orchestration. **No manual Dashboard SQL, no
manual env entry.** Every remote command **fails closed** when its credentials are absent, **redacts**
secrets, is **idempotent**, and production is protected by `DEPLOY_PRODUCTION=true`. Source:
`scripts/platform/**`; the pinned Supabase CLI (`supabase@2.110.0`, dev dependency) is driven via
`npx supabase`.

## Commands

| npm command | Script | Behaviour |
|-------------|--------|-----------|
| `npm run platform:plan` | `plan.mjs` | **Read-only.** No credentials, no remote calls. Prints the full pipeline plan + credential-readiness **by NAME** + toolchain state (supabase CLI, Docker). Exit 0. |
| `npm run platform:local` | `validate-local.mjs` | Local gate, **stop on first failure**: oxlint → typecheck → typecheck:tests → vitest → build → scan:secrets, then Docker-gated live Supabase steps. Docker down → prints "DOCKER REQUIRED", **skips (never fakes)** the live steps, exits partial. |
| `npm run platform:staging` | `staging.mjs` | provision → migrate → bootstrap-admin → configure-netlify → deploy-preview → verify-preview. Each fail-closed. **No production.** |
| `npm run platform:verify` | `verify-preview.mjs` | Read-only smoke of the deployed preview. |
| `npm run platform:production` | `deploy-production.mjs` | **Refuses unless `DEPLOY_PRODUCTION=true`**, then fail-closed on credentials. |
| `npm run platform:rollback` | `rollback.mjs` | Re-point the Netlify alias to the previous good deploy; never a destructive DB reset. |

## Credentials (`.env.deploy` — names only in `.env.deploy.example`)

Read **only** from `process.env`; **never** logged, committed, written into reports, or `VITE_`-prefixed.

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (optional),
`SUPABASE_REGION` (optional, default `eu-central-1`), `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`,
`TERAGON_ADMIN_EMAIL`, `TERAGON_ADMIN_PASSWORD`, `DEPLOY_PRODUCTION` (default `false`).

Copy `.env.deploy.example` → `.env.deploy` (gitignored) and fill real values there.

## Guarantees (verified)

- **`platform:plan` is read-only + credential-free** (exit 0, contacts nothing).
- **Fail-closed:** e.g. `provision-staging` with no creds exits 2 printing the missing NAMES only; no remote
  body runs.
- **`DEPLOY_PRODUCTION` gate:** `deploy-production` exits 3 unless the gate is `true` (checked before the
  credential check, both before any remote body).
- **Redaction:** the logger scrubs all known secret values + `sk-…`/`Bearer …` patterns.
- **Idempotency:** verify-before-create — reuse `SUPABASE_PROJECT_REF`/the linked site, `db push` (never
  `db reset`) against remote, admin create-if-absent, Netlify env upsert (never a second site).
- **Never** `supabase db reset` against a linked/remote project.

## Local validation (Gate S5)

Requires the Docker daemon + a host with enough free RAM for the ~10-container Supabase stack (≈4–6 GB).
See `SUPABASE_LOCAL_VALIDATION_REPORT.md` for the current **S5 PARTIAL** status (daemon starts, but this
RAM-starved host left only 0.3 GB free → the stack cannot run safely) and the exact resume commands.

**S5.1 — CI validation:** the live database validation runs in GitHub Actions on an ephemeral local Postgres
(`.github/workflows/supabase-live-validation.yml`) — no remote project, no remote credentials. Current
status **S5 BLOCKED — CI INFRASTRUCTURE** (the project has no published GitHub repo yet). See
`SUPABASE_CI_VALIDATION_REPORT.md` for the resume path (authorize publication → push → `gh workflow run`).

## Remote staging (Gate S7) — gated

Runs only when all of `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`, `SUPABASE_DB_PASSWORD`,
`TERAGON_ADMIN_EMAIL`, `TERAGON_ADMIN_PASSWORD`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` are present, via
`npm run platform:staging` (create/reuse project → `db push` dry-run + apply → remote RLS check → server-
side admin bootstrap → deterministic seed → gen types → Netlify Preview env → Draft Preview → smoke). Then
`platform:production` only with `DEPLOY_PRODUCTION=true`.
