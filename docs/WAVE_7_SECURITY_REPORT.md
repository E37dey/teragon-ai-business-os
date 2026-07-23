# WAVE 7 — SECURITY REPORT (W7-G, Phase 7.25)

תאריך: 23.07.2026 · Agent: W7-G · Scope: the Wave-7 adoption/submission surfaces (/implementation · /personas · /stage-gates · /training-materials · /quick-start · /faq · /submission · /submission/presentation) on final main (all W7 A-F integrated).

Method: **gap analysis first.** The existing suites already cover most of the 7.25 checklist — `tests/submission/**` (incl. the 7.24 registry drift guards), `tests/wave6-security/**`, `tests/stage-gates/eligibility.test.ts`, `tests/knowledge/**`, `tests/presentation/demoMode.test.ts`. W7-G wrote ONLY the missing tests: `tests/wave7-security/**` — **5 files, 22 tests, all green**. Existing coverage is referenced by file + test name; nothing was duplicated.

## 0. The honest access model (read this first)

There is **no authentication/authorization system** in the product — the demo runs as a single CEO identity (`u-tzachi`), deliberately, and every route is reachable by direct URL. What IS enforced today, and what this report verifies:

1. **Sensitivity gates at the projection layer** — רגיש/מוגבל memory bodies stay hidden behind reveal-with-reason (W6 machinery, re-verified here for the W7 surfaces).
2. **Title-only/typed-ref projections** — the W7 validators and views carry record REFERENCES (collection/recordId) and titles, never bodies.
3. **Evidence eligibility** — draft/rejected/expired/ghost records can never satisfy a gate criterion.
4. **The demo-mode guard** — the only "protection" layer against destructive actions while presenting (pinned by `tests/presentation/demoMode.test.ts`).

## 1. Checklist → covering test → status

| # | 7.25 item | Covering test (file → name) | Status |
|---|---|---|---|
| 1 | Unauthorized evidence access — sensitivity-gated memory as gate evidence | **GAP-FILLED**: `tests/wave7-security/gateEvidenceMemorySensitivity.security.test.ts` → "the evaluated evidence ref is a TITLE-ONLY projection — the sensitive body can never leak through it" (structural: `EvaluatedEvidenceRef` has exactly `ref/status/reasonHe/recordTitleHe`, sentinel-body scan of the full serialization) + "the FULL gate validation … never carries the body" + "what IS enforced: רגיש/מוגבל are the hidden sensitivities". **HONEST LIMITATION, pinned**: the deterministic validator itself ACCEPTS an existing רגיש record as valid evidence ("HONEST LIMITATION (pinned…): the validator accepts an existing sensitive record…") — refusing it would require a viewer/auth model that does not exist. The UI record-preview on /stage-gates reads the legacy `markdown` field, so a V2 sensitive body additionally never renders there; the projection gates of W6 (customer-360 / command-center / export) remain the body-protection layer | GAP-FILLED + LIMITATION (pinned) |
| 2 | Restricted memory link in submission views | **GAP-FILLED**: `tests/wave7-security/submissionAndPrintLeakage.security.test.ts` → "deliverable evaluations (the 12 cards) — no sentinel", "auditor findings — no sentinel", "quality matrix results — no sentinel", "evidence rows reference records by collection/recordId ONLY (link, not content)" — a רגיש memory record fed through the gate-validation context can never surface its body in any /submission serialization | GAP-FILLED |
| 3 | Sensitive-export attempt from submission print | **GAP-FILLED**: same file → "the full rendered A4 print markup contains no sensitive body — print is evaluations-only" (real `renderToStaticMarkup` of `SubmissionPrintView`; asserts neither body NOR title of the sensitive record reaches print). The print path exports deliverable metadata + typed evidence refs only; there is no "include record bodies" option to abuse | GAP-FILLED |
| 4 | Presenter-note access model | **GAP-FILLED**: `tests/wave7-security/presenterNotesAccess.security.test.ts` → "submission evaluations expose only a presence STATUS — never the note text" (a sentinel note bound to a deliverable never appears in evaluations), "the A4 submission print never renders a presenter-note body" (also scans ALL canonical notes), "canonical presenter notes carry no phone numbers or email addresses", "the honesty notes survive (הערת כנות / טרם נמדד)". **Honest model**: notes are demo-visible on /submission/presentation (press N) — there is no presenter-vs-audience role split; what is enforced is that note bodies surface ONLY on the presentation surfaces (drawer + handout) | GAP-FILLED (no-role caveat) |
| 5 | Hidden draft evidence not usable | Existing: `tests/stage-gates/eligibility.test.ts` → "a DRAFT article is not approved evidence"; `tests/knowledge/evidenceEligibility.test.ts` + `isAuthoritative.test.ts` (full 7-state matrix); the /stage-gates picker offers eligible records only (evaluated by the SAME `evaluateEvidenceRef`, hidden count disclosed — verified live by e2e `w7g-stage-gates.spec.ts`). **GAP-FILLED at gate level**: `tests/wave7-security/directUrlAndDraftEvidence.security.test.ts` → "a force-attached draft article never satisfies the criterion nor readies the gate" (validCount 0, invalidCount 1, `readyForGo` false) | PASS + GAP-FILLED |
| 6 | Rejected material never counts complete | Existing at evidence level: `tests/stage-gates/eligibility.test.ts` → "a REJECTED material is invalid evidence". **GAP-FILLED at submission level**: `tests/wave7-security/submissionAndPrintLeakage.security.test.ts` → "rejected material NEVER counts complete at the submission level" (Approval status "נדחה" ⇒ deliverable state ≠ מלא, approvalStatus discloses the rejection). Related: `tests/submission/readiness.test.ts` (each מלא condition individually blocking; overall NEVER green with blockers) | PASS + GAP-FILLED |
| 7 | Direct URL to protected artefact | **GAP-FILLED (honest)**: `tests/wave7-security/directUrlAndDraftEvidence.security.test.ts` → "the shell mounts EXACTLY the canonical APP_ROUTES + a catch-all NotFound" (closed route table — no accidental surfaces), "/submission/presentation is deliberately top-level … a documented, intended public surface", "no route defines a loader/auth guard — pinned so the security report stays honest". e2e: every W7 route direct-loads cleanly (`w7g-keyboard-offline.spec.ts` zero-console sweep). **HONEST STATE: no auth system yet — demo mode.** Enforcement that DOES exist: sensitivity gates (items 1-3) + the demo-mode destructive-action guard (`tests/presentation/demoMode.test.ts` → "refuses destructive changes with a Hebrew reason while demo mode is on") | LIMITATION (documented + pinned) |
| 8 | Presentation/print/backup contain no real personal data beyond the synthetic seed | **GAP-FILLED**: `tests/wave7-security/personalDataScan.security.test.ts` → "every phone/email in presentation/print/quick-start content belongs to the synthetic seed set" (regex scan of: presentation sections + presenter notes + the REAL rendered A4 print + one-pager + quick-start actions + correct-use rules; allowlist = the contact strings the seed itself defines) and the stronger "the presentation deck content itself carries NO contact strings at all". **Honest caveat**: the 5 bundled backup PNGs (`src/modules/presentation/assets/`) are binary screenshots of the seeded app and cannot be text-scanned — they were captured from the deterministic seed (their provenance is recorded per-section in `backupImage.sourceFile`), so exposure is bounded by the same synthetic set | GAP-FILLED (binary-image caveat) |

Score: **6 GAP-FILLED**, 2 with existing coverage extended, **2 honest LIMITATIONS documented + pinned** (validator sensitivity acceptance; no auth system).

## 2. New tests (tests/wave7-security/**, 22 tests, all green)

| File | Tests | Focus |
|---|---|---|
| `helpers.ts` | — | canonical רגיש V2 memory fixture + sentinel body |
| `gateEvidenceMemorySensitivity.security.test.ts` | 5 | items 1 (+ the pinned limitation) |
| `submissionAndPrintLeakage.security.test.ts` | 6 | items 2, 3, 6 |
| `presenterNotesAccess.security.test.ts` | 4 | item 4 |
| `personalDataScan.security.test.ts` | 3 | item 8 |
| `directUrlAndDraftEvidence.security.test.ts` | 4 | items 5, 7 |

Run: `npx vitest run tests/wave7-security` → **5 files, 22/22 passed** (also included in the full `npm test` run — see `docs/WAVE_7_TEST_RESULTS.md`).

## 3. Scanner run

```
npm run build        → exit 0 (tsc -b && vite build)
npm run scan:secrets → exit 0
  dist text files scanned: 70
  screenshot files checked in docs\screenshots: 115
  RESULT: CLEAN — 0 findings.
```

(The W5-E scanner also checks git history for `sk-…`/`AKIA…` shapes — the historical test-fixture commits it lists are informational, already documented in `docs/WAVE_6_SECURITY_REPORT.md` §4.2; dist is clean.)

## 4. Open items for the lead

1. **Validator sensitivity gate** (item 1 limitation): `evaluateEvidenceRef` could refuse רגיש/מוגבל memory records as gate evidence (or require reveal-with-reason) once a viewer model exists. Today the body cannot leak (title-only projection) but the ATTACHMENT itself is allowed. Pinned by test so any future change is deliberate.
2. **No auth system** (item 7): unchanged Wave-5/6 caveat — single-operator demo. All W7 surfaces inherit it.
3. **PII redaction**: unchanged W6 item-27 limitation — no PII redactor exists; W7 adds no new PII surface (verified by the personal-data scan, item 8).
