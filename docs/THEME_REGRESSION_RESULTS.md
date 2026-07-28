# Theme Regression Results

Branch `post-release/theme-system-v3`. The rollout changed only visual token consumption — no business logic, data, repositories, permissions, or route behavior.

## Gate
| Check | Result |
|-------|--------|
| `oxlint` | **0 warnings / 0 errors** |
| `tsc -b` (app) | **0** |
| `tsc -p tsconfig.tests.json` | **0** |
| Vitest (unit + integration) | **1706 / 1706** (187 files) |
| Production build | ✓ |
| Secret scanner | **CLEAN — 0 findings** |
| axe — light, 30 routes @1440+1920 | 0 serious / 0 critical / 0 contrast |
| axe — dark, 30 routes @1440+1920 | 0 serious / 0 critical / 0 contrast |
| Horizontal overflow — 150 shots | 0 |
| External font requests | 0 (`fonts.googleapis`/`fonts.gstatic` absent from `dist`) |

## Route refresh
All 30 canonical routes render on direct URL load (SPA redirect) in both themes; theme is applied before first paint on every load (mirror + `<head>` init). Not-found (`*`) and `/submission/presentation` refresh correctly and preserve the theme.

## Console / network
No console errors introduced (the previous Google-Fonts CSP console error is gone). No app same-origin network failures. CSP unchanged (`script-src 'self'`, no `unsafe-inline`/`unsafe-eval`); the no-flash init is a same-origin classic script.

## Dead controls / behavior
No control moved, hidden, or reordered by the theme — light and dark share identical layout + information hierarchy. The theme toggle + settings select are the only added controls; both persist and apply live.

## Notes
- The 12 new theme unit tests (`tests/theme/themeSystem.test.ts`) are included in the 1706.
- A prior transient router-smoke flake (parallel-load timeout) does not recur here; the suite passed clean.
