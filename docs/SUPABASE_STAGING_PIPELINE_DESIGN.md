# Supabase Staging Pipeline Design (Gate S7.0)

The hardened staging pipeline that provisions a Supabase project, applies the
S5-validated migrations, bootstraps the first admin, configures the linked
Netlify site, deploys a Deploy Preview, and runs a remote acceptance suite —
with a **plan/apply separation**, **fail-closed credentials**, **verify-before-
create**, **stage tracking with idempotent resume**, and **zero remote mutation
until an operator opts in**.

## Safety invariants (never violated)

- **Plan mode mutates nothing.** `npm run platform:staging:plan` is read-only:
  safe status/auth probes only. It reports credential readiness by NAME +
  authorization KIND, and the intended actions. Exit 0, ZERO mutations.
- **Apply is double-gated.** `npm run platform:staging:apply` refuses unless
  `APPLY_STAGING=true`. Production stays separately gated by
  `DEPLOY_PRODUCTION=true` (unchanged). Neither is set in S7.0.
- **Value-blind.** Scripts validate credentials by NAME/authorization kind only.
  Secret VALUES (DB password, service-role key, tokens) are resolved by the
  provider, handed straight to adapters via child ENV (never argv), and
  registered with the redacting logger so they can never appear in output.
- **No fake success.** Every step returns a structured verdict; nothing reports
  success it did not achieve. A health timeout, an ambiguous project, an
  unexpected remote migration, a wrong site/commit — all fail safely.

## Components

| Module | Responsibility |
| --- | --- |
| `shared/credentials.mjs` | Unified credential provider (precedence, fail-closed, redaction) |
| `shared/names.mjs` | `COMMAND_CREDENTIALS` spec + `SECRET_VALUE_NAMES` (NAMES only) |
| `shared/runtime.mjs` | plan/apply mode + `APPLY_STAGING` gate + entrypoint guard |
| `shared/stage.mjs` | Stage tracker (masked metadata, idempotent resume) |
| `shared/migrations.mjs` | Migration lineage lock, destructive scan, remote-history compare |
| `shared/adapters/supabase.mjs` | Real Supabase CLI + Admin-API adapter (APPLY only) |
| `shared/adapters/netlify.mjs` | Real Netlify CLI adapter (APPLY only) |
| `provision-staging.mjs` | Verify-before-create project provisioning |
| `migrate.mjs` | Migration-safety gate + additive push (never reset) |
| `bootstrap-admin.mjs` | Admin-API + canonical `bootstrap_admin` RPC |
| `configure-netlify.mjs` | Scoped env vars (browser-safe vs Functions-only) |
| `deploy-preview.mjs` | Clean-tree + reviewed-commit deploy with provenance |
| `verify-preview.mjs` | Read-only preview health + provenance |
| `staging.mjs` | Orchestrator (plan/apply, stop-on-failure, idempotent resume) |

## Adapter injection

Each script's core is an exported pure function that takes injected adapters
(credential provider, Supabase adapter, Netlify adapter, stage tracker, command
runner). Real adapters are the defaults; tests substitute deterministic fakes
with zero network. Thin `#!/usr/bin/env node` entrypoints wire the real
adapters and translate a verdict into an exit code.

## Stage machine

`PLAN_READY → PROVISIONING → PROJECT_READY → MIGRATIONS_APPLIED →
ADMIN_BOOTSTRAPPED → NETLIFY_CONFIGURED → PREVIEW_DEPLOYED → ACCEPTANCE_PASSED`
plus `FAILED`. The tracker records only SAFE masked metadata (masked ref/site,
timestamps, state) to a gitignored file. A failed rerun detects completed
idempotent steps and continues without duplicating a project/admin, deleting a
remote DB, resetting production, or overwriting unrelated Netlify config.

## Credential precedence

1. `process.env` (CI / explicit override)
2. `.env.staging.local` (gitignored S6.1 output; parsed safely; values redacted)
3. an authenticated Supabase CLI session — used ONLY for Management-API
   authorization when `SUPABASE_ACCESS_TOKEN` is absent (expressed as
   "authorization = env-token OR cli-session", never a bare token NAME).

## Human inputs still required before an operator can apply

- `SUPABASE_PROJECT_REF` — only if reusing an existing project (else created).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — resolved
  after provisioning (server-only; never `VITE_`-prefixed for the service key).
- `TERAGON_ADMIN_EMAIL_CONFIRMED=true` — **the admin email is UNCONFIRMED**;
  bootstrap-admin refuses until this is explicitly set.
- `APPLY_STAGING=true` — to leave plan mode.
