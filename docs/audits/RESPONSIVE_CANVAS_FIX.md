# Responsive Canvas Fix — systemic sub-883px overflow (S11.2-A)

**Implementation checkpoint.** Branch `feature/teragon-responsive-canvas-fix` from base
`feature/teragon-supabase-app-auth` @ `27e5fe21`. No Supabase, migrations, Production, or
AI-flag changes. Customers & Contacts behaviour, RTL, demo-mode banner, and the
evidence-backed responsive navigation (inline sidebar @1440, hamburger ≤1024) are all
preserved.

## Before → after (document horizontal overflow, routes with > 2px)

Measured by the deterministic-readiness harness (`e2e/audit-screens.config.ts`), all 32
routes, per viewport. Independently re-verified in a live browser.

| Viewport | Before (routes / max px) | After |
|----------|--------------------------|-------|
| 1440 | 0 | **0** |
| 1024 | 1 (`/automations` 6px) | **0** |
| 768 | 12 (max 238 `/submission/presentation`) | **0** |
| 390 | 26 (max 616 `/submission/presentation`) | **0** |

**128/128 content-complete captures · `mainRendered` on all 31 shell routes at every
viewport · 0 console errors · 0 blank routes.**

## Root causes fixed (shared primitives first)

1. **`.os-section-title__text`** was `nowrap + ellipsis` but lacked `min-inline-size:0`,
   so the ellipsis never truncated and the full title (up to ~712px, with nested
   subtitle) propagated its width to the canvas on **every page**. → wrap + `min-inline-size:0`.
2. **Inline single-column `display:grid` page/section wrappers** (`{display:grid; gap}`
   with no `grid-template-columns`) content-sized their implicit `auto` column to
   max-content; nested `auto-fit` grids read that inflated width and blew up circularly.
   → pin such grids to `grid-template-columns: minmax(0, 1fr)`.
3. **Canvas flex children** defaulted to `min-width:auto`. → `.os-workspace__canvas > * { min-inline-size:0 }`.
4. **Fixed-track inline grids** (process flows / tier models / stage boards, e.g.
   `1fr auto 1fr auto 1fr`, `230px minmax(0,1fr) 290px`) can't fit narrow. → collapse to a
   single column ≤768px (auto-fit card grids excluded — they already reflow).
5. **Dense tables** content-sized wide. → `table-layout:fixed` + wrapping cells ≤768px
   (an intentional, semantics-preserving fit; no clipped text).
6. **`.os-section-title__action`** (a nowrap action-button group) forced title rows wide.
   → the title row and the action group wrap.
7. **Action button groups** (`.os-btn-wrap` rows) didn't wrap. → wrap ≤768px.
8. **The `disabledReason` tooltip** (`.os-btn-wrap[data-disabled-reason]::after`) was
   `position:absolute; white-space:nowrap` — hidden (`opacity:0`) but laid out ~540px
   wide, extending the document scroll on pages with disabled buttons (`/stage-gates`).
   → wrap + cap width (`max-inline-size: min(220px, 78vw)`). Also a UX improvement.
9. **`.courses-kpi`** was `repeat(2, minmax(190px,1fr))` (~380px) → stacks to one column
   ≤430px.

## Files changed (source)

- `src/styles/components.css` — items 1–8 (shared primitives).
- `src/styles/courses.css` — item 9.
- `src/modules/command-center/CommandCenterPage.tsx` — KPI grid hardened to
  `minmax(min(100%,180px), 1fr)`.

No content is hidden anywhere: every fix wraps, stacks, or (for tables) fits with
wrapping cells. No `overflow:hidden`/clip was used to mask layout, and no viewport was
dropped.

## Validation

- Build ✅ · typecheck ✅ (0) · typecheck:tests ✅ (0) · scoped oxlint ✅
- Unit/static: **2551/2551 tests pass** (the 12 `tests/platform/*` files fail only on this
  local machine with a pre-existing RolldownError — green in CI; unrelated to this change).
- Accessibility gate ✅ **18/18** · Network-resilience gate ✅ **6/6**
- Full-route overflow sweep ✅ **0 / 32 routes overflow at 1440 / 1024 / 768 / 390**.
