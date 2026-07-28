# Theme Accessibility

Tool: `@axe-core/playwright` (WCAG 2 A/AA), exact-viewport headless renders. Dark validated through the **real** toggle (repo+mirror persistence), not a mirror-only injection.

## Result — pilot routes, both themes
| Theme | Routes | Widths | Serious | Critical | color-contrast | Overflow |
|-------|--------|--------|---------|----------|----------------|----------|
| Light | 6 | 1440, 1920 | **0** | **0** | **0** | **0** |
| Dark | 6 | 1440, 1920 | **0** | **0** | **0** | **0** |

Pilot = /courses, /crm, /service, /agents, /governance, /analytics.

## Contrast discipline (light)
Light exposed several latent issues, all fixed at the source:
- `--text-muted` (spec `#74818D`) failed AA on light → darkened to `#5B6773`; disabled likewise.
- Accent/semantic **base** tokens used as text → routed to darker `-text` variants (active tab, links, chips-in-rails, severity spans).
- `.os-table__footer` / `.os-modal__foot` used the always-dark `--os-nav` as background (dark-on-dark in light) → moved to `--os-surface-2`.
- `.os-btn--approve` (near-black on solid green) → calm soft treatment (AA in both themes).

## Also verified
- **Visible focus**: steel focus ring per theme (`--os-focus-ring`).
- **Status not by color alone**: chips/KPIs keep text + icon; zero/missing render neutral, never "success".
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` zeroes transitions (unchanged).
- **Theme control keyboard support**: the header `ThemeToggle` and the settings `select` are native focusable controls with accessible names (current + next announced); Enter/Space activate.
- **RTL**: logical properties throughout; Hebrew right-aligned, numbers/IDs LTR-isolated — unchanged.
- **Print**: always-light, dark ink on white, chrome hidden.
- **No color-only meaning; readable disabled state** (`--text-disabled` darkened for AA).

## Fonts
Zero external font requests (no `fonts.googleapis.com` / `fonts.gstatic.com`); system Hebrew stack. No font-related console errors. Verified: no external font references in `dist`, and a permanent test asserts no Google Fonts references in `index.html` / `tokens.css` / `theme-init.js`.
