# Theme System v3 — Draft Preview Report

**Scope:** final validation + Netlify **Draft Preview only**. No merge, no release tag, no
production deploy. `AI_REMOTE_ENABLED=false` throughout.

**Branch:** `post-release/theme-system-v3`

---

## ⚠️ Deployed-commit provenance — read first

The approval named commit **`40079a8`**. The Draft Preview does **not** contain exactly
`40079a8`, because `40079a8` **did not pass the required full E2E gate**. Running the complete
existing suite surfaced **real light-mode contrast defects** (base color tokens used as text
on light surfaces in the command palette, notifications, quick-create, presentation examiner
and agent cards) plus behaviour specs that still asserted the pre–Visual-Calm DOM.

The deployed bundle is therefore built from **`5bb8879`**:

```
40079a8  style(theme): complete system-wide light and dark rollout   ← approved
5fa328e  test(e2e): repair suite for Visual Calm + light rollout      ← + real contrast fixes
01bc525  docs(screenshots): refresh e2e-captured screenshots (light)
5bb8879  docs+test: final e2e-run artifacts                           ← DEPLOYED bundle source
21f2344  test(e2e-live): fix off-nav + VC-collapsed nav live specs    ← current HEAD (e2e only)
```

`21f2344` (current HEAD) adds **only** `e2e/live/` test fixes on top of `5bb8879`; the built
bundle is byte-identical, so the preview was **not** redeployed for it. Nothing was merged,
tagged, or promoted to production.

---

## The 12 required return items

**1. Full E2E command + result**
```bash
npx playwright test                                   # local gate — full suite green
LIVE_URL="https://6a68bf57ff47bd08859830c4--teragon-os-demo.netlify.app" \
  npx playwright test -c e2e/live.config.ts           # post-deploy — 68/68 passed
```
No spec excluded, no timeout raised to hide a regression. Details: `THEME_PREVIEW_E2E_RESULTS.md`.

**2. Final test counts**
- Vitest **1706 / 1706** (187 files) · oxlint **0/0** · TypeScript **0** · `typecheck:tests` **0**
- Local E2E: full suite green (0 non-live failures)
- Live E2E vs preview: **68 / 68 passed, 0 failed**
- Secret scanner: **CLEAN — 0 findings** · Production build: **pass** (46.9 s)

**3. Defects found + fixed**
- **44 local E2E** failures (Visual-Calm DOM drift) — all fixed (`5fa328e`), incl. **real
  light-mode contrast product fixes** (base tokens → `-text` variants).
- **5 live E2E** failures — test-expectation defects, fixed (`21f2344`): off-nav
  `/customers` routes wrongly required `aria-current`; in-app nav sweep clicked links hidden
  in VC-collapsed groups. Product was live-verified correct in both cases before any change.
- **1 QA-method artifact** I caught: a mirror-only "dark" capture actually rendered light;
  re-done via the real toggle. See `THEME_PREVIEW_VISUAL_QA.md` §4.

**4. Exact preview URL**
`https://6a68bf57ff47bd08859830c4--teragon-os-demo.netlify.app`

**5. Deploy ID**
`6a68bf57ff47bd08859830c4` (Netlify project `teragon-os-demo` — **not** production `teragon`;
`netlify deploy --build`, draft — `--prod` never used)

**6. Deployed commit**
Bundle built from **`5bb8879`** (= approved `40079a8` + E2E-required fixes). See provenance
note above. Live HTML confirmed to ship `theme-init.js` and default `data-theme="light"`.

**7. Route-refresh result**
All 31 canonical routes pass **direct URL + refresh + browser back + in-app navigation** live
(`live-routes.spec.ts`, 36/36), incl. `/customers`, `/customers/cu-1` (valid seeded customer
"אבי לוטם", owner צחי זוסטייהם), `/submission/presentation`, and the not-found path. Zero
blank shells, zero console errors, zero failed required requests, zero unexpected CSP
violations.

**8. Light / Dark axe results**
Zero **serious**, zero **critical**, zero **color-contrast** on every route in **both**
themes (dark driven by the real toggle). Table: `THEME_PREVIEW_VISUAL_QA.md` §1.

**9. Console / network results**
Zero console errors and zero failed **required** network requests across all routes and both
themes. The only classified non-required traffic is Google-Fonts hosts — and none is actually
requested (see item 10).

**10. Font / CSP result**
- **Zero external font requests.** The deployed `index.html` contains **no** Google-Fonts
  link; the app renders from its local font stack.
- **CSP restrictive and unchanged:** `default-src 'self'; script-src 'self'` (no
  `unsafe-eval`, no `unsafe-inline`); `object-src 'none'; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'; connect-src 'self'; img-src 'self' data:`.
  `style-src`/`font-src` still *allow-list* the Google-Fonts hosts as a latent fallback, but
  nothing requests them. Plus `Strict-Transport-Security`, `X-Frame-Options: DENY`,
  `X-Robots-Tag: noindex`.

**11. Screenshot paths**
`docs/screenshots/theme-preview/{light,dark,states}/` — **60 PNGs** from the live preview
(10 routes × Light/Dark × {1440×900, 1920×1080} + 20 interactive states incl.
print-preview-while-Dark). Inventory: `THEME_PREVIEW_VISUAL_QA.md` §3.

**12. Remaining limitations** — see the dedicated section below.

---

## Theme behaviour — validated live

| Mode | Requirement | Result |
|------|-------------|--------|
| **Light** | new user → בהיר, light workspace + dark right nav, no flash, persists | ✓ `data-theme=light` pre-paint & post-hydrate; nav `rgb(17,27,38)`; persists across refresh |
| **Dark** | Quiet Enterprise, no neon/glow, persists | ✓ deep-navy, muted teal, moon glyph; nav `rgb(9,17,28)`; persists across refresh |
| **System** | follows `prefers-color-scheme`, reacts to OS change | ✓ OS-dark→dark, live flip→light→dark, persists as `pref=system` |
| **Print** | always Light even when screen is Dark | ✓ root stays `dark`, print `body` bg `rgb(255,255,255)` |

## Honest-envelope / safety verification (live)

- **AI remote disabled:** `ai-config` → `remoteEnabled:false`, `providerState:"מושבת"`;
  `ai-health` → `state:"מושבת"`, `AI_REMOTE_ENABLED=false`. AI functions report **מושבת**.
- **Local Mode A visible** and **synthetic-demo classification visible**: home shows
  "מצב הדגמה מקומי · נתוני הדגמה"; honest markers ("טרם נבדק", "טרם נמדד",
  "22 מדדים ללא קו בסיס") render in both themes.
- **No API-key field:** Settings → AI tab shows "אין ולא יהיה שדה מפתח" (asserted by the
  live settings state); no key input exists in the browser.
- Company **טרגון טכנולוגיות**, CEO **צחי זוסטייהם** rendered correctly, RTL intact, no
  clipped Hebrew.

## Remaining limitations

1. **Deployed commit is `5bb8879`, not `40079a8`** — by necessity (the gate required the
   light-mode contrast fixes). Requires human acknowledgement before any merge/tag/prod.
2. **Live axe & screenshots are Chromium-only** (project config). No Firefox/WebKit or real
   mobile-viewport pass was run.
3. **`system` mode** cannot be exercised by a localStorage-mirror injection (the canonical
   IndexedDB value overrides it); it must be selected via the UI toggle. Validated that way
   here, but automated coverage of `system` in the headless verifier is manual, not a spec.
4. **CSP still allow-lists the Google-Fonts hosts** in `style-src`/`font-src`. No request is
   made, but if a future change reintroduces the `<link>`, the CSP would permit it. Tightening
   `style-src`/`font-src` to `'self'` is a possible follow-up (out of scope for this preview).
5. `X-Robots-Tag: noindex` + draft context keep the preview unlisted; it is a Draft Preview,
   not a production URL.

---

**Stop point:** This is the end of the Draft Preview report. **No merge, no tag, no production
deploy** performed or pending — awaiting explicit human approval.
