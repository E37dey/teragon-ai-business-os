# Theme System v3 — Architecture

Branch `post-release/theme-system-v3` (baseline commit `269f9e0`). Not deployed, not merged, no tag.

**Direction:** Light Enterprise Hybrid (default) · Dark Quiet Enterprise (optional) · System (follows OS). Light workspace + dark right navigation. Color communicates meaning, not decoration.

## Token flow
`data-theme="light|dark"` on `<html>` selects the active **canonical color** block in `src/styles/tokens.css`. Only color values differ per theme:
- `:root, :root[data-theme="light"]` → light values (the default).
- `:root[data-theme="dark"]` → the preserved 269f9e0 Quiet Enterprise values.

Everything else (spacing, radius, type, transitions, layout, z, the legacy `--os-*` remaps, the semantic `--os-*` aliases, the nav tokens, default glow) lives once in a **shared** block and inherits the active theme via `var()`. Components consume semantic tokens (`--os-bg-*`, `--os-surface-*`, `--os-text-*`, `--os-accent-*`, `--os-success/-soft`, …) or the legacy `--os-*` names — **never a hardcoded light/dark hex**. Theme switching changes token *values* only.

## The hybrid (nav stays dark in both themes)
The right navigation must stay dark in light mode. Its chrome consumes a **fixed** nav-token set (`--os-nav-bg`, `--os-nav-text`, `--os-nav-text-muted`, `--os-nav-selected-*`, `--os-nav-border`) defined once in the shared block — always light-on-dark — so the nav never flips. `--bg-navigation` is dark in both theme blocks. The header uses `--os-header-bg` (light `--surface-1` in light, deep `--bg-navigation` in dark) so it matches the workspace per theme without regressing dark.

## Runtime
- **Contract** (`src/theme/themeContract.ts`): `ThemePreference = 'light'|'dark'|'system'`, `ResolvedTheme`, `resolveTheme`, `systemPreference`, He↔code maps, mirror key.
- **Repository** (`src/theme/ThemePreferenceRepository.ts`): source of truth = the canonical settings repository (`interface.theme` in the `meta` settings record). Also writes a synchronous **localStorage mirror** used only for pre-paint resolution — a cache, not a second source of truth.
- **Provider** (`ThemeProvider.tsx` + `themeContext.ts`): `useTheme()` → `{ currentPreference, resolvedTheme, systemPreference, isSystemMode, setPreference, toggleTheme }`. First render uses the mirror (already applied by the init script), then reconciles from the canonical repo; tracks `prefers-color-scheme` live for `system`. `useTheme` degrades to a safe light default outside a provider (isolated component tests) instead of throwing.
- **No-flash init** (`public/theme-init.js`): a same-origin classic `<script>` in `<head>` (allowed by CSP `script-src 'self'`, no inline, no eval), runs synchronously before first paint, reads the mirror (+ `matchMedia` for system) and sets `data-theme`. `<html data-theme="light">` is the static default.
- **Boot reconcile** (`applyUiSettings`): reads `interface.theme` from the canonical record and syncs `data-theme` + the mirror at boot.

## Controls
- `/settings` → group `ממשק` → `ערכת נושא` select (בהיר / כהה / לפי המערכת), routed through `useTheme().setPreference` (live + persistent).
- Header quick control (`ThemeToggle`) cycles בהיר→כהה→לפי המערכת with an accessible name announcing current + next.

## Persistence
`setPreference` writes the canonical settings repo (async) AND the mirror (sync) AND applies `data-theme`. Survives refresh with no flash. An existing explicit preference is never silently changed. New users default to **light**.

## Print
`@media print` in tokens.css forces an always-light print theme (white paper, dark ink, no nav/header/rail, no shadows, RTL kept) regardless of the selected theme.

## Fonts / CSP
External Google Fonts removed (index.html + tokens.css); system Hebrew stack `"Segoe UI", "Arial Hebrew", Arial, sans-serif`. Zero external font requests. CSP unchanged and not weakened.

## System-wide rollout (post-baseline)
The theme system was rolled out and validated across all 30 canonical routes in both themes: every route-specific base-token-as-text / undefined-token / hardcoded value was converted to semantic `-text` variants (see THEME_HARDCODED_COLOR_AUDIT). Result: light 30/30 and dark 30/30 axe-clean at 1440+1920, 1706/1706 tests, print always-light. See THEME_SYSTEM_ROLLOUT_REPORT.
