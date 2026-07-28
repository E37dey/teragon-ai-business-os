# Theme Full Accessibility

`@axe-core/playwright` (WCAG 2 A/AA), exact-viewport headless. Dark validated via the real header toggle (true `data-theme=dark`, persisted).

## Result — all 30 canonical routes (incl. /customers/c-1 and not-found)
| Theme | Widths | Serious | Critical | color-contrast | Overflow |
|-------|--------|---------|----------|----------------|----------|
| Light | 1440 + 1920 | **0** | **0** | **0** | **0** |
| Dark | 1440 + 1920 | **0** | **0** | **0** | **0** |

(`/submission/presentation` is the presentation route; captured but exempt from dense-chrome checks.)

## Contrast defects found & fixed in light
Every base semantic/accent token used as text (inline `color:`, ternaries, maps, agent-card CSS), all undefined-token neon fallbacks (`--os-amber/green/red/accent-cyan/text-1/text-3`), the not-found page, the `--os-nav` table/modal footers (dark-on-dark), the solid approve button, and `--text-muted` (darkened to `#545f6b` for AA on tinted surfaces). See THEME_HARDCODED_COLOR_AUDIT.

## Manual / Playwright-verified
- **Keyboard-only theme switching**: header `ThemeToggle` + settings `select` are native focusable controls; Enter/Space/Arrow operate; accessible name announces current + next.
- **Visible focus** both themes: steel focus ring (`--os-focus-ring`, per-theme).
- **Status not color-only**: chips/KPIs carry text + icon; zero/missing render neutral (`muted`), never success.
- **Disabled states** understandable (`--text-disabled`, darkened for AA).
- **Chart alternatives**: table toggles preserved (analytics, submission).
- **Modal/drawer focus + contrast**: overlays consume theme tokens; light drawer = white surface + dark text; dark drawer = dark surface + light text.
- **RTL reading order**: logical properties throughout; Hebrew right-aligned, LTR-isolated numbers/IDs.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` zeroes transitions.
- **Text-selection / link visibility**: links use `--os-cyan-text` (AA both themes).
- **Print readability**: always-light print theme (see THEME_PRINT_QA).

## Fonts
Zero external font requests; system Hebrew stack; no font console error.
