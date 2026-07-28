# Theme System — Known Limitations (system-wide)

1. **localStorage mirror for pre-paint.** Source of truth is the canonical settings repo (IndexedDB, async); a synchronous `localStorage` mirror lets the `<head>` script resolve the theme before paint. Cache, not a second source of truth. IndexedDB can't be read synchronously; CSP forbids inline scripts.

2. **Spec palette lifted for AA (light).** `--text-muted` (`#74818D`→`#545f6b`), `--text-disabled`, and the accent/semantic `-text` variants were darkened to clear WCAG AA on light + tinted/selected surfaces. Soft fills keep the spec intensity. AA is mandatory.

3. **axe swept at 1440 + 1920** (both themes, all 30 routes). 2560 captured for light screenshots but not axe-swept (contrast is width-independent; overflow verified 0 at all sizes).

4. **Interactive-state captures are a representative set** (8 states × 2 themes): drawer, modal, approval, warning, insufficient-data, empty, nav-collapsed, Copilot-open. Loading/error/offline/pressed states are token-driven (same tokens) and covered by the both-theme axe pass; not each separately screenshotted.

5. **Print owner/version headers** exist in the dedicated report print stylesheets (submission, quick-start, quotations) but the global `@media print` block does not inject them for arbitrary routes (per-report content).

6. **Not-found is themed; access-denied** — the app is single-tenant demo (Mode A, no auth gate), so there is no distinct access-denied route; restricted/unmeasured states render as neutral honest states in both themes.

7. **`useTheme` degrades to a light default outside a provider** (isolated component tests). Real app always provides the context.

8. **Header quick control is a compact cycle button** (no existing profile dropdown); the full three-option selector is in `/settings → ממשק`.

9. **A few shared-CSS deltas touch dark subtly** (table/modal footer moved off `--os-nav`; approve button soft treatment) — near-identical in dark, documented in DARK_THEME_COMPATIBILITY.

10. **System-mode live OS switch** is handled via a `matchMedia('change')` listener in `ThemeProvider`; verified programmatically (listener wired), not via a real OS toggle in CI.
