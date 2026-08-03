# TERAGON AI BUSINESS OS — Visual / UX Audit (S11.0)

**Documentation-only.** No CSS/layout changed. Date 2026-08-04.
Viewports of record: **1440 / 1024 / 768 / 390**. Severity: BLOCKER / HIGH / MEDIUM / LOW.

## Method & evidence base

The responsive contract is enforced by an automated **cross-browser × responsive
matrix** (`e2e/cross-browser.config.ts`): chromium / firefox / webkit × **1440 / 768 /
390** — **9/9 cells green** after the B4 fix (S10.3-C2 evidence). The a11y gate
(`e2e/a11y.config.ts`, axe-core) is **18/18 green**; the offline UI gate proves zero
horizontal overflow at 390 and reachable nav. **1024** is not a dedicated matrix cell;
it sits inside the same desktop breakpoint band as 1440 and is covered by reasoned
inspection, not an independent automated assertion — recorded honestly below.

## Findings

| ID | Severity | Viewport(s) | Area | Finding | State |
|----|----------|-------------|------|---------|-------|
| V1 | ~~HIGH~~ | 390 | shell | Horizontal overflow on narrow mobile (B4) | **FIXED** (S10.3-C2; overflow ≤ 2px asserted) |
| V2 | LOW | 1024 | matrix | No dedicated 1024 automated cell — covered by breakpoint reasoning only | ACCEPTED (in desktop band; C-tier) |
| V3 | LOW | all | STATIC pages | Long curated Hebrew pages are content-dense; readable, RTL-correct, but scroll-heavy | ACCEPTED (content by design) |
| V4 | LOW | 390 | lazy routes | Navigating to an *unvisited* lazy route while offline can't fetch its chunk | ACCEPTED (standard SPA limit; documented) |

**No BLOCKER and no unresolved HIGH visual findings.**

## What holds across the matrix

- **RTL integrity:** `dir="rtl"` preserved at every cell, including under offline.
- **Chrome present:** `header.os-header` + `main` + Demo-Mode banner visible at all cells.
- **Navigation:** inline nav ≥ 640px; hamburger drawer < 640px, keyboard-reachable.
- **Overflow:** ≤ 2px horizontal at 390 (asserted), no overflow at 768/1440.
- **A11y:** axe-core passes (18/18); primary quick-add action is focus-safe and
  keyboard-operable; assertive validation messages on empty submit.

## Honest limitations

- Visual proof is automated at **1440 / 768 / 390**; **1024** is reasoned, not
  independently asserted (V2).
- WebKit on Windows/CI is a **Safari compatibility proxy**, not proof on real Safari.
- Screenshots are captured **only on failure** by the matrix; with 9/9 green there are
  no failure artifacts to attach — the passing assertions are the evidence.

**Verdict: VISUAL STATE ACCEPTABLE FOR SUBMISSION.** One prior HIGH (B4) fixed; all
remaining findings are LOW / accepted demo limitations.
