# TERAGON AI BUSINESS OS — Visual Comfort Correction Report

The approved, limited corrections from the Visual Comfort & Density audit (verdict: PASS WITH CORRECTIONS),
applied as isolated commits. No broad redesign; Light default + Dark optional preserved; graph/auth flags
OFF; `AI_REMOTE_ENABLED=false`.

## Accepted findings & disposition

| Finding | Disposition |
|---------|-------------|
| **Google Fonts** (audit S-5 / informational) | Corrected — the app never actually requested Google Fonts; the **CSP allow-list** permitted `fonts.googleapis.com`/`fonts.gstatic.com` unused. Removed those origins; the app uses only the system Hebrew stack. |
| **V-2 Governance density** (LOW) | Corrected — auditor rail collapsed into a disclosure; boundaries grid made calmer + responsive. |
| **V-1 Mobile overflow** (MEDIUM) | Accepted as a **documented known limitation**; supported viewport is **≥1024px**; mobile redesign deferred (no mobile work this release). |

## Changes applied

### 1. Remove external font dependency — `fix(ui): remove external font dependency` (`3ca7425`)
- **`netlify.toml`** — CSP tightened: `style-src 'self' 'unsafe-inline'` (dropped `https://fonts.googleapis.com`),
  `font-src 'self'` (dropped `https://fonts.gstatic.com`); corrected the stale comment that wrongly claimed
  index.html loaded Google Fonts.
- **`src/modules/quotations/printView.ts`** — print `font-family` aligned to the system stack (`"Segoe UI",
  "Arial Hebrew", Arial`; removed the never-fetched `"Heebo"/"Assistant"` names).
- The token stack was already system-only: `--os-font: "Segoe UI", "Arial Hebrew", Arial, sans-serif`
  (`src/styles/tokens.css`); no `@font-face`/`@import`/font `<link>`/preconnect anywhere; no bundled fonts.

### 2. Reduce Governance initial-view density — `fix(ui): reduce governance initial-view density` (`15ec2b2`)
- **`src/modules/governance/GovernancePage.tsx`** — the auditor rail "מבקר הממשל" per-finding list (severity,
  title, detail, evidence + prompt-version refs) is wrapped in a native `<details data-testid=
  "governance-auditor-details">` **collapsed by default**, reusing the existing `os-more-metrics` disclosure;
  an always-visible summary shows the open-findings count; the empty state stays visible. **All findings +
  refs preserved.**
- **`src/styles/components.css`** — the "גבולות אדם-AI" grid uses a new `.gov-boundaries-grid`: **4 cols wide
  → 2 cols ≤1280px (so 1024 renders a calm 2-col) → 1 col ≤640px**, `minmax(0,1fr)` (no overflow, no clipped
  Hebrew); lighter column headers (600→500) + more whitespace. Hierarchy/spacing only — no borders, glow,
  gradient, or color.
- **`tests/governance/page.test.tsx`** — asserts the auditor disclosure is a `<details>` **collapsed by
  default**, expandable, with all prior findings + both refs still present, and all four boundary category
  headings render. (+6 governance tests.)

## Before / after metrics (Governance)

| Aspect | Before | After |
|--------|--------|-------|
| Auditor rail in initial viewport | Full dense findings list (severity + title + detail + refs, per finding) competing with the workspace | **Collapsed** to a one-line summary ("N ממצאים פתוחים…"); details on demand |
| Competing focal areas | Auditor rail **+** policies table **+** 4-col boundaries grid | Policies table dominant; auditor collapsed; boundaries de-weighted below the fold |
| "גבולות אדם" columns @1024 | 3–4 cramped equal-weight columns | **2 calm columns** (responsive), lighter headers |
| Column-header weight | 600 | 500 |
| Horizontal overflow @1024/1440/1920/2560 | none (was already ok at desktop) | **none** (re-verified L+D) |
| Route verdict | ACCEPTABLE | **CALM-leaning / ACCEPTABLE** |
| KPI count / primary content | 4 KPIs, policies table, boundaries | unchanged — **nothing removed** |

## Screenshot references

- **Correction proof:** `docs/screenshots/visual-comfort-proof/corrections/governance/{light,dark}-{2560x1440,1920x1080,1440x900,1024x768}.png` (8) + `command-center/{light,dark}-1920x1080.png` (2) + `metrics.json`.
- **Command Center regression:** the two CC captures confirm the flagship is **unchanged** (Governance was
  the only route touched — verified by change scope).
- **Before baseline:** the full 180-shot audit proof committed at `d59a769`
  (`docs/screenshots/visual-comfort-proof/{light,dark}-*/governance.png`).

## Typography / network verification

- **No external font request** — `e2e/no-external-fonts.spec.ts`: zero requests to `fonts.googleapis.com` /
  `fonts.gstatic.com` on load; computed `font-family` resolves to the system stack (contains "Segoe UI"/
  "Arial", excludes Heebo/Assistant); Light default + Dark first paint correct.
- **Static guard** — `tests/no-external-fonts.test.ts`: CSP has no google origins; `--os-font` is the system
  stack; `index.html` has no font CDN; print stack is system.
- **No typography regression / layout shift** — the app already rendered with the system stack; Hebrew
  remains readable in Light and Dark; print stays Light.

## Deferred mobile limitation

Supported release viewport: **1024px and above** (desktop + tablet, the intended internal enterprise
experience). **390px mobile layouts currently overflow horizontally on every route** — documented in
`docs/RELEASE_SCOPE.md`; **mobile redesign deferred**; the app is not described as fully mobile-responsive.

## Final visual verdict

**PASS** — external font dependency removed (CSP hardened, no network font request), Governance initial-view
density reduced (auditor collapsed, boundaries calmer/responsive, nothing removed), Command Center unchanged
(still CALM), Light & Dark both PASS, zero horizontal overflow at all supported widths (≥1024). Mobile
(<1024) is an accepted, documented known limitation.
