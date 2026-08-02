# Teragon — Session Resume (lean protocol)

> Read THIS file + only the directly-relevant source files. Do **not** reconstruct
> the full S7/S8/S9 history or re-verify frozen facts unless a command contradicts them.

## Current position
- **Branch:** `feature/teragon-supabase-domain-integration` (Draft PR #3 → base `feature/teragon-supabase-app-auth`)
- **HEAD after this session:** the `feat(customers): connect customer detail view to Supabase composition` commit (S9.2-A1d1). Prior: `2b54cfe` (S9.2-A1c create/update).
- **Tree:** clean.

## Authorized scope (per session — ONE bounded checkpoint)
- **S9.1-A DONE:** legacy `getRepository` hard-gate + IndexedDB boot shutdown in SUPABASE mode (commit `93611cc`).
- **S9.1-B1 DONE:** central `DomainNotConnectedGate` mounted around the page `Outlet` in `OsShell` (commit `566ce74`).
- **S9.1-B2 DONE + CHECKPOINT-A COMPLETE (this session):** shell/header wired to `useAuth` — safe identity (name · role · org, no tokens), logout via real `signOut` (routes to `/login` replace; composition returns `AUTH_REQUIRED` after — repo access invalidated). SUPABASE never shows the static `CANONICAL_USER`; LOCAL unchanged. Full Checkpoint-A gate PASS (vitest 2498/0-skipped, build, build:preview, oxlint, typecheck×2, scan:secrets CLEAN, representative Playwright 3/3).
- **S9.2-A1a DONE:** authenticated async Supabase domain seam `src/persistence/composition/loadSupabaseDomainRepository.ts` — fail-closed (provider→session→canonical identity→allow-list→lazy import), org from `identity.organizationId` (never VITE_SUPABASE_ORG/browser), typed errors (AUTH_REQUIRED / IDENTITY_INVALID / DOMAIN_NOT_CONNECTED / REMOTE_REPOSITORY_LOAD_FAILED / PROVIDER_BYPASS_FORBIDDEN), no IndexedDB/fallback. `SUPABASE_CONNECTED_DOMAINS=["customers"]` (IMPLEMENTATION_READY; NOT route-mounted / NOT in the domain map). Gate still not route-aware, so SUPABASE mode still shows the notice for all pages.
- **S9.2-A1b DONE (LIST read-connected; DETAIL deferred → PARTIAL):**
  - `src/app/data/routeDomain.ts` — route→domain map; `/customers`→`customers`, `/customers/:id`→`null` (detail deferred), else `null`. Connected decision stays central (`isSupabaseConnectedDomain`), no routing allow-list.
  - `DomainNotConnectedGate.tsx` — split into pure `DomainNotConnectedGateView({provider,pathname})` (route-aware) + `DomainNotConnectedGate` wrapper (`useLocation` + `PERSISTENCE_PROVIDER`). SUPABASE mounts a route only when its domain is connected; `/customers` renders, `/customers/:id` + all others show the notice (their IndexedDB pages never mount).
  - `src/app/data/useDomainCollection.ts` — composition read hook. LOCAL = byte-for-byte `useCollection` (shared key+queryFn → invalidation intact). SUPABASE = `enabled:authed`, `retry:false`, reads via `loadSupabaseDomainRepository`→`listSafe()`; non-ok throws typed `DomainReadError` (safe Hebrew msg, no leak); never `getRepository`, never local fallback. Query key = `["domain-collection","SUPABASE",collection,userId,orgId]` (no tokens/sessions); on loss of auth it cancels+removes cached protected rows.
  - `CustomersPage.tsx` — uses `useDomainCollection`; provider-aware loading/typed-error states; refresh; SUPABASE hides the IndexedDB create button + modal, shows Hebrew notice "יצירת לקוח עדיין אינה זמינה בסביבת התצוגה".
  - **DETAIL (`/customers/:id`) intentionally left blocked** — the 832-line 13-collection Customer-360 page is a broad rewrite (12 domains still NOT_CONNECTED); deferred to keep the commit bounded + the tree clean.
  - Tests: `tests/app/customer-read.test.tsx` (13) + rewired `tests/app/domain-not-connected-gate.test.tsx` (3). Targeted vitest 46-adjacent green, typecheck clean, oxlint clean. No full/live suite, no build:preview, no screenshots (SUPABASE list needs a live session → visual gate belongs with live validation).
  - **customers status = `READ_CONNECTED_LOCAL_TESTED`** (list only; detail NOT connected; every other domain NOT_CONNECTED).
- **S9.2-A1c DONE (customer create + update; idempotent):**
  - `src/app/data/useCustomerMutation.ts` — provider-aware WRITE seam. LOCAL = existing approved behavior (`createCustomer` / local factory update). SUPABASE = authenticated write via `loadSupabaseDomainRepository("customers",...)`, org from `identity.organizationId` only, never `getRepository`/IndexedDB, no local fallback. Typed failures: AUTH_REQUIRED / IDENTITY_INVALID / DOMAIN_NOT_CONNECTED / REMOTE_REPOSITORY_LOAD_FAILED / REMOTE_WRITE_FAILED / VALIDATION_FAILED / DUPLICATE_SUBMISSION (safe Hebrew, no raw errors).
  - **Idempotency (NO schema change):** create reuses ONE deterministic submission id + writes through `upsertSafe` — module-level in-flight collapse here + repo-level in-flight collapse + DB `onConflict:"id"` ⇒ double-click / uncertain-retry = one logical row. `entityToRow` injects the tenant `organization_id` from the canonical org (customers maps domain `organizationId`→`owning_org_id`, a different column), so a browser org can't spoof ownership. **The existing `upsertSafe` contract fully covers idempotency — no migration 015.**
  - **Session safety:** issuing identity captured; a write resolving after logout/identity change does NOT repopulate protected cache. On success, adds the verified record to the scoped `["domain-collection","SUPABASE","customers",userId,orgId]` query + invalidates only that key.
  - `CustomersPage.tsx` — create enabled in both modes (seam + submission id); new per-row "עריכה" opens a focused edit modal (essential fields only, no Customer-360); extracted `CustomerFormModal` (create+edit). Detail route still blocked.
  - Tests: `tests/app/customer-mutation.test.tsx` (10) + read regression updated. Targeted 40 green (mutation 10 + read 13 + gate 3 + loader 9 + gate 5). typecheck + oxlint clean. Visual: LOCAL dev-server a11y-inspected at 1024/1280/1440 (list + create + edit dialogs; RTL, Light, no overflow) — SUPABASE-mode visual needs live Auth (deferred to live validation).
  - **customers status = `READ_WRITE_CONNECTED_LOCAL_TESTED`** (list read + create/update; NOT LIVE_VALIDATED, NOT CRUD_COMPLETE — no remove, no contacts). Detail blocked; all other domains NOT_CONNECTED.
- **S9.2-A1d1 DONE (customer DETAIL remote read + reduced 360):**
  - `routeDomain.ts` — `/customers/:id` now maps to `customers` (single-segment regex); list + detail both mount, others blocked. Contract stays central.
  - `src/app/data/useDomainRecord.ts` — single-record read by id. SUPABASE = `enabled:authed&&hasId`, `retry:false`, `getSafe(id)` via `loadSupabaseDomainRepository`; non-ok → typed `DomainReadError`; **not-found = `null`** (TanStack forbids `undefined`). Key `["domain-record","SUPABASE",collection,id,userId,orgId]`; purge on loss of auth. Never `getRepository` in SUPABASE.
  - `src/modules/customers/SupabaseCustomerDetail.tsx` — calm reduced view: back link + name/status-chip/type header, ONE info Panel (email/phone/city/type/created/updated), ONE compact Hebrew notice "המידע המשלים יחובר בשלבי ההטמעה הבאים", edit action via `useCustomerMutation.update` (refetches the record). Mounts NO disconnected Customer-360 sections. Invalid-id / loading / not-found / safe-error states.
  - `CustomerDetailPage.tsx` — top-level branch on the build-const provider: SUPABASE→`SupabaseCustomerDetail`; LOCAL→the existing 832-line `LocalCustomerDetailPage` (unchanged). No conditional-hook hazard (const branch).
  - Tests: `tests/app/customer-detail.test.tsx` (11) + read regression updated (detail route now connected). Targeted 51 green (detail 11 + read 13 + mutation 10 + gate 3 + loader 9 + supabase-gate 5). typecheck + oxlint clean. Visual: component validated with mocked auth data (structure/RTL/responsive auto-fit → no 1024 overflow); pixel capture at 1024/1280/1440 deferred to A1d2 (needs SUPABASE build/live Auth).
  - **customers status = `READ_WRITE_DETAIL_CONNECTED_LOCAL_TESTED`** (list+detail read, create/update; NOT LIVE_VALIDATED, NOT CRUD_COMPLETE). Contacts + all other domains NOT_CONNECTED.
- **S9.2-A1d2a-1A DONE (fixture/cleanup harness, fake-client only):** `scripts/platform/live-customer-fixtures.mjs` (adapter-injected, fail-closed, `process.exit`-free core) provisions a temporary NON-admin Auth user + profile + membership in a SECOND seeded org (never org-teragon) via the Admin adapter's `createUser` (no `auth.users` SQL, no manual hashing), stamps every id/email with `accrun-<runId>`, and GUARANTEES teardown (`withCustomerFixtures` always-cleanup; cleanup failure fails the run; password held in memory, never logged). `tests/platform/live-customer-fixtures.test.ts` (9, fake in-memory Admin adapter). typecheck + oxlint clean; plan entrypoint contacts nothing. Readiness: staging seed has orgs `org-staging-demo`/`org-staging-beta` + non-admin profiles but NO loginable auth users; Actions secret `SUPABASE_SERVICE_ROLE_KEY` now configured for teragon-staging (server-side only). NO real Auth user created, NO staging mutation this checkpoint.
- **Next = S9.2-A1d2a-1B: build + run the fail-closed live customer suite** — wire the real service-role Admin adapter + the `test:domains:live` runner (env/provider/ref/IndexedDB gates, non-discoverable by default suites), execute once against teragon-staging with `withCustomerFixtures`, then S9.2-A1d2b visual acceptance. Still no contacts, no other domains, no migration 015.

## Frozen facts (recorded once — do NOT re-verify)
- Backend fully stood up on live `teragon-staging` (`bjvirkmagwpqroakazjj`): 14 migrations, schema verified, RLS 8/8, admin `soundcloudillusion@gmail.com` bootstrapped, deterministic seed. **S7.1/S7.2 PASS.**
- **S8 Supabase Auth is live-validated** (`test:auth:live` 8/8). Browser key = publishable; server key stays server-only.
- **Netlify Preview env** configured via committed `netlify.toml [context.deploy-preview.environment]` (public values only). **S7.3A PASS.**
- **Trusted-AI Tested-MVP** package exists (`evals/`, `docs/trusted-ai/`). Verdict: platform=**FIX**, AI=**NOT YET EVALUATED**. `TA-B1` (silent IndexedDB) and `TA-H5` (approval workflow) are the open cards.
- App browser env contract var: `VITE_SUPABASE_ANON_KEY` (holds the publishable key), read in `src/persistence/supabase/client.ts`.
- Composition foundation (`d799f13`): `src/persistence/composition/{domainComposition.ts, DomainRepositoryProvider.tsx, DomainNotConnectedGate.tsx}` — pure fail-closed boundary, `SUPABASE_CONNECTED_DOMAINS = []` in Checkpoint A, `useDomainRepository`, central not-connected gate + safe `ProviderDiagnostic`.

## Current blocker / gating
- **Migration 015 (`approve_and_create_task` RPC) is NOT authorized** — required later for S9.2.B (approval→task atomicity), excluded from S9.x.A. Do not create it.
- Domain data layer not yet consumed by UI (root of `TA-B1`) — being wired incrementally: composition (d799f13) → hard-gate + boot shutdown (this commit) → wrapper + shell (S9.1-B) → CRM (S9.2.A).

## Files permitted next session (S9.1-B) — targeted, no repo-wide scan
- `src/persistence/composition/DomainNotConnectedGate.tsx` (already drafted — mount it)
- The app shell/header (e.g. `src/**/OsShell*`, header component) — read via known paths, not a scan
- `src/auth/useAuth.ts` / `authContext.ts` (S8 context, read-only)
- App router where the wrapper mounts (`src/app/router*`)
- New/updated targeted test file(s)

## Commands permitted (ladder)
- L1/L2 (implementing): `npx vitest run <targeted files>`; `npm run typecheck`; `npx oxlint <changed paths>`.
- L3 (Checkpoint-A gate, ONCE, at end of S9.1-B): full `npx vitest run`, `npm run build`, secret + privileged-bundle scans, ordinary Playwright, a11y.
- **Never** run full suite / build / live commands per edit.

## Prohibited (all sessions until explicitly authorized)
- Create migration 015 / any staging schema change; connect CRM or other domains before their session; enable AI/Graph flags; deploy Netlify; merge any PR; create an RC; deploy Production; restore `stash@{0}`; launch background subagents for precision-critical implementation.

## Safe resume point
- This S9.1-A commit (clean tree). If interrupted, resume S9.1-B from here.

## Invariants (assert only if a command contradicts)
- Exactly 14 migrations; `015` absent. PR #1/#2/#3 draft/unmerged. `LOCAL_INDEXEDDB` default outside Preview. Graph/AI flags OFF. Phase-11 prototype disabled. `stash@{0}` untouched.

## Expected final return (each session)
Numbered, ≤500 words: reconciled HEAD → commit → changed files → behavior implemented → targeted tests executed (passed/failed) → confirm no full/live suite ran → invariants intact → verdict (PASS / PARTIAL — SAFE RESUME REQUIRED / FAIL) → exact next checkpoint.
