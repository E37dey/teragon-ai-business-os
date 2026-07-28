# Theme System — System-wide Rollout Report

Branch `post-release/theme-system-v3` (baseline `5d74997`). **Not merged, not tagged, not deployed.** No business logic / data / repository / permission / route-behavior change.

## Goal met
Both themes validated and completed across the whole application: **Light Enterprise Hybrid** (default, long-session CRM) + **Dark Quiet Enterprise** (optional). Every route-specific value that failed to consume semantic theme tokens was found and fixed.

## What was done
1. **Both-theme axe + overflow sweep** of all 30 canonical routes (light 1440+1920, dark 1440+1920). Dark was already 30/30; light surfaced 9 routes with defects.
2. **Hardcoded-color audit + fix**: 83 inline + 59 ternary/map base-token-as-text usages → `-text` variants; 8 undefined tokens rendering neon hex fallbacks fixed; not-found page, `--os-nav` footers, solid approve button, `--text-muted` — all fixed. `docs/THEME_HARDCODED_COLOR_AUDIT.md`.
3. **Re-sweep to green**: light 30/30, dark 30/30 (0 serious/critical/contrast, 0 overflow) at 1440 + 1920.
4. **Screenshots**: light 90 (×3 sizes), dark 60 (×2), states 16 (8/theme), print 1.
5. **Print** verified always-light from a dark screen theme.
6. **Full regression gate** green (see THEME_REGRESSION_RESULTS).

## Deliverables
- New: `THEME_SYSTEM_ROLLOUT_REPORT`, `THEME_HARDCODED_COLOR_AUDIT`, `THEME_ROUTE_SCORECARD`, `THEME_FULL_ACCESSIBILITY`, `THEME_FULL_VISUAL_QA`, `THEME_PRINT_QA`, `THEME_REGRESSION_RESULTS`, `THEME_SYSTEM_KNOWN_LIMITATIONS`.
- Updated: `THEME_SYSTEM_ARCHITECTURE`, `LIGHT_ENTERPRISE_TOKENS`, `DARK_THEME_COMPATIBILITY`.
- Screenshots under `docs/screenshots/theme-rollout/{light,dark,states,print}`.

## Verification snapshot
lint 0 · tsc 0 · tsc:tests 0 · Vitest 1706/1706 · build ✓ · secret CLEAN · axe light 30/30 · axe dark 30/30 · overflow 0/150 · external fonts 0 · print always-light ✓ · no-flash ✓.

## Recommended preview release version
`1.2.0` (minor — adds the theme system + system-wide light/dark; no behavior change). Suggested preview tag after approval: `v1.2.0-theme-preview` (do NOT tag/deploy without explicit go-ahead). Next step: a Netlify **draft preview** of this branch for human review — not production.
