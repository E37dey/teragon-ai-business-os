# TERAGON — Supabase CI Validation Report (Gate S5.1)

The pending live-database validation was moved off the RAM-constrained host into an **isolated GitHub
Actions** environment that provisions an **ephemeral, LOCAL-only** Supabase Postgres (no remote project, no
remote credentials, never `--linked`). Workflow: `.github/workflows/supabase-live-validation.yml`.

## Final verdict: **S5 PASS**

The live ephemeral database validation ran and is **green** — all 14 migrations applied from an empty
database, schema/indexes/constraints verified, all 8 RLS isolation tests passed against live Postgres, seed
idempotent, TypeScript types generated, cleanup succeeded. Two real defects surfaced by the live run were
fixed (below) and the complete workflow was re-run to green.

## Run

| Field | Value |
|-------|-------|
| Private repository | `E37dey/teragon-ai-business-os` (PRIVATE) |
| Draft PR | **#1** (base `main` ← head `feature/teragon-supabase-platform`; **not merged**) |
| **Passing run ID** | **`30609542600`** (event `pull_request`, `conclusion: success`) |
| **Validated commit** | **`673e620`** on `feature/teragon-supabase-platform` |
| Runner | `ubuntu-latest` (Docker 28.0.4; 7.8 GiB RAM / 6.4 available; 14 GiB disk) |
| Supabase CLI | 2.110.0 (pinned) |

## Job results

**`static-gate` → success:** npm ci, oxlint, tsc strict, typecheck:tests, full Vitest (**2215**), production
build, secret scanner (CLEAN), **privileged-key bundle scan (no service-role/Supabase key in `dist`)**.

**`live-database` → success** (ephemeral local Postgres, no remote credential, never `--linked`):

| Step | Result |
|------|--------|
| `supabase db start` / `db lint` | ✓ |
| `db reset --local` (all 14 migrations from empty + staging seed) | ✓ |
| Schema verification | **47 public tables · 200 indexes · 145 FK/CHECK constraints · RLS enabled on every table** |
| **RLS isolation tests (8, live via psql)** | **ALL PASSED** — 01 anonymous-denial · 02 cross-org-read-denial · 03 cross-org-write-denial · 04 membership-change-denial · 05 role-escalation-denial · 06 inactive-user-denial · 07 aggregate-non-leakage · 08 service-only-bootstrap |
| Seed idempotency (re-apply `014`) | ✓ no duplication |
| `gen types typescript --local` | ✓ **2893 lines** |
| Repository adapter contract tests | ✓ (33 tests; live-adapter-CRUD suite is the documented next increment — the workflow's `tests/supabase/` hook is wired) |
| **Cleanup (`supabase stop`, `if: always()`)** | ✓ |
| Safe artifacts uploaded (no volumes/secrets) | ✓ `supabase-s5-reports` |

## Defects found by the live run + fixes (bounded, with regression coverage)

1. **`fix(db): default organizations.type so bootstrap satisfies customer_type NOT NULL`** (`d0aa50f`) — the
   `customer_type` domain is `NOT NULL`; `bootstrap_admin()` created a tenant org without a `type` → domain
   violation. Fix: `organizations.type default 'ארגון'` (a valid domain value) + a regression assertion in
   test 08 that the bootstrapped org has a non-null type.
2. **`fix(db): grant service_role table access (privileged server role)`** (`673e620`) — `012` granted table
   privileges to `authenticated`/`anon` but not `service_role`, so code running *as* service_role hit
   "permission denied for table profiles". Fix: `grant usage + select/insert/update/delete on all public
   tables to service_role` (it also bypasses RLS). RLS remains the isolation boundary for anon/authenticated.

Each fix was pushed and the **entire workflow re-ran** (not just the failed step). No test was skipped, no
RLS policy weakened, no organization isolation removed, no live test replaced with a mock, no timeout
inflated. Neither was a product/database failure mislabeled as infrastructure.

## Success requirements — met (live)

all 14 migrations apply from empty ✓ · 47 tables + indexes + constraints exist ✓ · seed idempotent ✓ ·
generated types succeed ✓ · anonymous denied ✓ · cross-org reads denied ✓ · cross-org writes denied ✓ ·
role escalation denied ✓ · inactive users denied ✓ · membership restrictions ✓ · audit events immutable
(no update/delete policy; enforced by schema+RLS) ✓ · admin bootstrap service-only ✓ · aggregate-count
non-leakage ✓ · cleanup succeeds ✓ · **no remote Supabase resource contacted** ✓ · all static gates green ✓.
Repository CRUD / pagination / duplicate-submit are proven at the **contract level** (33 tests) in the
static gate; a dedicated **live-adapter** CRUD suite (`tests/supabase/**`) is the wired next increment.

## Security posture (verified)

No real credential required for the CI local DB (no `SUPABASE_ACCESS_TOKEN`/`PROJECT_REF`/`DB_PASSWORD`);
never `--linked`; no remote project contacted (diagnostics + reports show only the local `127.0.0.1:54322`
stack). No service-role key in build artifacts (privileged-key bundle scan). Only sanitized reports uploaded
(no DB volumes, no secrets); the CLI's ephemeral local keys were not printed as artifacts.

**Stopped after S5.** No S6 credentials, remote Supabase staging, Netlify deployment, Release Candidate,
production deployment, or merge. `LOCAL_INDEXEDDB` remains the runtime default; all Business Graph / Auth /
AI flags remain OFF; the release branch `feature/teragon-business-graph` is frozen at `7240410`.
