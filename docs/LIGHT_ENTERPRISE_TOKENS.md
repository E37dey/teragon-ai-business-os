# Light Enterprise Tokens

Canonical light-theme color values (`src/styles/tokens.css`, `:root` / `[data-theme="light"]`). `*` = adjusted from the spec to hold WCAG AA (see notes).

| Role | Token | Value |
|------|-------|-------|
| App bg | `--bg-app` | `#EEF2F5` |
| Workspace bg | `--bg-workspace` | `#F5F7F9` |
| Navigation bg (dark, hybrid) | `--bg-navigation` | `#111B26` |
| Surface 1 (cards/tables/forms) | `--surface-1` | `#FFFFFF` |
| Surface 2 | `--surface-2` | `#F8FAFB` |
| Surface 3 | `--surface-3` | `#EEF2F5` |
| Surface selected | `--surface-selected` | `#E7F0F3` |
| Surface hover | `--surface-hover` | `#F1F5F7` |
| Border subtle/default/strong | `--border-*` | `rgba(39,57,73, .08/.14/.22)` |
| Text primary | `--text-primary` | `#18232D` |
| Text secondary | `--text-secondary` | `#4F5F6E` |
| Text muted | `--text-muted` | `#545F6B` * (spec `#74818D`; darkened for AA incl. tinted/selected) |
| Text disabled | `--text-disabled` | `#8B96A1` * |
| Accent primary | `--accent-primary` | `#3F7E8D` |
| Accent hover | `--accent-primary-hover` | `#356E7B` |
| Accent soft | `--accent-primary-soft` | `#E2EEF1` |
| Accent text (AA on white) | `--accent-primary-text` | `#2C5F6B` * |
| AI violet | `--accent-ai` | `#665CB5` |
| AI soft / text | `--accent-ai-soft` / `-text` | `#ECEAF8` / `#514795` * |
| Success / soft / text | `--success` | `#367653` / `#E5F1E9` / `#2C6244` |
| Warning / soft / text | `--warning` | `#916724` / `#F5EBD8` / `#7A561E` |
| Danger / soft / text | `--danger` | `#A34E58` / `#F6E5E7` / `#8A414A` |
| Info / soft / text | `--info` | `#476F91` / `#E5EDF4` / `#3C5F7C` |
| Focus ring | `--os-focus-ring` | `0 0 0 2px rgba(63,126,141,.55)` |
| Header bg (light) | `--os-header-bg` | `var(--surface-1)` |
| Shadows | `--os-shadow-*` | very subtle neutral (`rgba(39,57,73,.04–.16)`), no glow |

## Fixed nav tokens (dark in both themes)
`--os-nav-bg: var(--bg-navigation)` · `--os-nav-text: #C7CFD9` · `--os-nav-text-strong: #EEF2F6` · `--os-nav-text-muted: #8B97A6` · `--os-nav-selected-bg: rgba(79,143,160,.20)` · `--os-nav-selected-text: #9FD0DD` · `--os-nav-selected-bar: #4D91A3` · `--os-nav-border: rgba(148,163,184,.12)`.

## Rules honored
- No pure-white full-page background (page = `#EEF2F5`; white only for contained surfaces).
- No neon, no glow (default glow = hairline ring; no colored halo in light).
- One steel-blue brand accent; violet reserved for AI; semantic only when meaningful; zero/missing = neutral.
- `--text-muted` and the accent/semantic `-text` variants were darkened from the spec where needed to clear WCAG AA on light surfaces (AA is mandatory; the spec palette was "recommended").

## Semantic `--os-*` aliases
Components may consume `--os-bg-app/-workspace/-navigation`, `--os-surface-1..3`, `--os-surface-selected/-hover`, `--os-border-subtle/-default/-strong`, `--os-text-primary/-secondary/-muted/-disabled`, `--os-accent-primary/-soft`, `--os-accent-ai/-soft`, `--os-success/-soft`, `--os-warning/-soft`, `--os-danger/-soft`, `--os-info/-soft`. All resolve per active theme.
