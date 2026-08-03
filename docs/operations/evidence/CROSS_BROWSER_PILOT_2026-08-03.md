# Cross-browser × responsive Demo-Pilot coverage — 2026-08-03

**Verdict: B4 FIXES REQUIRED** — coverage is authoritative and green (deterministic),
but one **genuine responsive defect** is tracked, so B4 is **not** closed.

Config: `e2e/cross-browser.config.ts` · Spec: `e2e/pilot/cross-browser.pilot.ts`
LOCAL synthetic-data preview build, Demo Mode ON. No staging, no Production, no
real data.

## Matrix

**3 engines × 3 viewports = 9 projects.** Each project runs 15 checks
(7 render + 7 horizontal-overflow + 1 dialog-fit).

| Engine | desktop 1440×900 | tablet 768×1024 | mobile 390×844 |
|---|---|---|---|
| Chromium | ✅ 15/15 | ✅ 15/15 | ✅ 15/15* |
| Firefox | ✅ 15/15 | ✅ 15/15 | ✅ 15/15* |
| WebKit† | ✅ 15/15 | ✅ 15/15 | ✅ 15/15* |

`*` mobile: 6 of the 7 overflow checks are **tracked expected-failures** (see
defect below) — deterministic, not flaky, and they flip to *failing* the moment
the defect is fixed. `†` **WebKit is a Safari compatibility proxy on non-Apple
hardware — NOT proof of testing real Safari.**

Routes covered (7): `login`, shell home `/`, Customers list, Customer detail
(`/customers/cu-1`), Contacts list, System Health, and an unknown/404 route.

## What each check validates (not loosened)

- renders without crash (route-appropriate anchor; HTTP < 400)
- **RTL** `dir="rtl"` preserved
- persistent **Demo-Mode banner** present on every surface
- **primary nav reachable**: inline nav on ≥1024px; on narrow viewports the
  hamburger opens a drawer whose nav is asserted visible
- **no horizontal overflow** (≤2px tolerance) — its own test per route
- **console/page errors** — none unexpected (benign allowlist: favicon,
  ResizeObserver loop, devtools, router future-flag, vite)
- **dialog fits** inside the viewport (quick-create)

## Genuine responsive defect (for S10.3-C2)

**At 390px the header global-search box does not collapse and overflows the RTL
(left) edge by ~20px**, so every route rendering the shell header overflows
horizontally. Pinpointed elements: `.os-header__search` → `.os-search` →
`.os-search__input` (+ `.os-search__kbd`), measured left edge `-20px`.

- **Affected:** all shell routes + the 404 page, at **390px only**, on **all
  three engines** (a CSS layout issue, not engine-specific).
- **Not affected:** every route at **768px and 1440px**; the `login` page (no
  shell header) at 390px.
- **Fix belongs to S10.3-C2:** collapse/hide or shrink the header search below a
  breakpoint (e.g. move it behind an icon on narrow viewports). Small and
  contained; deliberately **not** done here (this checkpoint is coverage, not a
  redesign).

## Test-only defects fixed here (deterministic)

1. **webkit race:** non-shell routes anchored on `body` (resolves before the
   above-router banner mounts under webkit's slower JS). Re-anchored on the
   banner's own testid — a correct readiness signal, not a loosened assertion.
2. **mobile nav anchor:** readiness anchored on `nav.os-nav`, which correctly
   collapses on mobile. Re-anchored on the always-present `header.os-header`; nav
   reachability is asserted per-viewport (inline vs hamburger-drawer).

## Gates

`typecheck` exit 0 · `typecheck:tests` 0 errors · scoped oxlint clean ·
`npm run build` passes. Screenshots/traces retained **only on failure**
(gitignored `test-results/`).

## Honest scope limits

- Real Safari on Apple hardware, and physical devices, are **not** covered —
  WebKit/emulated viewports only.
- No load/perf testing; functional + layout only.
- Local browser availability was **complete** (all 3 engines installed), so the
  matrix ran locally; it is reproducible via
  `npx playwright test -c e2e/cross-browser.config.ts`.
