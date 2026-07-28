# Theme Pilot Report

Branch `post-release/theme-system-v3`. Not deployed. Pilot gate for human visual review.

## Pilot routes (learning / dense table / technical ops / AI / policy+audit / data-viz)
/courses · /crm · /service · /agents · /governance · /analytics.

## Acceptance criteria — met (both themes, 1440 + 1920)
| Criterion | Light | Dark |
|---|---|---|
| Light central workspace / dark restrained right nav | ✓ | n/a (all dark) |
| No pure-white full-page glare | ✓ (`#EEF2F5`) | ✓ |
| No neon / no normal-component glow | ✓ | ✓ |
| ≤4 primary KPIs, one dominant workflow | ✓ (inherited from Visual Calm) | ✓ |
| Readable Hebrew, no one-word columns, no clipping | ✓ | ✓ |
| No horizontal overflow | ✓ (0/12) | ✓ (0/12) |
| Secondary content still accessible (drawers/disclosure) | ✓ | ✓ |
| Semantic status colors meaningful; zero = neutral | ✓ | ✓ |
| Body text ≥14px | ✓ | ✓ |
| axe 0 serious / 0 critical / 0 contrast | ✓ | ✓ |
| Dark preserves Quiet Enterprise, no regression | — | ✓ |

## Route-specific checks
- **/courses**: 4 KPIs + progress strip, 3 phases + active steps, dominant learner workflow, no 14-step stepper — intact in both themes.
- **/governance**: 4 primary KPIs, 0 active policies neutral, risk severity uses `-text` variants (AA in both).
- **/agents**: no per-row emergency button, agents don't glow, pending approval clear.
- **/analytics**: one steel chart series, no rainbow, definitions secondary — chart colors validated in both themes.
- **/crm**, **/service**: calm tables, steel selected row, quiet KPIs.

## Tests
lint **0** · typecheck **0** · typecheck:tests **0** · Vitest **1706/1706** (incl. 12 new theme tests) · build ✓ · secret scanner **CLEAN**.

## Persistence & flash
- New user → **light** by default.
- Set light/dark → persists across refresh (canonical settings repo + mirror); verified dark survives full reloads via the toggle.
- System mode follows `prefers-color-scheme` live.
- No-flash: `data-theme` applied by a same-origin `<head>` script before first paint; `<html data-theme="light">` static default.

## Screenshots
Light: `docs/screenshots/theme-light/<route>-{1440x900,1920x1080}.png`.
Dark: `docs/screenshots/theme-dark/<route>-{1440x900,1920x1080}.png`.

## Not deployed. Stop for human visual review before rollout.
