# Theme System — Known Limitations

Honest list. Nothing here blocks the light/dark goal.

1. **localStorage mirror for pre-paint.** The canonical source of truth is the settings repository (IndexedDB, async). A synchronous `localStorage` mirror (`teragon.theme.preference`) exists purely so the no-flash `<head>` script can resolve the theme before first paint — it is a cache written on every change and reconciled at boot, not a second source of truth. Justified because IndexedDB cannot be read synchronously before paint, and CSP forbids inline scripts.

2. **Spec palette lifted for AA (light).** `--text-muted` (spec `#74818D`), `--text-disabled`, and the accent/semantic `-text` variants were darkened to clear WCAG AA on light surfaces. Soft fills keep the spec intensity. AA is mandatory; the palette was "recommended".

3. **Pilot scope.** The theme system was validated on the 6 pilot routes in both themes (0 axe, both sizes). The other 25 routes inherit the same semantic tokens (they were built token-only in Visual Calm) and are expected to theme correctly, but were not individually axe-swept in both themes on this branch — that is the system-wide rollout step, to run after approval.

4. **Dedicated interactive-state captures not re-scripted.** The one-off state screenshots (drawer/modal/warning/approval/empty/insufficient-data) were not separately captured on this branch (the state script lived on the visual-calm branch). The states are token-driven and covered by the both-theme axe pass; they can be captured on request.

5. **A few shared-CSS deltas touch dark subtly.** Table/modal footers moved off the always-dark `--os-nav` to `--os-surface-2` (a light-mode bug fix; near-identical in dark); the approve button became the calm soft treatment. Documented in DARK_THEME_COMPATIBILITY.

6. **Print page numbers / owner+version.** The print theme forces light + hides chrome + sets `@page` margins, but does not inject page numbers / owner / version headers (those would be per-report content). Browser print dialog page numbers still apply.

7. **`useTheme` degrades to a light default outside a provider** (so isolated component tests that mount the shell don't crash). Real app always provides the context.

8. **Header quick control is a compact cycle button**, not a full profile-menu dropdown (there is no existing profile dropdown to attach to). It carries an accessible name announcing current + next; the full selector lives in `/settings`.
