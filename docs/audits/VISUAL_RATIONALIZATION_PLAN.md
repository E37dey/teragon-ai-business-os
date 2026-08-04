# TERAGON — Visual Rationalization Plan (S11.1-A)

**Documentation-only.** No app code changed this checkpoint. Base @ `eade083`.
Findings are grounded in the 128-screenshot sweep + `_metrics-<w>.json` (overflow,
console, nav mode) and targeted handler reads. Severity: BLOCKER / HIGH / MEDIUM / LOW.

> **Revised in S11.1-A2** after replacing the flawed 200ms settle with deterministic
> route readiness and independently re-verifying in a live browser. The corrected
> evidence **broadened H1** (overflow is systemic, not presentation-only) and **withdrew
> H2** (the sidebar breakpoint is an intentional, correct responsive decision).

## Findings by severity (corrected)

### BLOCKER — 0
No crash, no dead route, no console error at any viewport; all shell routes render
(`mainRendered` 31/31 at every viewport).

### HIGH — 1
- **H1 · Systemic narrow-viewport overflow (≤ ~883px).** Root-caused and independently
  verified: `main.os-workspace__canvas` has an **~883px intrinsic minimum width** because
  its KPI / metrics grids are fixed **4-column** layouts (`~238px × 4 ≈ 952px`,
  `os-more-metrics__grid ~223px × 4`) that do **not** collapse to fewer columns on narrow
  screens. Overflow ≈ `883 − viewport`: **0 @ 1024/1440**, **up to 238px across 12 routes
  @ 768**, **up to 616px across 26 routes @ 390**. `/submission/presentation` is worst
  (238/616) — it adds fixed-width slides on top of the canvas floor.
  **Fix (Phase 2):** make the KPI/metrics grids responsive
  (`grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr))` or explicit
  column-count media queries collapsing 4→2→1), and make the presentation deck fluid
  (`max-width:100%`, responsive slide width, `overflow-x:auto` wrapper). Assert
  `documentElement.scrollWidth − clientWidth ≤ 2` at 1440/1024/768/390 on every route.

### MEDIUM — 3
- **M1 · Navigation grouping.** Regroup to **6 primary areas + AI Lab + "more/admin"**
  per `PAGE_KEEP_HIDE_REMOVE_MATRIX.md` (reduces cognitive load; local, low-risk).
- **M2 · Header density at ≤1024.** 8 header controls (search + two theme toggles + mail
  + notifications + quick-add + account) compete for space. Condense (single theme
  control; group secondary icons) to prevent overload at 1024.
- **M4 · Inconsistent selects/controls.** Standardize native/dark selects, buttons,
  filters, chips, badges and empty states into the shared component set (preserve visible
  focus + accessible names).

### LOW — 3 (document, do not expand scope)
- **L2 · Mixed Hebrew/English.** Intentional product/agent names (TERAGON, AI Copilot,
  Hunter, Stage Gates, Microlearning) are acceptable; sweep only for *unintended* English.
- **L3 · Card/badge density.** Some dashboard sections repeat status text/badges; a
  density pass improves calm (≤4 KPI cards is already met).
- **L4 · Long content pages.** UI_ONLY pages are scroll-heavy by design; acceptable.
- Note: `/automations` shows a negligible **6px @ 1024** (within the same grid-floor
  family); it disappears once H1 is fixed. Not a separate finding.

## Reassessed & withdrawn

- **~~H2 · "sidebar only at 1440"~~ → INTENTIONAL RESPONSIVE DECISION (withdrawn).**
  Evidence: at 1024 the hamburger frees the workspace to ~1014px so the 977px canvas fits
  (**0 overflow**); forcing an inline sidebar there would steal ~250px and push the 883px
  content floor into overflow **at 1024 too**. The drawer toggle is labelled
  (`פתיחת תפריט הניווט`) so navigation stays discoverable. This maximizes workspace and
  avoids overflow — a correct decision, not a defect. (Once H1 makes content fluid, an
  inline rail at 1024 becomes a *design option*, still not a bug.)
- **~~M3 contextual panel~~** — with `mainRendered` now true everywhere, the earlier
  "empty main / panel at bottom" observation was a capture artifact; no action.

## Fix policy (for the Phase-2 implementation PR)

- **Fix all BLOCKER + HIGH** → **H1 only**: responsive KPI/metrics grids + fluid
  presentation deck, with a per-route overflow assertion at 1440/1024/768/390.
- **Fix MEDIUM when local + low-risk** → M1 nav grouping, M2 header condense, M4 control
  standardization.
- **Document LOW** (L2–L4) rather than widen scope.
- **Do NOT "fix" the sidebar breakpoint** — it is intentional (see withdrawn H2).

## What is already good (do not "fix")

- Dashboard already respects **≤4 KPI cards**, grouped nav, and a genuine **human-in-the-
  loop AI approval** flow (why · evidence · approve/reject · busy state · empty states).
- **RTL integrity** holds at every viewport; **zero console errors**; **no no-op /
  broken / misleading controls** were found. The redesign is a **calm/rationalize** pass,
  not a rescue.

## Exact first implementation PR (Phase 2)

**Branch `feature/teragon-visual-rationalization` → Draft PR to
`feature/teragon-supabase-app-auth`.** First coherent commit batch: **H1 — responsive
KPI/metrics grids (collapse 4→2→1) + fluid presentation deck**, adding a per-route
overflow-≤2px assertion at 1440/1024/768/390 (extend `e2e/cross-browser.config.ts` or a
dedicated overflow gate). Follow-up batches: M1 nav grouping, M2 header condense, M4
control standardization. **No sidebar-breakpoint change** (intentional). No
Supabase/flags/migrations; Customers & Contacts untouched; `AI_REMOTE_ENABLED` stays false.
