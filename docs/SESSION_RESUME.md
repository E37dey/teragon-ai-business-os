# Teragon — Session Resume (lean protocol)

> Read THIS file + only the directly-relevant source files. Do **not** reconstruct
> the full S7/S8/S9 history or re-verify frozen facts unless a command contradicts them.

## Current position
- **Branch:** `feature/teragon-supabase-domain-integration` (Draft PR #3 → base `feature/teragon-supabase-app-auth`)
- **HEAD after this session:** the `feat(customers): add authenticated customer create and update flows` commit (S9.2-A1c). Prior: `ad75757` (S9.2-A1b route-aware list/read).
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
- **Next = S9.2-A1d: customer DETAIL read + live customer validation** — wire `/customers/:id` read-only through composition (still no contacts/other domains), then the first live customer read/write validation on staging.

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
