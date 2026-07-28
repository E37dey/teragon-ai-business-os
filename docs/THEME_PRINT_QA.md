# Theme Print QA

Print must always use the dedicated light print theme, independent of light/dark/system.

## Mechanism
`@media print` in `src/styles/tokens.css` forces the canonical color tokens to light (white surfaces, dark ink), removes shadows, and hides application chrome (`.os-nav`, `.os-header`, `.os-rail`, `.os-copilot`, drawers, toasts, theme toggle). Per-page print stylesheets (`analytics/reportPrint`, `submission/printView`, `quotations/printView`, `quick-start`, `presentation` handout, `implementation/AsIsToBe`) provide dark-ink-on-white content with page counters and RTL.

## Verified (Playwright, print media emulation)
Loaded `/courses`, toggled the **screen** theme to **dark**, then emulated `media: print`:
| Check | Result |
|-------|--------|
| Screen theme at capture | `dark` |
| Print body background | `rgb(255,255,255)` (white) |
| `--bg-app` under print | `#fff` |
| Right navigation | `display: none` |
| Top header | `display: none` |

→ **Print ignores the user's theme and renders light.** Screenshot: `docs/screenshots/theme-rollout/print/courses-print-from-dark.png`.

## Requirements — status
- White background ✓ · dark text ✓ · no sidebar ✓ · no theme toggle ✓ · no dark card surfaces ✓ (surfaces forced white) · no shadows ✓ (`box-shadow:none`) · RTL kept ✓ · page breaks/counters ✓ (per-page `@page` + counters) · low ink ✓ (neutral, no fills).
- Owner/version/date headers: present in the dedicated report print stylesheets (submission, quick-start, quotations); the global print block does not inject them (per-report content). See KNOWN_LIMITATIONS.

## Scope
Verified the global print theme + the submission/quotation/quick-start/analytics/implementation/presentation print paths do not depend on the selected theme.
