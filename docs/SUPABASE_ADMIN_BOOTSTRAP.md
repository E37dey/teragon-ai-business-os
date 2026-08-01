# Supabase Admin Bootstrap (Gate S7.0)

`scripts/platform/bootstrap-admin.mjs` establishes the first administrator using
**only** the sanctioned server-side path. The previous direct-SQL path is gone.

## The only sanctioned path

1. **Supabase Admin API** via a **service-role** client
   (`@supabase/supabase-js`, `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`):
   `auth.admin.createUser({ email, password, email_confirm: true })`.
2. **Canonical `bootstrap_admin` RPC** (service-role-only, `SECURITY DEFINER`,
   `013_storage_and_functions.sql`): creates the org + `crole-sysadmin` profile +
   membership, idempotently (`ON CONFLICT DO NOTHING`).

There is **no** `insert into auth.users`, **no** `supabase db execute`, and **no**
seed-file execution anywhere in the script (asserted by a source-scan unit test).

## Hard rules enforced

- **Email only from `TERAGON_ADMIN_EMAIL`.** Never hardcoded, never invented. The
  proposed `soundcloudillusion@gmail.com` is **UNCONFIRMED** and is never used.
- **Password only from the secure credential provider** (`TERAGON_ADMIN_PASSWORD`),
  passed to the Admin API in-process — never logged, never an argv flag.
- **The browser never selects role/org/status.** The RPC is service-role-only and
  off the client path entirely.
- **Idempotent.** `findUserByEmail` first; an existing user is reused (never
  duplicated). The RPC is safe to re-run.
- **Self-verifying.** After the RPC, the script reads the profile + membership and
  asserts: `active === true`, `role_id === 'crole-sysadmin'`,
  `organization_id === <org>`, and an active membership — else it fails.
- **Never logs the password or any session token.** Email is masked to domain-only.

## Why it refuses in S7.0

Bootstrap is **held** behind an explicit confirmation gate: the credential
provider requires `TERAGON_ADMIN_EMAIL_CONFIRMED=true` for the `bootstrap-admin`
command. That gate is **not set**, so validation is not ok and the command
refuses before any remote action. The full code path is complete and covered by
unit tests using a fake Admin adapter (create-new, reuse-existing/idempotent,
verification-failure, and confirmation-gate-refusal cases).

## Operator steps (later, once confirmed)

1. Confirm the real first-admin email; set `TERAGON_ADMIN_EMAIL` accordingly.
2. Ensure `TERAGON_ADMIN_PASSWORD` (CSPRNG from S6.1) is present.
3. Provide `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-only).
4. Set `TERAGON_ADMIN_EMAIL_CONFIRMED=true` and `APPLY_STAGING=true`, then run the
   pipeline (or `node scripts/platform/bootstrap-admin.mjs apply`).
