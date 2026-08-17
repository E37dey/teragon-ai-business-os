# TERAGON — Submission Checklist

**Branch:** `chore/teragon-submission-package` (base `4a6aed7`) · **No merge yet.**

## Documents
- [x] Source code ready (baseline `4a6aed7`, zero source changes on this branch)
- [x] README ready — `README.md`
- [x] Quick Start ready — `docs/submission/QUICK_START.md`
- [x] Architecture ready — `docs/submission/ARCHITECTURE.md` (5 Mermaid diagrams + recovery)
- [x] Feature document ready — `docs/submission/FEATURES.md`
- [x] Demo script ready — `docs/submission/DEMO_SCRIPT.md` (+ `DEMO_SCRIPT_3_MIN.md`)
- [x] Presentation outline ready — `docs/submission/PRESENTATION_OUTLINE.md` (12 slides)
- [x] One-pager ready — `docs/submission/TERAGON_ONE_PAGER.md`
- [x] Technical stack ready — `docs/submission/TECH_STACK.md`
- [x] Test report ready — `docs/submission/TEST_REPORT.md`
- [x] Limitations ready — `docs/submission/KNOWN_LIMITATIONS.md`
- [x] Screenshots ready — `docs/submission/screenshots/` (13 + index)
- [x] Final facts (single source of truth) — `docs/submission/FINAL_FACTS.md`
- [x] Hebrew presenter pack — `docs/submission/he/` (PROJECT_SUMMARY, PRESENTATION_CONTENT, DEMO_SCRIPT, Q_AND_A, EVALUATOR_CHEATSHEET)
- [~] Connected `07-knowledge-map.png` — automation cannot export paired-Chrome frames; live state verified; 30-sec presenter recipe in `screenshots/SCREENSHOTS.md`

## Verification
- [x] Demo credentials verified (portal E2E 10/10; 3 accounts resolve to fixed roles)
- [x] Localhost demo verified (preview served on :4180, all 13 screenshots captured from the running app)
- [x] Obsidian optional demo verified (live paired Chrome: connection, Knowledge Map 63/147, governed workflow, recovery — see TEST_REPORT)
- [x] Build verified (`tsc -b && vite build` clean)
- [x] typecheck / typecheck:tests / lint / secret-scan clean
- [x] Vitest baseline 3041/3041 (per-file green; full-suite flakes only under this machine's RAM starvation — documented)
- [x] Deterministic E2E 611 passed / 7 skipped / 0 failed (at `4a6aed7`)

## Git
- [x] Submission branch created from `4a6aed7`
- [x] Clean git status (only docs/screenshots committed; no source changes)
- [x] Final SHA recorded: submission content on `chore/teragon-submission-package` (pushed; `28884b0` package, `fcdb882` Hebrew pack)
- [x] No merge; `main` / `RC1` / `RC2` (`68e229e`) / release tags untouched
