# Supabase Acceptance — Fixtures & Cleanup (S7.3B-PREP)

Safe record of the test-data policy for the live browser acceptance run. No
credentials, keys, tokens, or session material.

## Run identity
- Every temp record is prefixed with a unique run id: `acceptance-<timestamp>-<random-safe-id>` (e.g. `acceptance-1785674472120-7jeqb2pa`).
- The run id is generated in `_acceptanceCore.makeRunId()` and validated by `isFixturePrefixed()`.

## What was created this run
- **Nothing on staging.** Because the domain module UI writes to local IndexedDB (not the Supabase boundary — see the browser-acceptance report), no acceptance-prefixed domain records were created on teragon-staging via the UI.
- The only staging interaction was **authentication** (sign-in / refresh / the intentional invalid-password attempt) using the browser publishable key + the admin session. No rows were written.

## Privileged access
- **Not used this run.** No service-role/privileged client was needed because no staging fixtures were created (there was nothing to seed or clean via a privileged path).
- The policy (for when domain flows are wired): privileged access is permitted ONLY for staging fixture setup (org A / org B / active user in B / inactive user), invariant inspection, and final cleanup — never for ordinary acceptance assertions, which use authenticated publishable-key browser sessions.

## Untouched invariants
- The canonical admin (`crole-sysadmin` / `org-teragon` / active) was authenticated but **not modified**.
- The deterministic seed baseline and all unrelated users/orgs were **not altered**.

## Cleanup
- `cleanup: "ok"` — no fixtures to remove (none created via the UI).
- Transient local trace artifacts (`test-results/`, `playwright-report/`) were removed after the run. The safe machine-readable reports under `ci-artifacts/` (gitignored) contain masked/public metadata only.
- A cleanup failure would fail the run; none occurred.
