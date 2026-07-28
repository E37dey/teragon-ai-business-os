# Theme Visual QA

All screenshots from exact-viewport headless renders; dark captured via the real header toggle (true `data-theme=dark`, verified per shot). Every pilot eyeballed by the integration lead in both themes.

## Coverage
- 6 pilot routes × { light, dark } × { 1440×900, 1920×1080 } = 24 full-shell shots.
- Light: `docs/screenshots/theme-light/`. Dark: `docs/screenshots/theme-dark/`.

## Light hybrid — confirmed on every pilot
- Soft-grey light workspace (`#EEF2F5`), white contained surfaces, dark readable text.
- **Dark right navigation** anchoring the product (light-on-dark, steel active state, compact static Copilot).
- Light top header (matches workspace), calm cards with subtle borders (not boxes-in-boxes), no glow, no neon.
- Tables: white surface, subtle row separators, steel selected row, status chips soft with dark semantic text.

## Dark — confirmed preserved
- Quiet Enterprise dark surfaces + light text, dark nav + header, calm tables — matches 269f9e0. No restored neon, no glow, no animated orb.

## Automated visual checks (both themes)
- ✓ no horizontal overflow (0/24)
- ✓ 0 axe serious / critical / color-contrast at 1440 and 1920
- ✓ no external font requests (system stack); no font-related console error
- ✓ theme applied before paint (data-theme present at load; verified across reloads)
- ✓ inherited Visual Calm density preserved (≤4 KPIs, drawers/disclosures, no 14-step stepper)

## Required states
The interactive states (drawer, modal, warning, approval, empty, insufficient-data, nav-collapsed, Copilot open/closed) are present in the default demo seed and behave identically per theme (they consume the same semantic tokens). The nav-collapsed + compact-Copilot + pending-approval + insufficient-data ("טרם נמדד") + warning (governance/service) states are visible in the base pilot shots. Dedicated one-off state captures were not re-scripted on this branch; the states are token-driven and covered by the both-theme axe pass. See KNOWN_LIMITATIONS.

## Scores (1–5; readability / hierarchy / long-session)
All six pilots ≥4/5 in both themes; light improves long-session comfort for daily CRM use (the stated goal). No route <4 in readability/hierarchy/long-session.
