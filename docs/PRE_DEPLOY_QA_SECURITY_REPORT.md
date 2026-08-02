# TERAGON AI BUSINESS OS — Pre-Deploy QA & Security Report (Gate 1)

Read-only pre-deploy audit at **HEAD `0a22f10`** (release classification: **Demo / Internal Preview**).
No code, dependencies, tests, config, or remote resources were modified. `npm audit` was run;
`npm audit fix` was **not**.

## A. Security findings

| ID | Sev | Category | File / line | Evidence | Risk | Correction | Release blocker | Supabase blocker |
|----|-----|----------|-------------|----------|------|------------|:---:|:---:|
| S-1 | HIGH | dependency vuln | `package-lock.json` (react-router 7.12–8.2) | `npm audit`: GHSA-qwww-vcr4-c8h2 "RSC Mode CSRF Bypass" | The vulnerable path is React Router **RSC / framework-mode server actions**. This app is a **Vite SPA using `createBrowserRouter` client-side routing only** — no RSC, no framework mode, no server actions — so the vulnerable code path is **not reachable**. Real-world risk: LOW. | Bump `react-router-dom` to a patched release in Gate 2 (verify it's not a functional downgrade). | **No** (path unused; demo/internal) | No |
| S-2 | LOW | CSP | `netlify.toml` (`style-src 'unsafe-inline'`) | CSP header | Required for dynamic inline `style={{…}}` (65 components) + the print view; **`script-src` stays `'self'`**, so the XSS-critical vector is closed. Documented with a remediation path. | Optional future: move dynamic styles to CSS custom properties. | No | No |
| S-3 | LOW | XSS (print) | `src/modules/quotations/printView.ts:101` | `win.document.write(html)` | Writes to a **new print window**; the file states every interpolated field passes `escapeHtml` (self-XSS mitigated). | Gate-2/later: confirm `escapeHtml` covers all interpolations; consider DOM APIs over `document.write`. | No | No |
| S-4 | LOW | rate limiting | `src/server/rateLimit.ts` | `SlidingWindowRateLimiter` is in-memory **per function instance** (documented caveat) | Adequate for per-instance burst protection; not a strict global limit. Only matters once costly/auth endpoints exist (Phase 11.1). | Durable store (Netlify Blobs/Redis) when auth/costly endpoints ship. | No | No (future auth concern) |
| S-5 | LOW/info | third-party origin | `netlify.toml` CSP (`fonts.googleapis.com`/`gstatic.com`) | CSP allow-list | `index.html` loads Google Fonts; CSP scopes it tightly (`style-src`/`font-src` only). No script/data exfil vector. | Informational; self-host fonts if a zero-third-party posture is desired. | No | No |

**Security positives verified (no finding):** no secrets/tokens in source, git history, or the built
bundle (`dist/assets/*.js` scanned — none); `.env`/`.env.*` gitignored (`!.env.example`), `.env` never
tracked; only `VITE_APP_VERSION`/`VITE_BUILD_COMMIT` are browser-exposed (public build metadata) — no
privileged VITE_* value; server secrets are Functions-only (`.env.example` documents "never VITE_");
CORS is **deny-by-default** (`isAllowedOrigin`: same-origin or explicit dev origins only, no wildcard); no
`dangerouslySetInnerHTML`/`insertAdjacentHTML` anywhere; **no direct browser→paid-API calls** (`RemoteAIProvider`
is gated by `AI_REMOTE_ENABLED=false` and routes same-origin `/.netlify/functions/*`, which proxy providers
server-side); strong headers (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy,
`script-src 'self'`, `connect-src 'self'`, `object-src/frame-ancestors 'none'`); localStorage holds only
UI shell state, theme preference, the demo-role selector, and local copilot demo messages — **no tokens,
credentials, or secrets**. **Authentication/authorization claim check:** the app has **no production auth**
(demo role simulation); this is honestly classified Demo/Internal and the operator-auth prototype (`3c78640`)
is disabled — no over-claim in the shipped scope.

## B. Functional QA

Covered by the Gate-1 read audit + the accepted self-audit's Playwright chunks (all green at code-identical
`3c78640`): every primary route renders with zero console errors; Light/Dark themes; RTL; a11y (axe survey +
reduced-motion); deep-link/refresh; visual regression; golden-path + resilience + deep-flows. Loading/error/
empty/"טרם נמדד"/duplicate-prevention states are honest by design. Cross-browser: Playwright config is
Chromium-primary on this host.

### The `w7g-submission` race — conclusion (no change applied, per Gate 1)

**Root cause:** in `e2e/submission/w7g-submission.spec.ts` the blocker **counts** settle behind a `.toPass`
retry (lines 58–65), but the readiness **chip** assertion (lines 67–77) reads **once, outside any retry**.
Under heavy concurrent load the chip is briefly `"מוכנות להגשה: בהכנה"` ("in preparation") while counts have
already settled to `blockers>0`, so the single-shot `toContain("לא מוכן להגשה")` fails.

**Determination:**
- **The product is correct.** While blockers exist the chip is **never** the green `"מוכן להגשה"`; `"בהכנה"`
  is a legitimate intermediate/settling non-green state.
- **The test reads during a legitimate intermediate state**, *and* asserts too specific a label.
- **The expected invariant should be NON-GREEN-STATE**, not the exact `"לא מוכן להגשה"` — matching the test's
  own title ("readiness is NEVER green while blockers exist"); the `else` branch already encodes the correct
  non-green invariant.

**Recommended Gate-2 fix (test-only):** wrap the readiness assertion in the existing `.toPass` retry **and**
assert "not the green state" (never `"מוכנות להגשה: מוכן להגשה"`) rather than a specific non-green label — no
sleeps, no timeout inflation, no product change. Finding **Q-1, LOW, release-blocker: No.**

## D. Release-lineage audit (`38cfbaa..0a22f10`, 18 commits)

- **All 18 commits intentional** — the Business Graph phase lineage + one product fix (`a96fc4a`) + docs
  (`bbb3f4b`, `0a22f10`). Enumerated in `docs/RELEASE_SCOPE.md`.
- **Dormant graph introduces no runtime import** — verified: no non-`src/graph` import of
  `graph/{application,query,runtime,auth}`; the subsystem is tree-shaken out of the shipped bundle.
- **Dependency / package-lock changes: NONE** — `git diff 38cfbaa..0a22f10 -- package.json package-lock.json`
  is empty. The graph added zero dependencies (uses existing `zod`/`idb`). No justification needed.
- **No WIP / stash content included** — Phase-11.1 lives only in `stash@{0}` (excluded, untouched).
- **Docs contain no credentials** — `.env.example` is names-only; report/scope docs carry no secret values.
- **Source ↔ bundle correspond to HEAD** — `0a22f10` is code-identical to the self-audited `3c78640` (only
  docs differ); build + secret scan reproduce clean.
- **Rollback to `38cfbaa` is technically safe** — a linear ancestor; the local-first IndexedDB data model is
  unchanged by the release, so no schema/data migration is involved in reverting.

## Totals & verdict

- **Findings by severity:** BLOCKER 0 · HIGH 1 (S-1, unused path) · MEDIUM 0 · LOW 5 (S-2, S-3, S-4, S-5, Q-1).
- **Netlify deploy readiness (Demo/Internal Preview):** **READY** — `NETLIFY_AUTH_TOKEN` set, site linked
  (`b8b2f3c5…`), build clean, bundle secret-free, flags OFF, `AI_REMOTE_ENABLED=false`. Suitable for a Draft
  Preview of the local-first demo build.
- **Supabase migration readiness:** **NOT READY** — see `docs/SUPABASE_DEPLOYMENT_READINESS_REPORT.md`
  (greenfield backend + absent credentials + single-tenant schema).
- **Automated staging deployment currently possible?** **No** — the Netlify demo preview is possible, but the
  *Supabase* half is blocked (no project, no migrations/RLS/adapter/auth, and required credentials unset).
- **Missing human credentials/authorizations (names only):** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`,
  `SUPABASE_DB_PASSWORD`, `TERAGON_ADMIN_EMAIL`, `TERAGON_ADMIN_PASSWORD` (optional: `SUPABASE_PROJECT_REF`,
  `SUPABASE_REGION`, `NETLIFY_SITE_ID`). (`NETLIFY_AUTH_TOKEN` is present.)
- **Recommended Gate-2 correction order:** (1) Q-1 test-only stabilization; (2) S-1 react-router patch bump
  (+ verify build/tests); (3) optional S-3 print-view escaping verification. S-2/S-4/S-5 are accepted LOW /
  future.
- **Verdict (Demo/Internal Preview release): PASS WITH LIMITATIONS.** Zero blockers; one HIGH advisory whose
  path is unused in this SPA; LOW test/CSP/print/rate-limit items. The release is a **local-first demo**, not
  authenticated production; the Supabase production track is separately **not yet possible** (Gate-1 §C).

Stop after Gate 1. No code, dependency, test, configuration, or remote change was made.
