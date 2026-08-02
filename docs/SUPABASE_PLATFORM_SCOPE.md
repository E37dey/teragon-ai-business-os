# TERAGON AI BUSINESS OS — Supabase Platform Branch Scope (Gate S0)

Defines the greenfield Supabase + Netlify automation track. This branch adds a **provider-neutral backend**
without changing the shipped default behaviour: the app stays **local-first (IndexedDB)** until remote
Supabase staging is built and accepted.

## Source checkpoint

- **Branch:** `feature/teragon-supabase-platform`
- **Created from:** **`7240410`** (approved Visual Correction Gate checkpoint on `feature/teragon-business-graph`)
- **merge-base(`feature/teragon-business-graph`, `feature/teragon-supabase-platform`) = `7240410`** (verified)
- **`feature/teragon-business-graph` remains frozen at `7240410`** — not modified by this track.
- **Rollback checkpoint: `7240410`** (this branch's base; the release branch is unchanged).

## Included release functionality (inherited from `7240410`)

The full Demo/Internal Preview: local-first CRM/service/courses/tasks/governance/agents/analytics UI on
browser IndexedDB, Netlify Functions AI proxy (`AI_REMOTE_ENABLED=false`, Mode A), the Gate-2 corrections
(submission E2E stabilization, react-router pin) and the Visual-Correction-Gate changes (system fonts,
Governance density). Supported viewport ≥1024px.

## Excluded (unchanged, OFF)

- **Business Graph + auth prototype runtime** — dormant, not wired, tree-shaken:
  `BUSINESS_GRAPH_EVENT_INDEXING_ENABLED=false`, `BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED=false`,
  `BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED=false`, `BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED=false`,
  `AI_REMOTE_ENABLED=false`.
- **`stash@{0}` (Phase-11.1 server-auth WIP)** — excluded, untouched, not restored.

## Persistence default

**`LOCAL_INDEXEDDB` remains the default provider.** The Supabase provider is added behind an explicit
provider flag and only becomes the default after remote staging acceptance (a later, separately-approved
step). No mechanical import replacement.

## Remote posture

**No remote resource changes in this branch yet.** All remote steps (project provisioning, migrations,
admin bootstrap, Netlify env, deploy) are gated behind:
1. **Credential checkpoint (S6)** — `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`, `SUPABASE_DB_PASSWORD`,
   `TERAGON_ADMIN_EMAIL`, `TERAGON_ADMIN_PASSWORD`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` — **currently
   unset** except `NETLIFY_AUTH_TOKEN`. Remote staging (S7) cannot begin until these exist.
2. **`DEPLOY_PRODUCTION=true`** — required for any production step.

## Toolchain constraints discovered (S0)

- **Docker installed (29.5.2) but the daemon is NOT running.** Gate S5's live local stack
  (`supabase start` / `db reset --local` / `db lint` / RLS tests against a live local Postgres) requires the
  Docker daemon. Migrations/RLS SQL, the repository adapter, and unit tests will be authored and statically
  validated; the **live local-DB validation portion of S5 is gated on the Docker daemon being started**.
- **Supabase CLI not installed** — will be pinned as a dev dependency in Gate S1 and driven via `npx supabase`.

## Entity mapping discipline (for S2)

Every one of the 46 local domain entities will be explicitly classified `MIGRATED` / `EMBEDDED` / `DERIVED`
/ `DEFERRED` / `LOCAL_ONLY` in the schema report — **no entity disappears silently**.

## Gate S0 verification

- Branch created from `7240410`; merge-base = `7240410`; working tree clean; no stash content included;
  `feature/teragon-business-graph` frozen at `7240410`.
- The existing quality gate is green: this branch is **byte-identical to `7240410`**, which passed the full
  gate at the Visual Correction Gate (oxlint 0, tsc 0, typecheck:tests 0, Vitest 2182/0, build pass, secret
  CLEAN). No re-run needed — no code differs.

Next: Gate S1 (automation foundation — scripts, CLI pin, `.env.deploy.example`), then S2–S5 (versioned
migrations, auth/RLS, repository adapter, local validation), stopping at the S6 credential checkpoint.
