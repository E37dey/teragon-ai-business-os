# Supabase Live Auth Validation (S8.2)

Authoritative validation of the application Auth layer against the **live**
teragon-staging project. Safe facts only — no credentials, JWT, refresh token,
raw session, or key material is recorded here.

## Run metadata
- **Branch:** `feature/teragon-supabase-app-auth`
- **Validated commit:** `63ee27c`
- **Draft PR:** #2 — base `feature/teragon-supabase-platform`, head `feature/teragon-supabase-app-auth`
- **Local run id:** `auth-live/local/2026-08-02` (report: `ci-artifacts/staging-auth-report.json`, summary: `ci-artifacts/auth-live-summary.json` — both gitignored)
- **Project reached (masked ref):** `bjvi…azjj` (guarded — the suite fails hard on any other project)
- **Provider:** SupabaseAuthProvider over the browser-safe client; browser key privilege class = publishable/anon (guarded — a service_role/secret key aborts the run)
- **CI execution:** pending credential configuration (see below). This LOCAL run is the authoritative validation for this checkpoint.

## How it runs
`STAGING_AUTH_LIVE=1 npm run test:auth:live`
- Discovers ONLY `tests/staging-auth/live/**` (separate `vitest.staging-auth.config.ts`); excluded from the default suite, which stays green with 0 skips.
- Fails hard (never skips) if `STAGING_AUTH_LIVE!=1`, required config is missing, the wrong project is reached, a privileged key is supplied to the browser client, zero tests are discovered/executed, or any test is skipped.
- URL + publishable key come from the committed `netlify.toml` (browser-public); the admin password comes from the gitignored `.env.staging.local` (`TERAGON_ADMIN_PASSWORD`) and is never printed or persisted.

## Result — PASS

| Metric | Value |
| --- | --- |
| files | 1 |
| executed | 8 |
| passed | 8 |
| failed | 0 |
| skipped | 0 |

### Coverage proven against live staging
1. **Valid login** — admin authenticates; a real session exists; no raw session logged.
2. **Canonical identity** — active = true, organization = `org-teragon`, role = `crole-sysadmin`, membership server-resolved. Browser supplied only email + password; org/role/active/membership came from server records.
3. **Session restoration** — a re-initialised provider on the persisted session restores and re-resolves the same identity.
4. **Token refresh** — refresh succeeds; the resolved identity is unchanged.
5. **Logout** — Supabase session removed, app identity cleared; post-logout identity resolution is denied (fail closed, `MISSING_PROFILE`).
6. **Invalid password** — fails safely as `INVALID_CREDENTIALS`, no email enumeration, and **no fallback** to a local identity.

Route-protection redirect (unauth → login, intended-route preserved/restored, no
protected-UI flash) and the network/malformed fail-closed + no-IndexedDB-fallback
guarantees are proven deterministically in
`tests/auth/{RequireAuth,LoginPage,supabaseProvider,identity}` (they cannot be
forced against live staging without harming it).

## Corrections during validation
- **identity-resolution:** live staging surfaced that `current_profile()` returns
  a NULL composite (all-null object) when there is no session; the resolver had
  classified this as `MALFORMED_IDENTITY`. Fixed to `MISSING_PROFILE` (a null id
  means no profile) — both fail closed; this only sharpens the taxonomy. Added a
  regression unit test and aligned the live post-logout assertion. Reran the full
  default suite (2469 passed / 0 skipped) and the entire live suite (8/8). Commit
  `63ee27c`.

## CI execution (pending)
No GitHub Actions workflow is added in this checkpoint. If one is added later, the
following repository **secret names** must be configured (values are never
requested or committed here); the password must NOT be stored in `netlify.toml`
or any browser-visible repo variable:
- `STAGING_AUTH_LIVE` (set to `1`)
- `TERAGON_ADMIN_EMAIL`
- `TERAGON_ADMIN_PASSWORD`
- `STAGING_SUPABASE_URL` (or rely on the committed `netlify.toml` value)
- `STAGING_SUPABASE_ANON_KEY` (publishable; or rely on `netlify.toml`)

## Verdict
**S8 AUTH LIVE — PASS** (validated commit `63ee27c`).
No deployment, no merge, no RC, no production performed or authorized.
