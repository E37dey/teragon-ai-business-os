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

## S7.0.1 — connection-value wiring

The connection values that only exist AFTER a project is created/selected (URL +
API keys) are obtained and propagated through the SAME credential provider
mid-apply, so the plan no longer falsely reports the whole pipeline blocked.

### Runtime credential context (`shared/credentials.mjs`)

The provider now holds an in-memory runtime layer on top of env + staging-file:
`loadFromProcessEnvironment()`, `loadFromLocalSecureFile()`,
`loadFromSupabaseCliSession()`, `setRuntimeValue()/setRuntimeValues()`,
`refreshReadiness()`, `getRequired()`, `getOptional()`, `getPresenceReport()`,
`createRedactedChildEnvironment()`, `clearRuntime()`. Precedence: `process.env` >
runtime > staging-file. Every script reads credentials only through the provider.
There is deliberately no method that serializes all credentials. Runtime secrets
are in-memory only and cleared on process exit.

### Modern + legacy key model (`shared/keys.mjs`, hardened S7.0.2)

After project verification the pipeline queries the project API keys and
normalizes them to `SUPABASE_BROWSER_KEY` (`PUBLISHABLE` modern or `ANON_LEGACY`)
and `SUPABASE_SERVER_KEY` (`SECRET` modern or `SERVICE_ROLE_LEGACY`), retaining
the source kind. The browser key may become a `VITE_` var; the server key never.

**Root cause fixed (S7.0.2):** the live CLI returns entries whose `type` field is
the non-semantic value `default` (both publishable and secret may report
`default`). Classification therefore does NOT trust `name`/`type` alone. Each
record is resolved by a deterministic per-record precedence:

- **A. Recognized explicit semantic** name/type — only exact `publishable`/`anon`
  (browser) or `secret`/`service_role` (server); `default`/`primary`/`generated`/
  empty are ignored as non-semantic.
- **B. Modern key format** — inspected in memory (preferring a safe prefix field):
  `sb_publishable_` → browser, `sb_secret_` → server; any other `sb_` → rejected.
- **C. Legacy names** — exact `anon`/`service_role` (subsumed by A over both
  fields).
- **D. Legacy JWT role** — when JWT-shaped with no reliable name, the payload is
  decoded LOCALLY (classification only, never verification/auth); `role` `anon` →
  browser, `service_role` → server; any other role rejected.

A real modern project exposes BOTH new keys (publishable/secret) AND legacy keys
(anon/service_role) at once — the live response is **4 records**. Each slot is
filled by PREFERRING the modern kind and falling back to legacy; that
coexistence is not ambiguous. It FAILS CLOSED when: a slot has no candidate; the
chosen kind has more than one DISTINCT value; a record's semantic metadata
conflicts with its key format; a modern key has an unsupported prefix; a legacy
JWT has an unexpected role; or the response shape is unknown. The raw CLI JSON,
key values, JWTs, and sensitive prefixes are NEVER logged or placed in errors —
error messages carry only a record index, a short safe format identifier, the
detected source kind, and the ambiguity category. The `api-keys` adapter captures
stdout privately and, on failure, throws a sanitized error with no raw output;
the safe result exposes only record count, selected source kinds, and a success
boolean — no values.

### Connection discovery (`shared/connection.mjs`)

`PROJECT_READY → re-verify ref belongs to org → resolve URL from authoritative
metadata → retrieve + classify API keys → setRuntimeValues() → refreshReadiness()`
→ migrate/bootstrap/netlify become READY in the same apply. Readiness never
derives from project creation alone.

### Readiness states (`classifyPipelineReadiness`)

- `PRE_PROVISION_READY` — creds to create/select a project exist.
- `POST_PROVISION_PENDING` — project-derived URL/keys not yet existing (EXPECTED
  before creation; NOT a block).
- `APPLY_READY` — the orchestrator can obtain the post-provision values
  automatically during the same apply.
- `BLOCKED` only when: CLI session unavailable, org unresolved, DB password
  absent, admin confirmation absent, or Netlify target unresolved (and, at an
  actual mutation, `APPLY_STAGING` absent).

### Safe persistence + resume

Persisted to gitignored `.env.staging.local` (owner-only): `SUPABASE_PROJECT_REF`,
`SUPABASE_URL`, `SUPABASE_ORG_ID`, `NETLIFY_SITE_ID`, `TERAGON_ADMIN_EMAIL`,
`TERAGON_ADMIN_EMAIL_CONFIRMED`, and the browser key (redacted in output).
The privileged SERVER key and the Management-API access token are NEVER persisted
— kept in process memory and re-fetched from the authenticated CLI session on
resume. A resumed apply (stored ref, no stored privileged key, live session)
re-verifies the project and re-fetches key metadata; it never creates a second
project because a runtime key is absent.

## S7.1 / S7.1.2 — remote schema + RLS validation

After migrate, two remote stages run against the LINKED project via the Supabase
CLI Management-API SQL endpoint (`supabase db query --linked`, which runs as the
privileged `postgres` role):

- **schema-verify** (`schema-verify.mjs`) — one read-only introspection query
  compared to the CI baseline: 47 public tables, 14 migrations, 3 namespaces,
  RLS enabled on every protected table, 9 functions incl. `bootstrap_admin`,
  FK/CHECK/index/policy presence, 0 nullable tenant `organization_id`
  (`organizations`/`roles` exempt), 2 storage buckets. Fails closed on drift;
  never auto-repairs; records safe totals only.
- **rls-validate** (`rls-validate.mjs`) — the 8 canonical isolation checks
  (`supabase/tests/0*.sql`) executed live (temp data, per-script rollback).

### Introspection result-shape contract (S7.1.2)

The Management-API `db query -o json` envelope does NOT return uniform JS types.
The introspection query and the normalizer (`schema-normalize.mjs`) form a strict
contract:

| Field | SQL expr | JS types accepted | Normalizer | Comparison |
| --- | --- | --- | --- | --- |
| `public_tables` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `=== 47` |
| `namespaces` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `>= 3` |
| `migrations` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `=== 14` |
| `indexes` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `> 0` |
| `fk_constraints` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `> 0` |
| `check_constraints` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `> 0` |
| `rls_policies` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `> 0` |
| `storage_buckets` | `count(*)::int` | number \| numeric string | `parseIntegerField` | `=== 2` |
| `functions_present` | `to_jsonb(array_agg(distinct …))` | JSON array \| JSON-array string \| PG-literal string | `parseStringArrayField` | required 9 ⊆ present |
| `rls_disabled_tables` | `to_jsonb(array_agg(distinct …))` | same | `parseStringArrayField` | length `=== 0` |
| `nullable_orgid_tenant_tables` | `to_jsonb(array_agg(distinct …))` | same | `parseStringArrayField` | length `=== 0` |

**Two error categories are kept distinct:** an `INTROSPECTION_PARSE_FAILURE`
(missing field / unknown representation / malformed array — from the normalizer)
is NEVER reported as `SCHEMA_DRIFT`. This prevents the S7.1 defect where Postgres
array-literal strings (`{a,b}`) were coerced to `[]` and surfaced as a false
"missing functions" drift. The SQL now emits JSON arrays via
`coalesce(to_jsonb(array_agg(distinct v order by v)), '[]'::jsonb)`; the
normalizer still accepts the legacy PG-literal shape for robustness. The
introspection query is executed from a temp `.sql` file (never inline argv) — see
`adapters/db.mjs`. No raw SQL response, value, or credential ever enters logs or
errors.

## Human inputs still required before an operator can apply

- `SUPABASE_PROJECT_REF` — only if reusing an existing project (else created).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — resolved
  after provisioning (server-only; never `VITE_`-prefixed for the service key).
- `TERAGON_ADMIN_EMAIL_CONFIRMED=true` — **the admin email is UNCONFIRMED**;
  bootstrap-admin refuses until this is explicitly set.
- `APPLY_STAGING=true` — to leave plan mode.
