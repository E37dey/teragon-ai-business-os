# Visual Calm Tokens — canonical system

Single source of truth: `src/styles/tokens.css`. Legacy `--os-*` tokens are **remapped** onto the canonical names below, so existing components calm at the source with no per-component edits.

## Before → After (global)

| Role | Legacy token | Before | After (canonical) | After value |
|------|--------------|--------|-------------------|-------------|
| App bg | `--os-bg` | `#030812` | `--bg-app` | `#070D15` |
| Nav bg | `--os-nav` | `#050b15` | `--bg-navigation` | `#09111C` |
| Workspace | — | — | `--bg-workspace` | `#0A1420` |
| Surface 1 | `--os-panel` | `#07111f` | `--surface-1` | `#0D1723` |
| Surface 2 | `--os-raised` | `#0a1627` | `--surface-2` | `#111E2D` |
| Surface 3 | `--os-highlight` | `#0c1c31` | `--surface-3` | `#172536` |
| Selected | — | — | `--surface-selected` | `#1A2B3B` |
| Border | `--os-border` | `rgba(112,158,220,.17)` (blue) | `--border-default` | `rgba(148,163,184,.16)` (slate) |
| Border strong | `--os-border-strong` | `rgba(112,158,220,.28)` | `--border-strong` | `rgba(148,163,184,.24)` |
| Text primary | `--os-text` | `#f5f8fd` | `--text-primary` | `#E5EBF2` |
| Text secondary | `--os-text-2` | `#98a8bd` | `--text-secondary` | `#A7B2C1` |
| Text muted | `--os-muted` | `#75879f` | `--text-muted` | `#8593A5` * |
| Accent | `--os-cyan` + `--os-blue` | `#20c4e8` + `#287bff` | `--accent-primary` | `#4D91A3` |
| Accent (text) | — | — | `--accent-primary-text` | `#7FC0D1` |
| AI | `--os-violet` | `#7655ff` | `--accent-ai` | `#7268C9` |
| Success | `--os-success` | `#21c981` | `--success` | `#6BB083` * |
| Warning | `--os-warning` | `#e7a93d` | `--warning` | `#CA9A55` * |
| Danger | `--os-danger` | `#ec5d68` | `--danger` | `#CF7B84` * |
| Info | — | — | `--info` | `#5783A5` |
| Focus ring | `--os-focus-ring` | cyan `.55` | steel | `rgba(77,145,163,.6)` |
| Leading | `--os-leading-normal` | `1.45` | — | `1.55` |

`*` = **lifted from the spec hex to satisfy WCAG AA as text** on dark surfaces (spec palette is "approximate"; AA is mandatory). The soft fills / borders keep the calm spec intensity — they are independent rgba literals (`--*-soft`, `--*-border`), so surfaces are unchanged by the lift. Muted `#8593A5` (spec `#748194`) for the same reason. See `VISUAL_CALM_KNOWN_LIMITATIONS.md`.

## Glow policy
- Default `--os-glow-*` (6 tokens, 28 usages) → `inset 0 0 0 1px <border>` — a hairline ring, **no halo**.
- Reserved subtle glow (≤0.12) for the few allowed states: `--os-glow-active-ai`, `--os-glow-active-live`, `--os-glow-critical`.
- Depth uses black-alpha shadows (`--os-shadow-*`), never colored bloom.

## Type & spacing
- Scale: `2xs 11` (decorative only) · `xs 12` (metadata floor) · `sm 13` (secondary floor) · `md 14` (operational body floor) · `base 15` · `lg 17` · `xl 19` · `2xl 24` (page) · `kpi 30`.
- Leading: tight `1.3` · normal `1.55` · relaxed `1.65`. Measure: `--os-measure: 72ch`.
- Spacing: `4/8/12/16/24/32/40/48` (`--os-space-2..11`).

## Accent-text variants (use for text/icons on dark)
`--accent-primary-text #7FC0D1` · `--accent-ai-text #A99FE6` · `--success-text #7FC59A` · `--warning-text #D9B177` · `--danger-text #E08C95` · `--info-text #86B0CF`.
Rule: **base tokens for fills/borders/bars; `-text` variants for text/icons on dark.**

## Reduced motion
`@media (prefers-reduced-motion: reduce)` zeroes all transition durations globally.
