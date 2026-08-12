# Navigation, Header & Visual Simplification (S11.2-B)

**Checkpoint.** Branch `feature/teragon-visual-rationalization` from base
`feature/teragon-supabase-app-auth` @ `bd1dc7b`. Source of truth:
`PAGE_ACTION_AUDIT.md`, `PAGE_KEEP_HIDE_REMOVE_MATRIX.md`,
`VISUAL_RATIONALIZATION_PLAN.md`. No Supabase / migrations / Production / AI-flag
changes; Customers & Contacts behaviour untouched; `AI_REMOTE_ENABLED` stays false.

## 1. Navigation — before → after

The sidebar keeps **5 clear areas**; the change consolidates AI and renames the
system area, per the audit's proposed IA.

| # | Before | After |
|---|--------|-------|
| 1 | ניהול העסק | ניהול העסק |
| 2 | שירות והדרכה | שירות והדרכה |
| 3 | ידע ואוטומציה | **מעבדת AI · דמו מקומי** |
| 4 | הטמעה והגשה | הטמעה והגשה |
| 5 | ניהול המערכת | **עוד** |

- **All deterministic AI surfaces are grouped under one honest "מעבדת AI · דמו מקומי"
  (AI Lab · local demo)** area — `/agents`, `/agents/collaboration`, `/automations`,
  `/memory`, `/knowledge`, `/learning`, and now `/governance` (moved from the old
  system group; AI governance belongs with AI).
- The remaining system/reference pages sit under **"עוד"** (`/administration`,
  `/system-health`, `/settings`).
- **No page hidden or removed.** All 32 routes stay reachable; `/customers`,
  `/contacts`, `/customers/:id`, `/submission/presentation` remain intentionally
  reachable off-nav (unchanged). Only the active group expands by default (existing
  behaviour); state is persisted locally.

## 2. Header — before → after

Icon controls: **before** search · quick-add · notifications · **mail** · theme ·
account · nav-toggle → **after** search · quick-add · notifications · theme · account ·
nav-toggle. The **mail** button was perpetually **disabled** (never wired; `onMail`
absent) and duplicated notifications — it now renders **only when actually wired**, so
the app header drops one dead control. Global search, notifications, theme and account
stay accessible; the proven mobile search button + hamburger are unchanged.

## 3. Contextual panel

The left intelligence rail is **already collapsible** (`LeftIntelligenceRail
collapsible`) with its collapsed state **persisted locally** (`shellState.railCollapsed`
→ localStorage; nav/rail prefs only, no sensitive data), and pages opt out for a
full-width canvas via `HideShellRail`. Kept as-is. *Deferred:* fully hiding the honest
"rail will be built with the screen" placeholder on pages that ship no rail — the router
smoke test currently matches route titles via that placeholder, so removing it belongs
with a test update, out of scope here.

## 4. Visual consistency — selects standardized

Every native `<select>` now renders one consistent, theme-aware control: `appearance:
none` + a single themed caret on the inline-end (left in RTL) + the raised surface,
border and radius that match `.os-qc-input`. Previously some pages used unstyled selects
(native OS arrow + a light option list that clashed in dark mode). `.os-qc-input` was
switched from the `background` shorthand to `background-color` so the caret is never
reset; inline `background` overrides are beaten with `!important` on the caret only.
Focus ring, accessible name and keyboard behaviour are unchanged. KPI cards remain ≤4;
no neon/glow added.

## Validation

- Build ✅ · typecheck ✅ · typecheck:tests ✅ (0) · scoped oxlint ✅
- Unit/static: **2552 tests pass** (router smoke 36/36 — all 32 routes reachable; nav
  integrity 9/9). The 12 `tests/platform/*` files fail only on this local machine
  (pre-existing RolldownError; green in CI).
- Accessibility ✅ **18/18** · Network-resilience ✅ **6/6** · Cross-browser ✅ **144
  passed** (chromium/firefox/webkit × 1440/768/390).
- Full-route overflow sweep ✅ **0 / 32 routes** at 1440 / 1024 / 768 / 390; 0 console
  errors; 0 blank routes; 0 dead links / NO_OP controls.
