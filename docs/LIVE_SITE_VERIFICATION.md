# LIVE SITE VERIFICATION — Phase 10.2 (W9-F)

Verification of the **already-deployed** Netlify Deploy Preview, performed over the
public network with a real browser (Playwright / Chromium). No build, no serve,
no `netlify` command was run by this verification — deploys stay operator-gated.

| Field | Value |
|---|---|
| Target URL | `https://6a62adca1eee4c6ed026e8c7--teragon-os-demo.netlify.app` |
| Deploy id | `6a62adca1eee4c6ed026e8c7` |
| Site | `teragon-os-demo` (Netlify Deploy Preview) |
| Repo commit under test | `14d3cd6442eb0be16c3ac4e40ab1c3609b699898` (`14d3cd6`) |
| Tag | `teragon-os-demo-v1.0.1` (annotated `ec8057c` → `14d3cd6`) |
| Build metadata reported BY the live app | version `1.0.0-demo`, commit `66a04777eb1e` — **mismatch, see DEF-1** |
| Suite | `e2e/live/**` driven by `e2e/live.config.ts` (no `webServer`, `baseURL` = `LIVE_URL`) |
| Command | `npx playwright test -c e2e/live.config.ts` |
| Final result | **68 / 68 passed, 0 failed, 0 retries** (exit 0, 3.5 min, 2 workers) |
| Date of run | 2026-07-24 |
| Verifier | W9-F (live deployment verification) |

Re-point the suite at any other deploy (e.g. the production domain) with
`LIVE_URL=https://… npx playwright test -c e2e/live.config.ts`.

---

## VERDICT

> ## PREVIEW READY FOR PRODUCTION
>
> All 31 routes, all Netlify Functions, all security headers, the app's live
> behaviour and the accessibility smoke pass against the deployed preview.
> **Zero blocking defects.** One non-blocking build-provenance defect (**DEF-1**)
> and two documented observations (**OBS-1**, **OBS-2**) are recorded below.
>
> **Required before promoting to a production domain:** rebuild + redeploy from
> the tagged commit so the in-app build stamp names the released commit
> (DEF-1). Nothing else is outstanding.

---

## 1. All 31 routes — navigation, direct URL, refresh, back — **PASS**

Every canonical route from `src/app/routes.ts` was exercised in four access
modes against the live CDN.

| Mode | How it was verified | Result |
|---|---|---|
| Direct URL | `page.goto(<deep link>)` — proves the Netlify SPA `/*` → `/index.html` 200 rewrite | PASS 31/31 |
| Browser refresh | `page.reload()` on the deep link | PASS 31/31 |
| Browser back | navigate away → `page.goBack()` onto the route | PASS 31/31 |
| In-app navigation | real click on the shell nav link (client-side router transition, CDN chunk fetch) | PASS 31/31 |

**"Real content, not a blank shell"** is asserted three ways per route, not one:

1. the shell nav renders and no `.os-route-loading` Suspense fallback is stuck;
2. **the router actually resolved this route** — a nav link carries
   `aria-current="page"` (`OsShell.tsx` sets it only on the active item);
3. the route's own `<main>` region holds > 150 chars of rendered text, and
   `document.body` holds > 400 chars.

> We deliberately do **not** assert the `routes.ts` `title` string as on-screen
> copy. Those titles are the canonical router/nav labels; several screens
> legitimately render a different H1 (`/crm` → "ניהול לקוחות ולידים" without the
> "(CRM)" suffix, `/sales` → "מסע הלקוח במכירה", `/customers/:id` → the
> customer's name). Asserting the router label as page text would have been a
> false contract.

**Console + network per route:** zero console errors, zero uncaught page errors,
zero failed REQUIRED requests, zero REQUIRED responses ≥ 400, on every route in
every mode. Full per-route observations are attached to each test as
`live-observations` JSON (nothing is filtered silently).

### Fonts are classified NON-REQUIRED — and they loaded anyway

`index.html` loads Heebo/Assistant from `fonts.googleapis.com` /
`fonts.gstatic.com`. Those are third-party and genuinely optional (the app
declares a full local fallback stack), so the suite classifies font traffic as
**non-required**: a slow, rate-limited, geo-blocked or offline Google Fonts host
would degrade typography only, never a screen. This is stated so it is not read
as a hidden filter.

**Measured on this deploy: the font requests did NOT fail.** Google Fonts
returned 200 on every observed load; the non-required bucket stayed empty
throughout. The CSP explicitly permits them
(`style-src … https://fonts.googleapis.com`, `font-src … https://fonts.gstatic.com`),
so **fonts are not blocked by the CSP**.

### Off-nav routes (by design) — covered explicitly

`/customers` and `/customers/:id` are deliberately absent from the shell nav
(`src/app/nav/navGroups.ts`). Their real in-app entry points on the deployed
build were verified individually:

- `/customers/cu-1` — cross-module **global search** hit → customer card
  (client-side), and the `/customers` **table row click** → customer card. Both PASS.
- `/customers` — the **Ctrl+K quick-create "לקוח חדש"** flow, whose success
  destination is `/customers` (`QuickCreateHost.tsx`). PASS.
- `/submission/presentation` — the in-app link on `/settings` → הדגמה group. PASS.

> **OBS-1 (non-blocking).** `navGroups.ts` states `/customers` is "reachable from
> the `/crm` screen"; on the deployed build `/crm` links only to *individual*
> customer cards (`onRowClick → /customers/:id`), never to the customer **list**.
> The list is reachable in-app only as the quick-create destination, or by direct
> URL. The comment is stale; navigation itself works. Cosmetic/doc-level.

### Cold-start latency

The CDN-served HTML and `/assets/*` chunks were consistently fast (sub-second
first byte on repeat loads). No cold-start stall was observed on the static
side. Netlify Function cold start is covered in §2.

---

## 2. Netlify Functions over the live URL — **PASS**

All three read endpoints answer 200 with the honest Mode-A contract, and the
error path is structured. Verbatim live responses:

### `GET /.netlify/functions/ai-health` → `200`

```json
{"dtoVersion":"v1","health":{"state":"מושבת","checkedAt":"2026-07-24T00:14:48.204Z","detail":"AI מרוחק מושבת (AI_REMOTE_ENABLED=false). המערכת פועלת במצב מקומי בלבד."},"model":null}
```

- `health.state` = **`"מושבת"`** ∈ {`מושבת`, `לא הוגדר`} — **never `"מחובר"`**. PASS
- `model` is `null` — no model advertised while remote is off. PASS

### `GET /.netlify/functions/ai-capabilities` → `200`

```json
{"dtoVersion":"v1","capabilities":{"operations":[],"streaming":false,"structuredOutput":false,"maxInputChars":120000,"detail":"ספק ה-AI המרוחק אינו מוגדר/מופעל — אין פעולות מרוחקות זמינות."}}
```

- `operations` is `[]`, `streaming`/`structuredOutput` are `false` — no fabricated
  remote capability. PASS

### `GET /.netlify/functions/ai-config` → `200`

```json
{"remoteEnabled":false,"providerState":"מושבת"}
```

- **`remoteEnabled === false`**. PASS

### `POST /.netlify/functions/ai-summarize` with garbage body → `400`

Request: `Content-Type: application/json`, body `not-json-at-all{{{`

```json
{"dtoVersion":"v1","error":{"code":"AI_RESPONSE_INVALID","messageHe":"תשובת הספק לא עמדה במבנה החוזה ולכן נדחתה. לא הוצג תוכן שגוי.","correlationId":"srv-4253d7e6-a4f7-4491-8d88-1ab2dcd0d296","recoverable":false}}
```

- Structured Hebrew error with `code` + `correlationId` + `recoverable`. PASS
- **No stack trace, no internal path, no `ERR_MODULE_NOT_FOUND`, no secret.**
  The response body is scanned against stack-frame patterns
  (`\n at `, `file.ts:LINE:COL`, `node:internal`, `/var/task/`) and secret
  patterns (`sk-…`, `AKIA…`, JWT, `Bearer …`, `*_API_KEY`). PASS
- Status is a handled `4xx`, never a raw `5xx` crash. PASS

A **well-formed** `ai-summarize` POST was also sent: it likewise never claims a
remote summary and never returns `5xx`. PASS

### Function response headers

`Cache-Control: no-store` · `Content-Type: application/json; charset=utf-8` ·
`X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin`.
PASS

> This closes the release-blocking defect fixed in `14d3cd6`: in the *previous*
> preview all 9 AI functions failed with `ERR_MODULE_NOT_FOUND` (unresolved `@/`
> alias). On this deploy they resolve and answer honestly. Verified live.

**Function cold start:** the first invocation of `ai-health` after an idle period
measured ~1.0 s (the `/system-health` panel recorded `1031ms` against the remote
provider probe); warm invocations returned in ~250 ms. This is normal Netlify
Functions cold-start behaviour and is not a defect.

---

## 3. Security headers on the LIVE URL — **PASS**

Asserted against the wire, not against `netlify.toml`. Verbatim live values on
`GET /`:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cache-Control: public,max-age=0,must-revalidate
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Robots-Tag: noindex
Server: Netlify
```

- **CSP matches the declared policy byte-for-byte.** PASS
- The identical header set is served on rewritten deep routes — verified on
  `/governance`, `/analytics`, `/system-health`, `/submission/presentation`
  (all `200 text/html`). PASS
- `Strict-Transport-Security` and `X-Robots-Tag: noindex` are added by Netlify;
  `noindex` is correct preview hygiene.

### `/assets/*` immutable cache — PASS

`GET /assets/index-BYfHwLyo.js` (the real hashed entry chunk discovered from the
deployed `index.html`):

```
Cache-Control: public,max-age=31536000,immutable
Content-Type: application/javascript; charset=UTF-8
X-Content-Type-Options: nosniff
Content-Security-Policy: <same policy as above>
```

The hashed CSS bundle carries the same immutable cache header. PASS

### CSP violations in the console — **PASS (one documented benign report)**

Captured two ways on `/`, `/governance` and `/analytics`: Chromium console
errors (`Refused to …`) **and** the DOM `securitypolicyviolation` event.

- **Unexpected violations: ZERO** on all three pages. PASS
- **Console errors: ZERO** on all three pages. PASS

> **OBS-2 (documented, non-blocking).** One `securitypolicyviolation` event fires
> per bundle load:
>
> ```
> script-src blocked eval
> source: /assets/schemas-sSFEhF9a.js
> ```
>
> **Root cause (identified, not guessed):** Zod v4 (`^4.4.3`) feature-detects its
> JIT-compiled validator path with a guarded probe —
> `try { return Function(""), true } catch { return false }`. Our CSP is
> `script-src 'self'` with **no `'unsafe-eval'`** (deliberately), so the browser
> refuses the `Function()` constructor. Zod catches its own refusal and falls
> back to the interpreted validator.
>
> **Impact: none.** Measured on the live deploy:
> - Chromium emits **no console error** for it — a full page load produces zero
>   console messages of any type, so the "zero console errors" contract holds.
> - Validation still works. Test **LB-9** proves it on the deployed bundle: an
>   empty quick-create submit still raises "שם הליד הוא שדה חובה", and a valid
>   submit still persists and is findable in global search.
>
> This is the CSP doing exactly its job against a library probe. It is
> allow-listed **narrowly** (`script-src` + `blocked eval` only) in
> `isKnownBenignCsp()`; any other violation — a blocked script, style, image,
> font or connection — still fails the gate. Optional future cleanup: set Zod's
> `jitless` option to skip the probe entirely.

---

## 4. App behaviour on the live deploy — **PASS**

| ID | Check | Result | Evidence |
|---|---|---|---|
| LB-1 | IndexedDB startup + deterministic seed | **PASS** | `teragon-os` DB opens in the browser; `customers`/`leads`/`opportunities` stores all hold > 0 records; the CRM table renders seeded rows; counts stable across a reload (`seedIfEmpty`, no re-seed churn). `/system-health` independently reports "גרסת סכימה 6 · 104 object stores · customers: 15 · auditEvents: 15". |
| LB-2 | Reset + evaluator demo mode | **PASS** | `/settings` → הדגמה: reset opens the typed double-confirm; "איפוס עכשיו" stays **disabled** for a wrong word and only enables on exact `אפס`; cancelling closes with no wipe. `/submission/presentation` → "מצב הדגמה לבוחן": the 11-step list renders, "הפעלת מצב הדגמה" activates and surfaces "…חסומה כדי לשמור על נתוני הדגמה דטרמיניסטיים", and deactivation works. |
| LB-3 | Global search returns real hits | **PASS** | Query `Bambu` → ranked cross-module hits (customer / lead / service call), result set genuinely contains the term; query `אבי לוטם` → the exact customer record as the first hit. |
| LB-4 | CSV export downloads with real rows | **PASS** | `/analytics` → דוחות → "הפקת דוח מנתוני אמת" → run drawer → **CSV**: real browser download event, filename `report-*.csv`, file read back from disk with a header **plus real data rows**, secret-scanned clean, and no seed e-mail addresses present. |
| LB-4 | A print view renders | **PASS** | "הדפסה / שמירה כ-PDF" mounts the A4 `.an-print-root` and calls `window.print()` (stubbed so no OS dialog blocks). **No CSP violation from the inline print `<style>`** — `style-src 'unsafe-inline'` covers it as designed. |
| LB-5 | Markdown export downloads | **PASS** | `/memory` → "ייצוא כספת מלאה": real download `teragon-memory-YYYY-MM-DD.zip`, ZIP magic `PK` verified on disk, archive entries are **`.md` Markdown notes** (the panel is titled "ייצוא ל-Markdown / ZIP" — vault scope emits an archive of Markdown files; a single-record scope would emit a bare `.md`). Manifest shows item count, `sha-256:` and "מצב הורדה: הורד". |
| LB-6 | Presentation opens + timer runs | **PASS** | `/submission/presentation` → "התחל": present mode mounts, countdown starts at `10:00` and **ticks down**, section timer shows `/ 2:00`, `T` pauses (button flips to "המשך טיימר" and the countdown is frozen across a 1.8 s wait). |
| LB-7 | Copilot answers in local Mode A | **PASS** | Copilot opened from the shell on `/crm` (proving the app-wide mount); local command returns an envelope whose provider badge reads **"מנוע מקומי מבוסס כללים"** with `data-provider="local-rules"`, and **no** fabricated fallback notice. |
| LB-8 | `/system-health` honest states | **PASS** | See the verbatim live reading below. |
| LB-9 | Zod validation under the live CSP | **PASS** | Guard behind OBS-2 — see §3. |

### LB-8 — what `/system-health` actually says on the live deploy

Run of "הרצת בדיקת בריאות מקומית" on the live URL, verbatim highlights:

```
תקינים (נמדדו) 13 · דורשים תשומת לב 1 · לא זמינים 0 · טרם נבדקו / לא נמדדים 1

מסד הנתונים המקומי (IndexedDB)  תקין      5ms    גרסת סכימה 6 · 104 object stores · customers: 15 · auditEvents: 15 · healthSnapshots: 0 · meta: 2
שכבת ה-Repositories             תקין      7ms    סבב CRUD מלא עבר על אוסף meta
מיגרציות סכימה                  תקין      0ms    schemaVersion 7 · כל 7 המיגרציות הרשומות הוחלו
מנוע ה-AI המקומי (כללים)        תקין      1ms    פעולת summarize רצה בהצלחה · סטטוס מעטפת: הצלחה · 8 ראיות
ספק ה-AI המרוחק                 לא הוגדר  1031ms  מצב שרת: «מושבת» · AI מרוחק מושבת (AI_REMOTE_ENABLED=false)
פונקציות השרת (Netlify)         תקין      246ms   הפונקציה ai-health הגיבה בסטטוס 200
מנגנון האישורים                 תקין      1ms    2 אישורים ממתינים להחלטה
יומן הביקורת (Audit)            תקין      1ms    auditEvents: 15
הזיכרון הארגוני                 תקין      1ms    memoryRecords: 5
מאגר הידע                       תקין      1ms    knowledgeArticles: 0 · knowledgeNotes: 5
תורי הסוכנים                    מוגבל     1ms    2 משימות בתורים (2 סוכנים) · 2 חסומות בהמתנה לאישור
ריצות אוטומציה                  תקין      0ms    3 ריצות · 0 פתוחות · 0 נכשלו
אינדקס החיפוש                   תקין      2ms    שאילתת העשן «טרגון» החזירה 0 תוצאות, דטרמיניסטית
מנוע הייצוא                     תקין      3ms    השמטת סודות פעילה
אומדן שטח אחסון                 תקין      2ms    בשימוש: 0.2MB · מכסה: 3072.2MB

מידע Build: מצב production · גרסה 1.0.0-demo · קומיט 66a04777eb1e
```

Honest-state assessment:

- **The remote AI provider is `לא הוגדר`, never `מחובר`.** The page text was also
  regex-asserted so no phrasing attributes "מחובר" to remote AI. PASS
- **`פונקציות השרת (Netlify)` is now `תקין` — "הפונקציה ai-health הגיבה בסטטוס 200".**
  This is the expected *difference* from the local vite preview, where the same
  probe honestly reports `לא זמין` because no functions are served there. The
  live suite asserts the row does **not** read `לא זמין`. PASS
- `תורי הסוכנים` reports **`מוגבל`** (2 queues blocked awaiting approval) rather
  than a fake green — the honest-envelope contract is intact on the live build.
- Nothing is pre-greened: 1 component still sits in "טרם נבדקו / לא נמדדים".

---

## 5. Accessibility (axe) smoke on the live preview — **PASS**

`@axe-core/playwright`, default rule set, **zero-baseline** contract: no serious
or critical violation is tolerated. Overlay entrance animations are settled and
webfonts allowed to land first, so contrast is measured against the final
rendered typography.

| Route | serious/critical |
|---|---|
| `/` | **0** — PASS |
| `/crm` | **0** — PASS |
| `/agents` | **0** — PASS |
| `/governance` | **0** — PASS |
| `/system-health` | **0** — PASS |
| `/submission` | **0** — PASS |

No accessibility fixes were made — this task is verification only, and the code
is tagged. Nothing needed fixing: the live result matches the pre-deploy gate in
`docs/FINAL_ACCESSIBILITY_REPORT.md`.

---

## 6. Screenshots — **PASS (24/24 captured)**

`docs/screenshots/final-live/` — 8 screens × 3 resolutions, all non-empty.
These are **evidence, not visual-regression baselines**: no pixel comparison is
performed, so a font-render difference can never fail the release gate.

| Screen | 1920×1080 | 2560×1440 | 3840×2160 |
|---|---|---|---|
| `/` | `home-1920x1080.png` | `home-2560x1440.png` | `home-3840x2160.png` |
| `/crm` | `crm-1920x1080.png` | `crm-2560x1440.png` | `crm-3840x2160.png` |
| `/agents/collaboration` | `agents-collaboration-1920x1080.png` | `agents-collaboration-2560x1440.png` | `agents-collaboration-3840x2160.png` |
| `/analytics` | `analytics-1920x1080.png` | `analytics-2560x1440.png` | `analytics-3840x2160.png` |
| `/governance` | `governance-1920x1080.png` | `governance-2560x1440.png` | `governance-3840x2160.png` |
| `/system-health` | `system-health-1920x1080.png` | `system-health-2560x1440.png` | `system-health-3840x2160.png` |
| `/submission` | `submission-1920x1080.png` | `submission-2560x1440.png` | `submission-3840x2160.png` |
| `/submission/presentation` | `submission-presentation-1920x1080.png` | `submission-presentation-2560x1440.png` | `submission-presentation-3840x2160.png` |

A completeness test asserts all 24 files exist on disk and each exceeds 5 KB.
Console errors and CSP violations are also asserted during every capture pass.

---

## Defects and observations

### DEF-1 — build-provenance stamp names the WRONG commit (non-blocking, must fix on next build)

**What.** The deployed app reports `קומיט: 66a04777eb1e` on `/system-health` (and
`/settings`). `66a0477` is the **parent** commit — the `teragon-os-demo-v1.0.0`
release. The deploy under verification is `14d3cd6` / `teragon-os-demo-v1.0.1`.

**Root cause (confirmed, not guessed).**

- `vite.config.ts` resolves the stamp as
  `VITE_BUILD_COMMIT` → `COMMIT_REF` → `git rev-parse --short=12 HEAD`.
  Neither env var is set locally.
- Local `dist/index.html` was written at **03:12**; commit `14d3cd6` was authored
  at **03:13:55**. The bundle was therefore built from the working tree while
  `HEAD` was still `66a0477`, i.e. **before** the fix was committed.
- The `tsconfig` path fix was present in the working tree at build time, so the
  **functions** carry the fix (proved live in §2) — only the **frontend commit
  string** is stale.
- Confirmation that the deployed frontend is this exact bundle: the live
  `index.html` entry chunk is `/assets/index-BYfHwLyo.js`, identical to local
  `dist/index.html`, and the local bundle contains the literal `66a04777eb1e`.

**Impact.** No functional impact. It is a **traceability/honesty** defect: for a
system whose thesis is "every state comes from a real measurement", an evaluator
reading the build panel would be told the wrong release is deployed.

**Fix (for the Lead).** Rebuild at the tagged commit and redeploy, or pass the
stamp explicitly:

```
VITE_BUILD_COMMIT=14d3cd6442eb VITE_APP_VERSION=1.0.1-demo npm run build
```

(Netlify CI builds set `COMMIT_REF` automatically and would not have this
problem; this preview appears to have been deployed from a locally built `dist/`.)

**Blocking?** **No** for the preview. **Yes** as a required action before the
build is promoted to a production domain.

### OBS-1 — stale comment: `/customers` list has no in-app link

See §1. `navGroups.ts` says the list is "reachable from the `/crm` screen"; the
deployed `/crm` links only to individual customer cards. The list is reachable
in-app via the quick-create success destination, and by direct URL. Cosmetic.

### OBS-2 — one benign CSP `eval` report per load (Zod JIT probe)

See §3. Guarded by the library's own `try/catch`; validation verified working
live (LB-9); Chromium logs no console error. Optional cleanup: enable Zod's
`jitless` option.

---

## Honest notes on the verification itself

- **Fonts are NOT blocked by the CSP** and did not fail on this deploy. They are
  nevertheless *classified* non-required so a future Google Fonts outage cannot
  masquerade as a site defect. This is stated, not hidden.
- **`net::ERR_ABORTED` is recorded but not asserted.** The route sweep
  deliberately navigates away mid-flight to exercise browser Back, which cancels
  in-flight react-router lazy-chunk prefetches. Chromium reports the cancellation
  as a "failed" request although nothing broke — the chunk is simply re-fetched
  from the immutable `/assets` cache when next needed, which the render
  assertions then prove. Every such entry is reported in the per-route
  `live-observations` attachment.
- **Worker count matters locally, not remotely.** At 4 Playwright workers the
  3840×2160 capture pass and the analytics CSV/print run timed out purely from
  local browser memory/CPU contention (both pass standalone). The config ships
  with `workers: 2` and a raised screenshot timeout so a local resource limit is
  never mis-reported as a live-site defect. Override with `LIVE_WORKERS`.
- **Zero retries.** `retries: 0` — a flaky live result is a finding, not
  something to average away.
- **Nothing was deployed, built or served by this verification.** No `netlify`
  command was executed. No application source was modified; only
  `e2e/live/**`, `e2e/live.config.ts`, this document and
  `docs/screenshots/final-live/**` were written.

---

## Result summary

| # | Category | Result |
|---|---|---|
| 1 | 31 routes × (nav / direct / refresh / back), real content, clean console + network | **PASS** |
| 2 | Netlify Functions: ai-health / ai-capabilities / ai-config / ai-summarize error shape | **PASS** |
| 3 | Live security headers + exact CSP + `/assets/*` immutable + no CSP violations | **PASS** |
| 4 | Live app behaviour (seed, reset/demo, search, CSV, Markdown, presentation, print, Copilot, system-health) | **PASS** |
| 5 | axe smoke — 6 routes, zero serious/critical | **PASS** |
| 6 | Screenshots 8 screens × 3 resolutions | **PASS** |
| — | Blocking defects | **NONE** |
| — | Non-blocking | DEF-1 (build stamp), OBS-1 (stale nav comment), OBS-2 (benign CSP eval report) |
