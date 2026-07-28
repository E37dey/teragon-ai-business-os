# Theme Preview — E2E Results

**Branch:** `post-release/theme-system-v3`
**Approved commit:** `40079a8` (system-wide light+dark rollout)
**Deployed bundle source:** `5bb8879` — see provenance note in `THEME_PREVIEW_REPORT.md`
**Current HEAD:** `21f2344` (adds e2e-only live-spec fixes; identical built bundle)
**Preview:** https://6a68bf57ff47bd08859830c4--teragon-os-demo.netlify.app

---

## 1. Pre-preview gate (local, at deployed source `5bb8879`)

| Gate | Requirement | Result |
|------|-------------|--------|
| oxlint | 0 errors / 0 warnings | **0 / 0** ✓ |
| TypeScript (`tsc -b --noEmit`) | 0 errors | **0** ✓ |
| `typecheck:tests` | 0 errors | **0** ✓ |
| Vitest | ≥ 1706 passing | **1706 / 1706** (187 files) ✓ |
| Full existing E2E suite (non-live) | all passing | **all passing** ✓ |
| Production build | pass | **pass** (Netlify build 46.9 s) ✓ |
| Secret scanner | CLEAN | **CLEAN — 0 findings** (728 screenshots checked) ✓ |
| Working tree | clean | **clean** (only generated preview artifacts committed) ✓ |

## 2. Full E2E suite — commands

The repository's complete existing E2E suite runs in two configured Playwright projects:

```bash
# Local gate (chromium 1920x1080, workers:1, webServer = vite preview :4173)
npx playwright test                      # root playwright.config.ts, testDir ./e2e

# Post-deploy live validation (no webServer; runs against the deployed CDN)
LIVE_URL="https://6a68bf57ff47bd08859830c4--teragon-os-demo.netlify.app" \
  npx playwright test -c e2e/live.config.ts
```

Neither run excluded any spec, raised any timeout to hide a regression, nor skipped a
failing test. Every failure below was root-caused and fixed, and the complete suite was
re-run after each fix.

## 3. Local E2E — defects found and fixed (44 total)

The Visual-Calm UI restructures and the light-theme rollout had left **44** specs asserting
the *old* DOM. Categorised and fixed (committed `5fa328e`):

| Group | Count | Nature | Fix |
|-------|------:|--------|-----|
| Administration | 2 | Row actions moved into a collapsed `<details>` menu | Open the `user-actions-*` summary before clicking |
| Analytics | ~8 | Group `<select>` replaced by segmented `role="tab"` GroupNav; a KPI moved into a disclosure | Click the group tab; wait on a stable primary KPI; open `.os-more-metrics` |
| Learning / Knowledge | ~4 | Metrics moved into disclosures; ContradictionPanel moved into a tab | Open disclosures / click the tab first |
| w9c golden-path / resilience | ~4 | New lead off page 1; VC collapses nav groups; hard-coded port | Filter by name; expand collapsed groups; `/\/$/` |
| a11y survey / focus | 1 | Active nav link's `box-shadow:none` overrode the global focus ring | Added `.os-nav__link:focus-visible` outline (CSS) |
| w8f-visual (capture-only) | ~18 | `prepare()` interactions hit the same restructured DOM | Same interaction fixes as above |
| **Real light-mode contrast defects** | — | Command palette, notifications, quick-create, presentation examiner and agent cards used **base** color tokens as text on light surfaces | Converted `color: var(--os-*)` → `-text` variants across `src/app/**`, `src/presentation/**`, `components.css` |

> The contrast items were **genuine product fixes** that commit `40079a8` lacked — the reason
> the deployed source is `5bb8879`, not `40079a8`.

## 4. Live E2E — post-deploy, against the preview

**First run:** 63 passed / **5 failed**. The 5 were **consistent** (not flaky) and all in
`live-routes.spec.ts`. Root-caused as **test-expectation defects**, not product defects
(the product was live-verified rendering correctly in both cases):

| # | Failing test | Root cause | Fix |
|---|--------------|-----------|-----|
| 30 | `live route /customers` | `awaitRouteRendered` asserted a visible `nav a[aria-current="page"]`, but `/customers` is **off-nav by design** (no nav link → no item can carry `aria-current`) | Gate that proof on a nav link for the route existing; off-nav routes rely on the strong `<main>` content check + `toHaveURL` |
| 35 | `live route /customers/cu-1` | same | same |
| 66 | `/customers/cu-1 via search + row click` | same | same |
| 64 | `in-app navigation 1/2` | Sweep clicked `nav a[href=/courses]`, hidden inside a **VC-collapsed** nav group | Expand collapsed groups before each click (same fix as `w9c-resilience`) |
| 65 | `in-app navigation 2/2` (`/learning`) | same | same |

**Product verification (live, before relaxing any assertion):**
- `/customers` → `<main>` 1016 chars, 15 table rows, not stuck loading, `data-theme=light`, `aria-current` links = 0, `/customers` nav link = 0 (proving the off-nav design).
- `/customers/cu-1` → customer 360 ("אבי לוטם · פעיל · cu-1 · בעלים: צחי זוסטייהם"), `customer-detail` present, not stuck.

Fixes committed `21f2344` (touch `e2e/live/` only — the built bundle is unchanged).

**Re-run against the same preview:** `live-routes.spec.ts` → **36 / 36**; complete live suite → **68 / 68 passed, 0 failed**.

## 5. Final counts

- Vitest: **1706 / 1706** (187 files)
- Local E2E: full suite green (0 non-live failures)
- Live E2E vs preview: **68 / 68 passed, 0 failed**
