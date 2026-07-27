# Visual Calm — Accessibility Report

Branch `post-release/visual-calm-v2`. Not deployed. Tool: `@axe-core/playwright` (WCAG 2 A/AA rules) via `scripts/calm-verify.mjs`, exact-viewport headless renders.

## Result — full application sweep
| Widths | Routes | Serious | Critical | color-contrast nodes | Horizontal overflow | Page errors |
|--------|--------|---------|----------|----------------------|---------------------|-------------|
| 1440×900 | 30 | **0** | **0** | **0** | **0** | **0** |
| 1920×1080 | 30 | **0** | **0** | **0** | **0** | **0** |
| 2560×1440 | 30 | **0** | **0** | **0** | **0** | **0** |

(30 = all lazy routes incl. `/customers/:id` via `/customers/c-1`; `presentation` is a full-screen mode, excluded from app-chrome sweep.)

## Contrast — the recolor discipline
The calm palette lowered several base tokens; anywhere a base token was used as **text on a soft/dark surface** it initially failed AA. All were routed to the readable `-text` variants (`--accent-primary-text`, `--success-text`, `--warning-text`, `--danger-text`, `--accent-ai-text`), and the solid `--success/--warning/--danger` bases were lifted to clear AA-as-text (soft fills unchanged). Fixed at the shared level: chips, `os-btn` accent variants + hovers, active-nav label/badge, `ProviderStateBadge`, KPI icons (`OS_ACCENT_HEX`→token variants); at route level: courses/service/sales/quick-start colored text. **No bright-cyan body text; no pure-white body text.**

## Also verified
- **Keyboard**: nav links, tabs, drawers, row-action menus (`<details>`), phase steps (roving Arrow/Home/End), KPI/table controls all reachable; focus ring is a visible steel `0 0 0 2px` ring (replaced cyan).
- **Status never by color alone**: every status chip carries text (+icon); KPI semantic color is accompanied by the label and the number.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` zeroes all transition durations globally (tokens.css); the animated Copilot orb was removed from the inactive shell.
- **Readable disabled states**: `--text-disabled` token; OsButton disabled variants keep a reason.
- **Honest states**: unmeasured data renders neutral "טרם נמדד"/"טרם נבדק", never fake green (system-health, agents cost, analytics baselines).
- **RTL**: logical properties throughout; Hebrew right-aligned, numbers/IDs LTR-isolated.

## Notes
- 12px/11px remain for metadata/chips only (secondary/metadata floors per the type scale); operational body text is ≥14px.
- axe covers automatable checks; manual keyboard + reading-order spot-checks were done on pilot + graph routes.
