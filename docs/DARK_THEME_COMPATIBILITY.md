# Dark Theme Compatibility

The dark theme is the **preserved Quiet Enterprise** system from commit `269f9e0`, now scoped under `:root[data-theme="dark"]`.

## Preserved (byte-identical values)
All dark canonical colors are copied verbatim from 269f9e0: `--bg-app #070d15`, surfaces `#0d1723/#111e2d/#172536`, neutral-slate borders, text `#e5ebf2/#a7b2c1/#8593a5`, steel accent `#4d91a3`, AI `#7268c9`, semantic (success `#6bb083`, warning `#ca9a55`, danger `#cf7b84`, info `#5783a5`) with their soft/text/border variants, the dark shadows, the reserved active-glow tokens, and the cyan-family readable `-text` variants.

## Explicitly NOT restored
- No neon cyan (`#20c4e8`), no bright blue borders — accents remain the single steel.
- No card glow — default glow stays a hairline ring; only the reserved live/critical active-glow tokens exist.
- No animated Copilot orb — the inactive Copilot stays a compact static button.
- No saturated semantic backgrounds — soft fills unchanged.
- No excessive contrast — body text stays `#e5ebf2`, not pure white.

## Small deltas introduced by the theme system (dark)
- `--os-header-bg` = `var(--bg-navigation)` in dark → the header keeps the exact deep-nav tone it had at 269f9e0 (no change).
- The `.os-table__footer` / `.os-modal__foot` backgrounds moved from `var(--os-nav)` to `var(--os-surface-2)`. In dark this is a marginally lighter footer (surface-2 vs nav) — a latent bug fix (those footers were dark-on-dark in light mode); visually near-identical in dark.
- `.os-btn--approve` changed from solid green + near-black text to the calm **soft** treatment (success-soft bg + success-text), consistent with the other buttons and AA in both themes.
- The active-tab and a few route inline colors switched from base tokens to readable `-text` variants (no visible change in dark; fixes AA in light).

## Verification (dark, via the real toggle)
- `/courses /crm /service /agents /governance /analytics` at 1440 + 1920: **0 axe serious, 0 critical, 0 color-contrast, 0 horizontal overflow**.
- The toggle persists dark across full reloads (repo + mirror); `data-theme=dark` applied before paint (no flash).
- Screenshots: `docs/screenshots/theme-dark/<route>-<size>.png`.

## System-wide sweep result
In the full both-theme rollout sweep, **dark scored 30/30 clean** (0 serious/critical/contrast, 0 overflow) at 1440 and 1920 across every canonical route — confirming no dark regression from the light-mode fixes. All light-mode contrast fixes used the `-text` variants (unchanged in dark) or workspace-surface swaps (near-identical in dark).
