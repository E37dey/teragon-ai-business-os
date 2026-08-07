# Submission Index (S12.1)

The entry map for the academic submission. Each link includes one sentence on why an
evaluator should read it. Start here, then the [root README](../../README.md).

## Start here (this package)

- **[README.md](../../README.md)** — the one-page product, scope, run and quality summary.
- **[RUN_AND_DEMO_GUIDE.md](RUN_AND_DEMO_GUIDE.md)** — exactly how to install, run and test locally (no secrets).
- **[PRESENTATION_SCRIPT_HE.md](PRESENTATION_SCRIPT_HE.md)** — the 60-second / 5-min / 10-min demo scripts with fallback.
- **[PRESENTATION_SCRIPT_4_30_HE.md](PRESENTATION_SCRIPT_4_30_HE.md)** — the tightened 04:30 human script (per-section route, action, sentences, timestamp, emergency-skip line).
- **[FINAL_HUMAN_DEMO_SCRIPT_4_30_HE.md](FINAL_HUMAN_DEMO_SCRIPT_4_30_HE.md)** — the final spoken Hebrew script to read while presenting (389 words ≈ 3:00 speech; est. ~04:00–04:15 total; ≤05:00).
- **[HUMAN_DEMO_CHEAT_SHEET_HE.md](HUMAN_DEMO_CHEAT_SHEET_HE.md)** — the one-page TIME·SCREEN·CLICK·KEY-SENTENCE reference with three timing checkpoints.
- **[HUMAN_REHEARSAL_RESULT_TEMPLATE.md](HUMAN_REHEARSAL_RESULT_TEMPLATE.md)** — the blank template the presenter fills after a real timed run (not yet done).
- **[HUMAN_REHEARSAL_RESULT.md](HUMAN_REHEARSAL_RESULT.md)** — honest status record: the human timed rehearsal is **not yet performed** (no PASS; checkbox unchecked; submission not marked READY).
- **[HUMAN_REHEARSAL_SCORECARD_HE.md](HUMAN_REHEARSAL_SCORECARD_HE.md)** — the blank scorecard the presenter fills after a real timed run (not yet done).
- **[TIMED_DEMO_REHEARSAL.md](TIMED_DEMO_REHEARSAL.md)** — the functional timed-run evidence (raw 08:18; automation-dominated; ≤5:00 human timing not yet validated).
- **[EVALUATOR_FAQ_HE.md](EVALUATOR_FAQ_HE.md)** — grounded answers to the questions an evaluator is most likely to ask.
- **[ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)** — three Mermaid diagrams distinguishing the current build from future production.
- **[TRUSTED_AI_TEST_PACK_HE.md](TRUSTED_AI_TEST_PACK_HE.md)** — the course-aligned QA pack: success criteria, 15 test cards, rubric, risk register, HITL map, three real failures, and Go/No-Go.
- **[FINAL_SUBMISSION_CHECKLIST.md](FINAL_SUBMISSION_CHECKLIST.md)** — the pre-submission checklist.

## Final acceptance (merged verdict)

- **[FINAL_PRODUCT_VERDICT.md](../final/FINAL_PRODUCT_VERDICT.md)** — the scored 15-category verdict and the FINAL PROJECT PRODUCT READY decision.
- **[FINAL_ACCEPTANCE_MATRIX.md](../final/FINAL_ACCEPTANCE_MATRIX.md)** — 32-route acceptance at four viewports (3 LIVE + 29 demo-only).
- **[FINAL_FUNCTIONAL_REVIEW.md](../final/FINAL_FUNCTIONAL_REVIEW.md)** — every primary function classified (0 NO_OP/BROKEN/MISLEADING).
- **[FINAL_VISUAL_REVIEW.md](../final/FINAL_VISUAL_REVIEW.md)** — evidence-based visual assessment (strengths, weaknesses, accepted limits).
- **[FINAL_AI_REVIEW.md](../final/FINAL_AI_REVIEW.md)** — AI acceptance: 14 actions, safety confirmations, sufficiency for the product name.
- **[FINAL_DEMO_FLOW.md](../final/FINAL_DEMO_FLOW.md)** — the merged demo flows and evaluator Q&A.

## Architecture & system references

- **[docs/audits/CURRENT_SYSTEM_MAP.md](../audits/CURRENT_SYSTEM_MAP.md)** — routes, data sources, and the application architecture map.
- **[docs/adr/](../adr/)** — the four architecture decisions (RLS-first, fail-closed, isolated restore drills, router advisory).
- **[src/agents/actions/README.md](../../src/agents/actions/README.md)** — the Local Demo Action Engine scope statement (not production architecture).

## AI capability & agent evidence

- **[docs/audits/AGENT_ACTION_MATRIX.md](../audits/AGENT_ACTION_MATRIX.md)** — the 14 actions with mode, approval, mutation and test evidence.
- **[docs/audits/AI_CAPABILITY_TRUTH_AUDIT.md](../audits/AI_CAPABILITY_TRUTH_AUDIT.md)** — the honest classification of every AI surface (deterministic, no fake AI).

## Visual & responsive evidence

- **[docs/audits/VISUAL_UX_AUDIT.md](../audits/VISUAL_UX_AUDIT.md)** — severity-ranked visual/UX findings at four viewports.
- **[docs/audits/RESPONSIVE_CANVAS_FIX.md](../audits/RESPONSIVE_CANVAS_FIX.md)** — the systemic 0-overflow fix (before/after evidence).
- **[docs/audits/VISUAL_RATIONALIZATION_S11.2B.md](../audits/VISUAL_RATIONALIZATION_S11.2B.md)** — the navigation/header/select simplification.
- **[docs/audits/PAGE_ACTION_AUDIT.md](../audits/PAGE_ACTION_AUDIT.md)** · **[PAGE_KEEP_HIDE_REMOVE_MATRIX.md](../audits/PAGE_KEEP_HIDE_REMOVE_MATRIX.md)** — per-route/action audit and product decisions.

## Operations evidence

- **[docs/operations/evidence/ACCESSIBILITY_PILOT_2026-08-04.md](../operations/evidence/ACCESSIBILITY_PILOT_2026-08-04.md)** — the axe-core accessibility gate evidence (18/18).
- **[docs/operations/evidence/NETWORK_RESILIENCE_2026-08-04.md](../operations/evidence/NETWORK_RESILIENCE_2026-08-04.md)** — fail-closed offline read/write behaviour (gate 6/6).
- **[docs/operations/evidence/CROSS_BROWSER_PILOT_2026-08-03.md](../operations/evidence/CROSS_BROWSER_PILOT_2026-08-03.md)** — cross-browser × responsive coverage.
- **[docs/operations/evidence/RESTORE_DRILL_2026-08-03.md](../operations/evidence/RESTORE_DRILL_2026-08-03.md)** — restore-readiness drill (why backup/restore is out of academic scope).
- **[docs/operations/DEMO_PILOT_POLICY.md](../operations/DEMO_PILOT_POLICY.md)** — the demo-pilot safety policy (synthetic only, no external senders).

## Security decisions

- **[docs/adr/0001-rls-first-tenant-isolation.md](../adr/0001-rls-first-tenant-isolation.md)** — why tenant isolation is enforced at the database.
- **[docs/adr/0002-fail-closed-no-silent-local-fallback.md](../adr/0002-fail-closed-no-silent-local-fallback.md)** — why the persistence seam fails closed.

## Roadmap

- **[docs/PRODUCT_ROADMAP.md](../PRODUCT_ROADMAP.md)** — final academic QA complete; submission packaging is the active checkpoint; future ideas deferred.
