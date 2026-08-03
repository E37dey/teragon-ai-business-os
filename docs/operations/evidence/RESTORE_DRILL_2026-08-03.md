# Restore Drill Evidence — 2026-08-03

**Verdict: RESTORE DRILL PARTIAL — no backup artifact exists to restore.**

Executed against `docs/operations/RESTORE_DRILL_RUNBOOK.md` and ADR `0003`.
Repository SHA under test: `5dd547e99decf73a7375385115c073b98a0255c1`
(base `feature/teragon-supabase-app-auth`).

---

## 1. Headline finding

The drill was run to prove recoverability. It proved the opposite of what the
readiness note assumed:

```
GET /v1/projects/bjvi…azjj/database/backups  → HTTP 200
{"region":"eu-central-1","pitr_enabled":false,"walg_enabled":true,"backups":[]}
GET /v1/organizations/…                      → {"plan":"free"}
```

**Active staging has zero backups and PITR disabled, on a free-plan
organization.** There is no recovery point, so there is nothing to restore.
`OPERATIONS_READINESS.md` currently says *"Neon PITR exists at the platform
level"*; for this Supabase project that is **not** the case.

Consequently:
- **Native restore-to-new-project (runbook path A): UNAVAILABLE** — not blocked
  by permissions, but because no backup artifact exists.
- **Logical backup from staging (path B): NOT PERFORMED.** `pg_dump`/`psql` are
  absent locally, and the CLI's dump path requires a connection string or
  `--password` in **argv**, which the drill's secret rules forbid.
- What *was* executed is a **schema + seed reconstruction** into a disposable
  project. Per the runbook and the mission's explicit instruction, that is **not**
  a backup restore and is **not** reported as PASS.

**RPO is UNDEFINED (unbounded).** With no backup, any incident loses everything
since project creation. This is the single most important output of the drill.

---

## 2. Disposable target (safe metadata only)

| Field | Value |
|---|---|
| Name | `teragon-restoredrill-20260803-0518a4` |
| Ref | `fftyyvkpqnibbicmyuqp` |
| Region | `eu-central-1` (matches staging) |
| Organization | `vthlolcsedczobrxiacs` (free plan) |
| Postgres | 17.6.1.155 (identical to staging) |
| Differs from staging ref | **yes** — asserted in code before any write |

Created via the Management API because the CLI requires `--db-password` in argv.
The password was CSPRNG-generated, sent in the request **body**, and written only
to gitignored `.env.restore-drill.local`.

**Deviation (recorded honestly):** the account has exactly **one** organization,
which also contains an unrelated project named `clip-production`. The runbook asks
for a non-production organization; none other exists. Mitigated by targeting only
the newly created ref, and by a hard guard that refuses any SQL whose target ref
equals staging.

---

## 3. Timings

| Event | Client UTC |
|---|---|
| Drill start / capability probe | `2026-08-03T17:30:55Z` |
| Reconstruction initiated | `2026-08-03T17:32:12Z` |
| Migrations complete | `2026-08-03T17:32:35Z` (23 s) |
| Verification complete | `2026-08-03T17:36:29Z` |

- **RTO (reconstruction → verified read-only): 4 m 17 s.** This is the *rebuild*
  time, **not** a restore time — a real restore would additionally need to load
  data that does not currently exist.
- **RPO: UNDEFINED / unbounded** (no recovery point).

*Clock note:* the provider reported `created_at = 2026-08-03T16:16:57Z` for the
same action the client clock timestamps at ~17:31Z. The ~1 h offset is recorded as
observed and not reconciled; durations above are client-measured and internally
consistent.

---

## 4. Structural verification (drill target)

| Check | Drill target | Staging (read-only) | Match |
|---|---|---|---|
| Migrations applied | **14** (001–014) | 14 | ✓ |
| Public tables | **47** | **47** | ✓ |
| RLS enabled | **47 / 47** | **47 / 47** | ✓ |
| Tables without RLS | **0** (`[]`) | 0 | ✓ |
| Policies | **185** | **185** | ✓ |
| Indexes | 200 | — | — |
| Foreign keys | 96 | — | — |
| Functions (`public`/helpers) | 10 | — | — |
| Triggers | 47 | — | — |
| Storage buckets | 2 | — | — |
| Auth users (from seed 014) | 4 | — | — |

Migration `015` was **not** created; the repository remains at exactly 001–014.

Seeded reference rows: `organizations=2`, `roles=9`, `customers=3`, `contacts=0`,
`profiles=4`, `memberships=4`. CRM policy counts: `customers=4`, `contacts=4`.

`supabase/seed/staging_seed.sql` **refused to run** — its own `SEED_GUARD` raised
`canonical admin profile for org-teragon not found — run admin bootstrap first`.
That is the seed's fail-closed guard behaving correctly on a fresh project, and no
real administrator credential was copied. Recorded as expected, not a defect.

---

## 5. Tenant isolation — the repository's own 8 proofs

Run against the drill target; each is `begin … rollback`, so nothing persisted.

| Test | Result |
|---|---|
| `01_anonymous_denial` | PASS |
| `02_cross_org_read_denial` | PASS |
| `03_cross_org_write_denial` | PASS |
| `04_membership_change_denial` | PASS |
| `05_role_escalation_denial` | PASS |
| `06_inactive_user_denial` | PASS |
| `07_aggregate_non_leakage` | PASS |
| `08_service_only_bootstrap` | PASS |

**8 / 8 PASS.**

---

## 6. Customers and Contacts read verification

Exercised through the same RLS path the app uses (`authenticated` role + JWT
claims), counts only:

| Path | Result |
|---|---|
| Customers, member of `org-staging-demo` | visible **2**, own-org **2**, other-org **0**, `auth_org_id()` resolved correctly |
| Contacts, same identity | own-org **1**, other-org **0** (fixture inserted and **rolled back**) |
| Anonymous | customers **0**, contacts **0** — **fail-closed** |

**Fixture audit after verification:** `drill_contacts=0`, `drill_customers=0`,
`drill_users=0`. Zero temporary fixtures remain.

---

## 7. Safety confirmations

- Staging received **read-only `SELECT`** traffic only (helper rejects non-SELECT
  and refuses staging as a SQL target outright). Staging: `ACTIVE_HEALTHY`.
- No application configuration was pointed at the drill target; `netlify.toml`,
  `.env.staging.local` and all feature flags are untouched. Working tree showed
  only the new `scripts/restore-drill/` directory.
- No deploy, no feature-flag change, no migration created, no Production action.
- No plan upgrade, purchase or billing approval. One 402 was encountered and
  resolved by **removing** the `desired_instance_size` field, never by upgrading.
- No secret value, connection string, token, JWT or password was printed, placed
  in argv, logged or committed. `.env.restore-drill.local` is gitignored
  (`.gitignore:6 .env.*`).

---

## 8. Cleanup — executed and verified

Performed `2026-08-03T17:41:15Z` (client UTC), after the evidence commit and
Draft PR #9, per runbook §8.

| Action | Result |
|---|---|
| `DELETE /v1/projects/fftyy…myuqp` | **HTTP 200** |
| Disposal verified by **absence** in `GET /v1/projects` | `drillProjectStillExists=false` |
| Staging still present and healthy | `stagingPresent=true`, `ACTIVE_HEALTHY` |
| Local credential file removed | `.env.restore-drill.local` → removed (`true`) |
| Dump artifacts | none were ever produced (path B not performed) |

Deletion was guarded in code: the script refuses any ref equal to staging **and**
any project whose name does not begin `teragon-restoredrill-`. Disposal is proven
by the project's absence from the account listing, not by the delete call's
status alone.

The drill left **no** residue: no project, no credential file, no dump, and no
fixtures (§6 audit returned zeros before disposal).

---

## 9. What must change before backup/recovery can leave "Untested"

1. **Enable a real backup mechanism for staging.** Today there is none: daily
   backups and PITR require a paid plan. Until then, recoverability is zero and
   RPO cannot be measured. *This requires a human billing decision and was
   deliberately not taken.*
2. Re-run this drill against an actual recovery point once backups exist, so RPO
   becomes a measured number rather than "undefined".
3. Correct `OPERATIONS_READINESS.md`, which currently implies platform PITR
   exists for this project.

Until (1) and (2) are done, backup/recovery **remains Untested**, and this
document is evidence of a **PARTIAL** drill only.
