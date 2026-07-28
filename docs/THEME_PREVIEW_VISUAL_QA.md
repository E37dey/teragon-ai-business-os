# Theme Preview — Visual QA

**Preview:** https://6a68bf57ff47bd08859830c4--teragon-os-demo.netlify.app
All captures are from the **live Deploy Preview** (not a local build).

---

## 1. Live axe — both themes (zero serious / critical / color-contrast)

Run per route with a real headless render against the preview. Dark routes were driven
by the **real header toggle** (writes the IndexedDB canonical preference), not a
localStorage-mirror injection — see the artifact note in §4.

| Route | Light: serious / critical / contrast | Dark: serious / critical / contrast | Overflow (L/D) | Console errors |
|-------|:---:|:---:|:---:|:---:|
| `/` (home) | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/courses` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/crm` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/service` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/agents` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/governance` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/analytics` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/settings` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |
| `/system-health` | 0 / 0 / 0 | 0 / 0 / 0 | no / no | none |

Additionally the live axe spec (`e2e/live/live-axe.spec.ts`, default theme) reported
**zero serious/critical** on `/`, `/crm`, `/agents`, `/governance`, `/system-health`,
`/submission`.

**Result: zero serious, zero critical, zero color-contrast in both themes, every route.**

## 2. Theme-behaviour contracts (live)

| Contract | Method | Result |
|----------|--------|--------|
| New user defaults to **בהיר** | fresh context, no stored pref | `data-theme=light` at DOMContentLoaded **and** after hydrate → **no flash** ✓ |
| Light workspace + **dark right nav** (light mode) | computed bg | nav `rgb(17,27,38)` = dark ✓ |
| Light **persists** across refresh | set light → reload | `light` → `light` ✓ |
| Dark via **real toggle** | click header control | `data-theme=dark` ✓ |
| Dark **persists** across refresh | toggle → reload | `dark` → `dark` ✓ |
| Nav stays **dark in dark mode** too | computed bg | nav `rgb(9,17,28)` = dark ✓ |
| **System** follows OS | select `system` via toggle, then emulate OS | OS-dark → `dark`; flip OS-light (live) → `light`; flip back → `dark` ✓ |
| System **persists** across refresh | reload with pref=system | `pref=system`, resolves `dark` under OS-dark ✓ |
| **Print always Light** even while Dark selected | dark on screen → `emulateMedia print` | root stays `dark`, `body` bg under print = `rgb(255,255,255)` (light) ✓ |

## 3. Screenshot inventory (60 PNGs, all from the live preview)

```
docs/screenshots/theme-preview/
├── light/   home, courses, crm, service, agents, governance, analytics,
│            settings, system-health, presentation  × {1440x900, 1920x1080}   (20)
├── dark/    (same 10 routes × 2 sizes)                                         (20)
└── states/
    ├── light/  drawer-courses-insights, approval-agents, warning-governance,
    │           insufficient-analytics, empty-collaboration, nav-collapsed,
    │           copilot-open, modal-crm-newlead                                 (8)
    ├── dark/   (same 8 states)                                                 (8)
    ├── copilot-closed-light.png
    ├── theme-control-light.png          (theme cycle control focused)
    ├── selected-row-light.png           (selected customer table row)
    └── print-preview-while-dark.png     (Dark selected → print renders Light)  (4)
```

Requested state coverage: theme menu/control ✓, drawer ✓, modal ✓, selected table row ✓,
pending approval ✓, warning ✓, empty state ✓, insufficient-data state ✓, Copilot open ✓,
Copilot closed ✓, print-preview-while-Dark ✓.

## 4. Honest QA note — a capture-method artifact I caught and corrected

The reusable route verifier (`scripts/calm-verify.mjs`) sets the theme by writing only the
**localStorage mirror** (`teragon.theme.preference`). But `ThemeProvider` reconciles from
the **IndexedDB canonical** repository on mount and overrides the mirror — so a fresh
context with only the mirror set reverts to the default (light). My first "dark" route pass
therefore rendered **light** (light vs dark PNGs differed by only 6–8 bytes, and the "dark"
axe run was really a second light run).

**Corrected:** the dark routes were re-captured with `scripts/theme-dark-verify.mjs`, which
selects dark via the **real header toggle** (persisting the IndexedDB canonical value) in one
context, and it **reports `data-theme` per route** — every route confirmed `dark`, and the
re-captured PNGs now differ from light by 174–3778 bytes. The same real-toggle mechanism was
used for all state captures and the system-mode test. This is why the dark axe table in §1
is trustworthy.

## 5. Visual spot-check (pixels, not just bytes)

- **Light `/` @1440×900** — light workspace, **dark right nav** ("TERAGON AI BUSINESS OS"),
  CEO **צחי זוסטייהם**, "מרכז הפיקוד של טרגון טכנולוגיות", synthetic-demo badge
  "מצב הדגמה מקומי · נתוני הדגמה", honest envelope ("טרם נבדק", "טרם נמדד",
  "22 מדדים ללא קו בסיס"), sun glyph (☀), correct RTL, no clipped Hebrew, no overflow.
- **Dark `/` @1440×900** — Quiet-Enterprise deep-navy workspace, **no neon, no glow**, muted
  teal accents, nav still dark, moon glyph (☾), identical honest content, correct RTL.

No placeholders, no clipped Hebrew, no horizontal overflow observed in either theme.
