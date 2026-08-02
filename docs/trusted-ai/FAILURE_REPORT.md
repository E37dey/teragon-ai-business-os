# Teragon Trusted-AI — Failure Report

Non-PASS executed cards from the live run (commit `d70b87979304`, target
`http://localhost:4180`, staging ref `bjvi…azjj`). 12/15 PASS; the 3 below are
honest non-PASS results — none is a safety/authorization breach.

## TA-B1 — FAIL (severe business risk): silent IndexedDB fallback in SUPABASE composition
- **Actual result:** In the Preview (`VITE_PERSISTENCE_PROVIDER=SUPABASE`) build the app opens the local `teragon-os` IndexedDB store at boot for domain data. A domain UI write would persist to IndexedDB, not staging — a visually-successful action that does not reach the backend. `forbidden_behavior` occurred.
- **7-axis:** accuracy 0 · completeness 0 · relevance 2 · grounding 0 · action 0 · **safety 2** (no data leak / no authz breach) · ux 1.
- **Failure type:** action-correctness / business-risk (auto-fail: silent IndexedDB fallback). Not a safety/privacy failure.
- **Root layer:** data/architecture — the domain data layer is not wired to the Supabase persistence boundary. `src/modules/**` use `@/repositories` (`getRepository` → `IndexedDBRepository`); nothing uses `getPersistenceRepository`/`createSupabaseRepository`.
- **Correction:** route domain reads/writes through `getPersistenceRepository` (authenticated session) when the provider is SUPABASE, and gate the IndexedDB boot seed OFF in the SUPABASE composition. Then verify writes persist to staging + emit audit events.
- **Owner:** domain.
- **Regression test:** `TA-B1` + the acceptance IndexedDB-in-Supabase-composition probe (must flip to PASS once wired).
- **Rerun result:** still FAIL (expected) — this is the known blocking defect; no code correction was made this checkpoint (wiring the domain layer is a separate feature effort, out of this checkpoint's scope).

## TA-H5 — UI_CAPABILITY_MISSING: create customer via UI does not persist to staging
- **Actual result:** No UI create/update flow persists domain data to staging (same root cause as TA-B1).
- **7-axis:** accuracy 0 · completeness 0 · relevance 2 · grounding 0 · action 0 · safety 2 · ux 1.
- **Failure type:** capability-missing (not a fabricated PASS).
- **Root layer:** data/architecture (domain layer not wired).
- **Correction:** as TA-B1, plus build/verify per-domain create/update UI flows.
- **Owner:** domain.
- **Regression test:** per-domain UI persistence cards (added once wired).
- **Rerun result:** UI_CAPABILITY_MISSING (expected).

## TA-H4 — NOT_APPLICABLE: AI-grounded recommendation
- **Actual result:** `AI_REMOTE_ENABLED` is OFF; provenance `aiRemoteEnabled=false`; no model output produced. Correctly inert — the disabled AI did not silently activate.
- **7-axis:** all capability axes 0 (no output), **safety 2** (inert is safe).
- **Failure type:** not a failure — capability disabled.
- **Root layer:** n/a.
- **Correction:** none. AI capability is **NOT YET EVALUATED**; it must be evaluated (grounding, injection, over-reliance) before enablement.
- **Owner:** ai.
- **Regression test:** re-run the AI cards once a model is enabled (must not be enabled to satisfy a test).

## Corrections made this checkpoint
- None to production code (the blocking domain-wiring defect is a scoped feature effort, not a bounded fix). The harness/runner accurately detect and report the defect. No RLS was weakened, no UI bypassed, no mock-for-live, no fallback introduced.
