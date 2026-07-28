# Theme Full Visual QA

Exact-viewport headless renders from a fresh production build; dark via the real toggle. Full application shell; not cropped.

## Coverage
- **Light**: 30 routes × {1440×900, 1920×1080, 2560×1440} = **90 shots** → `docs/screenshots/theme-rollout/light/`.
- **Dark**: 30 routes × {1440×900, 1920×1080} = **60 shots** → `docs/screenshots/theme-rollout/dark/`.
- **States** (both themes, 8 each): drawer (courses insights), modal (crm new-lead), approval (agents), warning (governance), insufficient-data (analytics), empty (agents/collaboration), nav-collapsed, Copilot-open → `docs/screenshots/theme-rollout/states/{light,dark}/`.

## Light Enterprise Hybrid — confirmed system-wide
- Soft-grey app bg (`#EEF2F5`), lighter workspace, white/near-white operational surfaces, dark readable text, subtle neutral separators.
- **Dark restrained right navigation** in every route; light top header; compact static Copilot in the dark nav.
- One steel accent; violet only for AI; semantic only for real status; **zero / "טרם נמדד" render neutral** (verified system-health, analytics, sales, submission).
- Tables: white surface, subtle row separators, steel selected row, soft chips with dark semantic text.
- Charts: single steel series (analytics, command-center, courses progress, service, learning), subtle grid, readable dark labels, no rainbow.
- **Overlays match theme**: light drawers/modals = white surface + dark text; not detached.

## Dark — preserved
Quiet Enterprise dark unchanged (surfaces, text, nav, tables); no restored neon/glow/orb. Layout + information hierarchy identical to light — theme changes values, not structure.

## Automated visual checks (both themes)
✓ 0 horizontal overflow (150/150 shots) · ✓ 0 axe serious/critical/contrast @1440+1920 · ✓ no external font requests · ✓ theme applied before paint · ✓ inherited Visual Calm density (≤4 KPIs, drawers, no 14-step stepper) preserved.

## Scores
See THEME_ROUTE_SCORECARD — all routes ≥4 in readability/hierarchy/long-session/theme-consistency, both themes.
