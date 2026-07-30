# TERAGON Supabase — RLS SQL tests (Gate S3, executed in Gate S5)

Plain-SQL assertion tests that prove the deny-by-default RLS model authored in
`supabase/migrations/011_rls_helpers.sql` … `014_staging_seed.sql`. Each file
opens a transaction, simulates an authenticated (or anonymous / service) caller
via `set local role` + `request.jwt.claims`, asserts with `RAISE EXCEPTION` on
failure (a clean run raises no error and prints `PASS …`), then `ROLLBACK`s so
the database is left untouched.

They exercise **real RLS**: the tests switch the Postgres role to
`anon` / `authenticated` / `service_role` (none of which own the tables, so RLS
is enforced), and set `request.jwt.claims.sub` so `auth.uid()` resolves to a
seeded profile. They depend on the deterministic fixtures in `014_staging_seed.sql`
(two tenants `org-staging-demo` / `org-staging-beta`; users: Sales A active/orgA,
Sales B active/orgB, Viewer C **inactive**/orgA, Sysadmin D admin/orgA).

## How Gate S5 runs them

After `supabase start` and applying migrations `001…014` to the local DB:

```bash
for f in supabase/tests/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1
done
```

Any failed assertion aborts with a non-zero exit; a full pass prints every
`PASS …` notice.

## Files and what each proves

| File | Proves |
|------|--------|
| `01_anonymous_denial.sql` | No `auth.uid()` (anon, empty claims) ⇒ helpers deny by default, every tenant read returns 0 rows, and INSERT is refused. |
| `02_cross_org_read_denial.sql` | Sales A sees their 2 org-A customers but **cannot read** org-B rows — not by org filter, not by explicit id (customers, leads). |
| `03_cross_org_write_denial.sql` | Sales A can write into their own org, but a row stamped with org B's id is blocked by **WITH CHECK**; UPDATE/DELETE of an org-B row affect **0 rows**. A client-supplied `organization_id` can never escape the tenant. |
| `04_membership_change_denial.sql` | A non-admin cannot INSERT a membership (self role/tenant grant) nor UPDATE a membership's role (0 rows); an admin (`user.manage`) can — mutations are admin/service only (role-escalation protection). |
| `05_role_escalation_denial.sql` | Sales A may edit their own `name` but **cannot** change their own `role_id`, `organization_id`, or `active` (column-guarded self-update WITH CHECK) — self-escalation is structurally impossible. |
| `06_inactive_user_denial.sql` | Viewer C's org resolves, but `is_active()` is false ⇒ reads return 0 rows and writes are refused. |
| `07_aggregate_non_leakage.sql` | `count(*)` as user A = 2 (org A only), as user B = 1 (org B only) — RLS filters before aggregation, so totals never leak another tenant. |
| `08_service_only_bootstrap.sql` | `bootstrap_admin()` cannot be executed by `authenticated` (grant is service-role only), its internal `is_service_role()` guard refuses non-service callers, and with the service role it succeeds **and is idempotent** (same profile, no duplicate membership). |

## Notes

- Error classes caught for denials: `insufficient_privilege` (SQLSTATE 42501,
  raised by RLS WITH CHECK violations and by missing privileges) and
  `check_violation`. Invisible-row writes are asserted via `row_count = 0`.
- These tests are **staging/local** — they rely on the staging seed, which
  production must not run.
