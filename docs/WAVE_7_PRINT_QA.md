# WAVE 7 — PRINT QA (W7-G, Phase 7.20)

תאריך: 23.07.2026 · Agent: W7-G · Method: Playwright print-emulation (`page.emulateMedia({ media: "print" })`) against the REAL production build, A4-ratio viewport (794×1123 CSS px ≈ A4 @ 96dpi). Spec: `e2e/submission/w7g-print.spec.ts` — **3/3 passed**. Captures → `docs/screenshots/wave7/print-*.png`.

Honest scope: this verifies the browser print path (הדפסה / שמירה כ-PDF). No native-PDF generation exists or is claimed anywhere.

## 1. Results per surface

### 1.1 Quick-start print view (`/quick-start`, tab "תצוגת הדפסה A4") — PASS
| Check | Result |
|---|---|
| Content present (3 actions: תוצאה צפויה/זמן/טעות/בטיחות + rules columns) | PASS |
| No nav sidebar (`nav.os-nav` hidden by `body * { visibility: hidden }` scoping) | PASS |
| RTL (`.qs-print-root` computed `direction: rtl`) | PASS |
| Dark-background-free (`.qs-print-root` computed background light — `#fff` print rule) | PASS |
| Page-number CSS counters | **N/A — honest** (see §2 defect P-1) |
| Title/version/date/owner | Title yes; version/date/owner are NOT part of the quick-start print header (see §2 defect P-2) |
| Capture | `print-quick-start-a4.png` |

### 1.2 Submission deliverable print (`/submission?print=1`) — PASS (the full contract)
| Check | Result |
|---|---|
| Content present (all 12 deliverable sections + one-pager/metrics/support sub-tables) | PASS |
| No nav sidebar + screen-only controls hidden (`.sub-no-print`, print button hidden under print media) | PASS |
| RTL (`.sub-print-root` `direction: rtl` — declared in the stylesheet AND computed) | PASS |
| Page-number CSS counters (`counter-reset: subpage` · `counter-increment` · `content: "עמוד " counter(subpage)`) | PASS (asserted from the live stylesheet; visible as "עמוד N" per section in the capture) |
| Dark-background-free (`.sub-print-root` background `#fff`, text `#111`) | PASS |
| Title/version/date/owner (מוצר · גרסת ולידטור · תאריך · בעלים · אישור · מצב on EVERY section) | PASS |
| Capture | `print-submission-a4.png` |

### 1.3 Presentation handout (`/submission/presentation`, tab "דף מודפס") — PASS
| Check | Result |
|---|---|
| Content present (all 5 שקף sections + הערות מרצה per section) | PASS |
| No chrome (start button + `.pres-no-print` hidden) | PASS |
| RTL (`.pres-handout-root` computed `direction: rtl`) | PASS |
| Dark-background-free (print rules force `#fff` background / `#000` text with `!important`) | PASS |
| Page-number CSS counters | **N/A — honest** (see §2 defect P-1) |
| Title/version/date/owner | Section titles + demo/backup provenance lines present; no version/date header (P-2) |
| Capture | `print-presentation-handout-a4.png` |

Also related: W7-F's own print test ("print handout renders all 5 sections + notes") re-runs green on final main; the implementation AS-IS/TO-BE A4 print CSS is unit-pinned by `tests/implementation/asIsToBe.test.tsx`.

## 2. Defects / gaps (src changes outside the trivial-a11y exception — reported, NOT fixed)

| ID | Severity | Finding | Suggested fix (for the owning agent) |
|---|---|---|---|
| P-1 | Minor | CSS page-number counters exist ONLY in the submission print (`printView.tsx`). The quick-start print and the presentation handout declare `@page` A4 rules but no page counters — multi-page printouts of those two surfaces have no page numbers | copy the 3-line `counter-reset`/`counter-increment`/`footer::after` pattern from `SUBMISSION_PRINT_CSS` into `PRINT_CSS` of QuickStartPage / PresentationPage |
| P-2 | Minor | The checklist "title/version/date/owner" is fully satisfied only by the submission print. Quick-start prints the content + titles but no version/date/owner header; the handout prints section content + provenance but no version/date header | add a one-line print header (מוצר · גרסה · תאריך · בעלים) to both print roots |

Both are cosmetic print-completeness gaps, not honesty or data problems; the primary deliverable print (submission, the artefact actually handed in) passes the complete contract.
