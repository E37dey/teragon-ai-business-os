# Supabase Browser Acceptance — Live Local Preview (S7.3B-PREP)

Real browser-driven acceptance of a LOCALLY-served Preview-context build wired to
the live teragon-staging project. Safe facts only — no credentials, keys, tokens,
sessions, or publishable-key value.

- **Branch:** `feature/teragon-supabase-app-auth`
- **Validated commit:** `4844a55e24fa`
- **Draft PR:** #2 — base `feature/teragon-supabase-platform` (unmerged)
- **Local origin:** `http://localhost:4180` (served from `dist`; never a deployed origin)
- **Backend:** teragon-staging, masked ref `bjvi…azjj`, provider `SUPABASE`
- **No Netlify deploy / no env mutation / no CI secret config / no merge / no RC / no production.**

## How it runs
`STAGING_ACCEPTANCE_LIVE=1 ACCEPTANCE_BASE_URL=http://localhost:<port> INTENDED_COMMIT=<sha> STAGING_SUPABASE_PROJECT_REF=<ref> npm run test:staging:acceptance`
- Discovers ONLY `e2e/acceptance/*.accept.ts` (dedicated `e2e/acceptance.config.ts`); excluded from the default Vitest + Playwright suites.
- Fails hard (never skips) unless enabled + fully configured, the target is a LOCAL origin, and the project ref matches. Provenance (provider/masked-ref/commit/flags) is verified BEFORE any login or write.
- Writes a SAFE machine-readable report to `ci-artifacts/acceptance-report.json` (gitignored).

## Result — 8 passed / 0 failed / 0 skipped · verdict = **PARTIAL**

| # | Test | Result |
| --- | --- | --- |
| 1 | Provenance: SUPABASE build, masked ref `bjvi…azjj`, commit `4844a55e24fa`, Graph/AI flags OFF | PASS |
| 2 | Route protection: unauth deep link `/crm` → `/login`, no protected-content flash | PASS |
| 3 | Invalid password: safe Hebrew error, no enumeration, no local fallback, stays on `/login` | PASS |
| 4 | UI login via the real Hebrew form; session restores on refresh | PASS |
| 5 | Shell auth-wiring capability probe (identity display + logout) | PASS (records gaps) |
| 6 | Domain acceptance-through-the-UI capability catalogue | PASS (records gaps) |
| 7 | Security: no wrong-project traffic, no Google Fonts, no secret VALUES in the build | PASS |
| 8 | Routing/theme/RTL: RTL + no horizontal overflow at 1024/1280/1440 + theme switch | PASS |

### Verdict = PARTIAL — why
The harness ran cleanly, but honestly recorded 1 blocking defect + 21 UI_CAPABILITY_MISSING findings (see below). It NEVER fabricated a domain PASS.

## Auth (through the real UI, against live staging) — WORKS
Unauth deep-link redirect with intended-route preservation, real Hebrew login, session restore on refresh, and safe invalid-password handling (no email enumeration, no fallback to a local identity) all pass against staging.

## BLOCKING defect (1)
- **SUPABASE composition serves domain data from IndexedDB.** In the Preview (`VITE_PERSISTENCE_PROVIDER=SUPABASE`) build the app still opens the local `teragon-os` IndexedDB store at boot for ALL domain data. The domain module pages (`src/modules/**`) read/write `@/repositories` (`getRepository` → `IndexedDBRepository`) and never the Supabase persistence boundary (`getPersistenceRepository` / `createSupabaseRepository`), which is imported by nothing in the UI. Only the auth layer talks to staging.

## UI_CAPABILITY_MISSING (21)
- **auth-shell (2):** logout control wired to `signOut`; display the resolved Supabase identity (the header shows a local/demo user, not the auth-context identity).
- **domains (19):** customers, contacts, leads, opportunities, quotations, products, printer_models, customer_printers, service_tickets, repairs, courses, enrollments, stage_progress, tasks, recommendations, approvals, knowledge, memory, governance_audit — none has a UI create/update that persists to staging (module pages write local IndexedDB).

Consequently the isolation, pagination, idempotency, atomicity, and named-approval acceptance families are not exercisable through the UI against staging yet (their data never reaches staging). They are deferred, not faked.

## Expected (non-failing) runtime artifacts
- `failedRequired=1` + `consoleErrors=1`: the invalid-password test intentionally triggers a `400` from GoTrue (`/auth/v1/token`) which supabase-js logs once. Expected; does not affect any required flow.

## Security / console / network
- No wrong-project Supabase traffic (only `bjvi…azjj`).
- No Google Fonts requests.
- No secret VALUES in the served HTML/JS (scan flags only `sb_secret_` keys + decoded `service_role` JWTs — never identifier strings or the browser-safe anon key). Comprehensive dist scanning also passes `npm run scan:secrets` (CLEAN).

## Remaining work before a Netlify Draft Preview / full acceptance
1. Wire the domain data layer to the persistence boundary so `VITE_PERSISTENCE_PROVIDER=SUPABASE` routes domain reads/writes through `getPersistenceRepository` (authenticated session), and gate the IndexedDB boot seed OFF in the SUPABASE composition.
2. Build/verify the missing UI create/update flows per domain so writes persist to staging.
3. Wire the shell to the auth context (identity display + logout control).
4. Then extend this harness to the domain/isolation/idempotency/atomicity families and re-run.

## Verdict
**S7.3B-PREP — PARTIAL — SAFE RESUME REQUIRED.** Auth + provenance + routing/theme/RTL + security proven against live staging; domain acceptance blocked by the un-wired domain data layer. No deployment/merge/RC/production performed.
