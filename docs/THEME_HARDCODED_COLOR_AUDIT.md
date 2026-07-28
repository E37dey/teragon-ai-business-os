# Theme Hardcoded-Color Audit

Branch `post-release/theme-system-v3`. Every route component must consume semantic tokens; no theme-specific literal. Classification: **(1) semantic defect — replaced · (2) technically required · (3) brand asset · (4) print-only.**

## (1) Semantic defects — REPLACED
| Kind | Count | Example → fix |
|------|-------|---------------|
| Base token used as text (`color: var(--os-{cyan/blue/danger/success/warning/violet})`) | **83 inline** + agent-card CSS (6) | `var(--os-danger)` → `var(--danger-text)` (readable, AA both themes) |
| Base token as text in **ternaries/maps** (quoted) | **59** | `warn ? "var(--os-warning)" …` → `"var(--warning-text)"` |
| **Undefined tokens** rendering a hardcoded neon fallback | — | `var(--os-amber,#E8B93E)`→`--warning-text` · `var(--os-green,#3ECF8E)`→`--success-text` · `var(--os-red,#E85C5C)`→`--danger-text` · `var(--os-accent-cyan,#20C4E8)`→`--os-cyan` · `var(--os-text-1)`→`--os-text` · `var(--os-text-3,#6B7A90)`→`--os-muted` · `var(--os-bg-raised)`→`--os-raised` · `var(--os-text-secondary)`→`--os-text-2` |
| Not-found page hardcoded darks | 3 | `#F5F8FD/#98A8BD/#20C4E8` → `--os-text/--os-text-2/--os-cyan-text` |
| `.os-table__footer` / `.os-modal__foot` bg `var(--os-nav)` (dark-on-dark in light) | 2 | → `var(--os-surface-2)` |
| `.os-btn--approve` near-black on solid green | 1 | → soft treatment (`--success-soft`/`--success-text`) |
| `--text-muted` too light for AA on tinted light surfaces | token | `#74818D`→`#545f6b` |

All base-token-as-text now resolves to `-text` variants; **0 remaining** base-as-text and **0 undefined tokens** in route modules.

## (2) Technically required — documented, unchanged
- `GlowOrb` radial-gradient literals (the small static AI marker) — decorative gradient, theme-neutral, low-prominence.
- Overlay scrim `rgba(0,0,0,…)` backdrops (Drawer/Modal) — a dark scrim reads correctly over both themes.
- `--os-shadow-*` rgba — defined per-theme in tokens.css (neutral light shadows / black-alpha dark).

## (3) Brand assets — unchanged
- `favicon.svg`, `icons.svg` brand marks.
- Quotation print brand color `#1d4ed8` (print-only brand accent).

## (4) Print-only — verified separately (see THEME_PRINT_QA)
Hardcoded `#000/#fff/#111/#333/#555/#ccc` in the dedicated print stylesheets (`analytics/reportPrint`, `implementation/AsIsToBe` print, `presentation` handout, `quick-start` print, `submission/printView`, `quotations/printView`) are **correct** — print is always light, dark ink on white paper. The global `@media print` block in tokens.css additionally forces light tokens regardless of the selected theme.

## Method
`grep`/`perl` sweep over `src/modules`, `src/components`, `src/design-system` for `color:`-context `var(--os-*)` base tokens, quoted-exact base tokens, and `var(--os-*, #hex)` undefined-token fallbacks; each converted with a lookbehind guard to avoid `-color:` (borders) and verified not used as background/border/fill/stroke before conversion. Confirmed by axe: **light 30/30, dark 30/30 clean**.
