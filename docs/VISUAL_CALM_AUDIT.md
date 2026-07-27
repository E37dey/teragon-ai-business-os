# Visual Calm Audit — TERAGON AI BUSINESS OS

Branch: `post-release/visual-calm-v2` · Scope: system-wide (31 routes) · Not deployed.

Direction: **Quiet Enterprise Intelligence** — ~85% neutral surfaces/typography, ~10% brand accent, ~5% semantic status. Color communicates meaning, never decoration.

## Method
Grounded in the actual codebase, not impressions. Metrics captured on the pre-change tree:
- **28** legacy glow-token usages (`var(--os-glow-*)`), **55** `box-shadow` declarations.
- **43** files referencing the cyan accent, **10** referencing violet.
- Single token source: `src/styles/tokens.css` (all theming flows through `--os-*`).

## Findings

| # | Dimension | Current behavior | Visual problem | Cognitive impact | Recommended treatment | Affected | Risk |
|---|-----------|------------------|----------------|------------------|-----------------------|----------|------|
| 1 | Background | `--os-bg: #030812` (near-pure black) + hardcoded `#030812` in `index.css`, `MinimalShell` | Pure-black raises apparent contrast of every accent | Eye strain over long sessions | `--bg-app: #070D15` calm dark; kill hardcoded literals | tokens, index.css, MinimalShell | Low |
| 2 | Borders | `--os-border: rgba(112,158,220,.17)` — **blue-tinted on every element** | Everything looks outlined/active | No hierarchy; "everything highlighted" | Neutral slate `rgba(148,163,184,.16)` | global token | Low |
| 3 | Accent | Neon cyan `#20c4e8` + bright blue `#287bff` as dual signature | Cyber-command-center intensity | Multiple competing focal points | Single steel `#4D91A3`; cyan+blue collapse to it | 43 files (token remap) | Low |
| 4 | AI violet | `#7655ff` bright; constantly-glowing Copilot orb | Decorative violet everywhere | Violet loses AI meaning | `#7268C9`; violet reserved for AI; de-glow orb (VC-B) | 10 files + GlowOrb | Med |
| 5 | Glow | 6 per-accent neon halos at 0.18 on cards/nav/tabs/rows | Neon bloom on normal UI | Fatigue; false sense of "live" | Default glow → hairline ring; reserve subtle ≤0.12 for live/critical | 28 usages (token) | Low |
| 6 | Body text | `--os-text: #f5f8fd` (near-white) | Max-contrast text on black = glare | Harsh for reading | `#E5EBF2` primary, `#A7B2C1` secondary | global token | Low |
| 7 | Status text | Semantic **base** used as text on soft/dark | Post-recolor AA regressions | Illegible chips/labels | Lighter `-text` variants; solid base lifted to AA | chips, btns, 61 inline sites | Med |
| 8 | Type scale floor | `--os-text-2xs: 11px` used for some operational info | Compressed Hebrew | Reading difficulty | Operational body ≥14px; 11px decorative-only | per-route (VC-C…F) | Med |
| 9 | Line-height | `--os-leading-normal: 1.45` | Tight blocks | Lower readability | 1.55 (+ 1.65 relaxed, `--os-measure: 72ch`) | global token | Low |
| 10 | KPI density | Operational pages show 5+ KPIs, each a different color | Rainbow metric strips | No prioritization | ≤4 primary KPIs; rest → "מדדים נוספים"/drawer | per-route | Med |
| 11 | Card nesting | Bordered card inside bordered panel inside bordered section | Boxes-in-boxes | Structural noise | Max depth 3; dividers over nested boxes | per-route | Med |
| 12 | Permanent panels | Multiple always-on side rails at 1440–1600 | Center workflow loses priority | Split attention | Rail only where it adds value; else drawer (`HideShellRail`) | shell + routes | Med |
| 13 | Nav density | All groups expandable, zero-value badges, glowing active item | Busy navigation | Scanning cost | Active group only; hide zero badges; single calm active-state | shell (VC-B) | Low |
| 14 | Focus ring | Cyan `rgba(32,196,232,.55)` | Off-palette | — | Steel `rgba(77,145,163,.6)` | global token | Low |
| 15 | Motion | Continuous orb glow / decorative animation | Constant movement | Distraction | 120–180ms state-only; honor `prefers-reduced-motion` | tokens + GlowOrb | Low |

## VC-A resolution (this commit)
Findings 1,2,3,5,6,7,9,14,15 are **token-level** and resolved globally in `tokens.css` (+ `index.css`, `MinimalShell`, chip/nav/btn text-contrast fixes in `components.css`, `courses.css`, `LearnerList.tsx`). Findings 4,8,10,11,12,13 are **per-component / per-route** and are scheduled for VC-B (shell) and VC-C…VC-G (routes). See `VISUAL_CALM_ROUTE_PRIORITY.md`.

## Verification (VC-A)
- axe on 6 pilot routes (/courses, /crm, /service, /agents, /governance, /analytics) @1440×900: **0 serious / 0 critical / 0 color-contrast**.
- No horizontal overflow on any pilot route; no page errors.
- `tsc` clean; lint clean; **1694/1694** unit/integration tests pass.
