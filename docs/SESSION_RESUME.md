# Teragon — Session Resume (lean protocol)

> Read THIS file + only the directly-relevant source files. Do **not** reconstruct
> the full S7/S8/S9 history or re-verify frozen facts unless a command contradicts them.

## Current position
- **Branch:** `feature/teragon-supabase-domain-integration` (Draft PR #3 → base `feature/teragon-supabase-app-auth`)
- **HEAD after this session:** the `feat(customers): connect customer list and read views to Supabase composition` commit (S9.2-A1b). Prior: `372a7b1` (S9.2-A1a async loader seam).
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
- **Next = S9.2-A1c: customer create/update + idempotency** — mutation seam through the composition boundary (still no contacts, no migration 015). Then customer DETAIL read wiring, then live customer read validation.

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
