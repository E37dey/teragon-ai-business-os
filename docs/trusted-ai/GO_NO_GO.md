# Teragon Trusted-AI — Go / No-Go Decision

Governed by the "MVP → Trusted AI" gate. Verdicts are **separated by capability**.
A green build + green unit tests does **not** constitute GO.

- **Branch:** `feature/teragon-supabase-app-auth`
- **Evaluated commit:** `d70b87979304`
- **Live target:** `http://localhost:4180` (local Preview build) → teragon-staging (`bjvi…azjj`), provider SUPABASE
- **Run:** executed 15 / 15, skipped 0 — pass 12, fail 1, blocked 1, not-applicable 1
- **Reports:** `evals/results/trusted-ai-report.{json,md}`, `ci-artifacts/acceptance-report.json` (safe; no credentials)

## Verdicts (separate per capability)

### platform-auth-security → **INTERNAL**  (pass 12/12, no safety failure)
Proven live against staging: real UI login, server-resolved canonical identity
(org-teragon / crole-sysadmin / active), session restore, fail-closed on no
session, invalid-password safety (no enumeration, no fallback), route protection,
RTL/theme/viewport, plus adversarial + infra:
- **TA-A1** browser-submitted role/org/active **rejected** (RLS column-guard; org-escalation to `org-attacker` blocked; identity unchanged).
- **TA-A2** cross-org read **denied** (RLS scoping; zero foreign rows).
- **TA-A3** no secret values in the browser build; extraction denied (model-instruction injection NOT_APPLICABLE — AI off).
- **TA-I1** guard fails hard on wrong project / production origin; **TA-I2** network failure → typed safe error, no fallback.
Ready for an **internal / staging pilot**. Full production **GO** additionally
requires the untested ops controls (backup/restore drill, kill-switch/emergency-
disable) in `OPERATIONS_READINESS.md`.

### platform-domain → **FIX**  (pass 0/2 — blocking defect)
- **TA-B1 (severe business risk) = FAIL (auto-fail):** the SUPABASE composition serves domain data from local IndexedDB — a visually-successful write would not reach staging.
- **TA-H5 = UI_CAPABILITY_MISSING:** no UI create/update persists to staging.
- Root cause: the domain data layer is not wired to the Supabase persistence boundary (`src/modules/**` use `getRepository`/IndexedDB). **Not releasable** for any domain pilot until wired. No fabricated domain PASS was issued.

### active-ai-capability → **NOT YET EVALUATED**
`AI_REMOTE_ENABLED` OFF; no model runs (TA-H4 NOT_APPLICABLE). AI was **not**
enabled to satisfy any test. It must be evaluated for grounding, prompt-injection,
and over-reliance before it can be called Trusted-AI Pilot-Ready.

## Overall platform verdict → **FIX**
The platform is only as ready as its weakest capability. Auth/security is
internal-pilot ready; domain is blocked by a fixable architectural defect.

## Auto-fail check
- Cross-org exposure: **none** (TA-A2 pass).
- Unauthorized write / escalation: **none** (TA-A1 pass).
- Privileged-key exposure: **none** (TA-A3 pass; `scan:secrets` CLEAN).
- Silent IndexedDB fallback in SUPABASE composition: **PRESENT** (TA-B1) → domain FIX.
- Browser-supplied role/org/active accepted: **no** (rejected).
- Zero-executed / required-skipped / missing cleanup: **none** (executed 15, skipped 0, cleanup ok).

## Why not GO on green unit tests
The default suite (2482 tests) is green, but the gate is decided by the **live,
capability-scoped** evaluation above. Domain acceptance fails live (IndexedDB, not
staging), and AI is unevaluated — so no GO is issued.

## Remaining work before a Netlify Draft Preview / full acceptance
1. Wire the domain data layer to the Supabase boundary (authenticated session); gate the IndexedDB boot seed OFF in SUPABASE mode. Then TA-B1/TA-H5 must flip to PASS.
2. Build/verify per-domain UI create/update flows persisting to staging + audit events.
3. Wire the shell to the auth context (identity display + logout control).
4. Drill backup/restore + kill-switch/emergency-disable for the staging pilot.
5. (Before any AI claim) enable + evaluate the AI capability against grounding/injection/over-reliance cards.
