# ADR 0004 — react-router RSC-CSRF advisory: narrow, time-boxed risk acceptance

**Status:** Accepted (temporary) · **Advisory:** GHSA-qwww-vcr4-c8h2 ·
**Decided:** 2026-08-03 · **Re-evaluate by:** 2026-11-03 (or sooner — see triggers)

## Advisory

`npm audit` reports one **production HIGH**:

> **React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response**
> `react-router` vulnerable range **7.12.0 – 8.2.0**
> https://github.com/advisories/GHSA-qwww-vcr4-c8h2

Installed: `react-router-dom@7.18.2` → `react-router@7.18.2` (the **only** direct
router dependency; single dependency path). The other two audit findings
(`brace-expansion` ×HIGH, `postcss` moderate) **drop out of `npm audit --omit=dev`**
— they are dev/build-only (`eslint`, `vite`) and are not shipped to production.

## Why no upgrade was applied

- `latest` dist-tag **is 7.18.2** — the version already installed. `npm outdated
  react-router-dom` returns **empty**. **No 8.x is published**, so the advisory's
  `8.2.0` upper bound is not an installable target.
- npm's only offered remedy is `npm audit fix --force` → **`react-router-dom@7.11.0`**,
  a **breaking downgrade** across 7 minor versions to the pre-RSC line. The task's
  rules forbid a blind downgrade / `--force` / `--legacy-peer-deps`, and it would
  discard 7 versions of unrelated fixes.

**Conclusion: no safe forward upgrade exists at this time.**

## Why the vulnerability is not reachable here (the basis for acceptance)

The advisory is specific to **RSC Mode** — React Router running with React Server
Components and **server-side actions**, where a CSRF check runs *after* the action
executes. That runtime does not exist in this application:

| Requirement of the exploit | This app | Evidence |
|---|---|---|
| RSC / framework mode | **No** | No `react-router/rsc`, no `unstable_RSC`, no `matchRSCServerRequest` in `src/` |
| Server-side router | **No** | Client only: `createBrowserRouter` + `RouterProvider` (`router.tsx:100`, `main.tsx:41`); **0** react-router imports under `netlify/` |
| Server actions (`use server`) | **No** | None. Every `action:` in `src/` is a domain-model field (audit/approval), not a route action |
| SSR / static handler | **No** | `netlify.toml`: `publish = "dist"` — static SPA; functions are `ai-*` proxies that do not import the router |

A statically-hosted Vite SPA has **no server executing router actions**, so the
"action execution before a 400 CSRF response" path has no runtime.

## Compensating controls (already in place)

- Static hosting only; no server-rendered router endpoint to attack.
- CSP with `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`
  (`netlify.toml`).
- Same-origin API surface (`connect-src 'self'`); the only backend is Supabase +
  first-party `ai-*` functions.

## Decision

**Accept the risk temporarily.** Do **not** downgrade, `--force`, or change the
lockfile. This ADR is the disposition; no code or dependency change is made.

## Expiry and re-evaluation triggers — re-assess when ANY occurs

1. **2026-11-03** (90-day box), whichever is first.
2. A **patched forward version** is published (`npm outdated react-router-dom`
   shows a fix ≥ current, outside `7.12.0–8.2.0`) → upgrade instead of renew.
3. The app adopts **any** SSR / RSC / server-action / framework-mode routing —
   at which point this acceptance is **void** and the advisory becomes live.

If none of (2)/(3) occur by (1), re-verify unreachability and renew explicitly.

## Residual production audit state

After this disposition, the **only** production HIGH is this router advisory,
accepted above. No other high/critical production dependency remains.
