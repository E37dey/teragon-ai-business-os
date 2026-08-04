# TERAGON — Visual Rationalization Plan (S11.1-A)

**Documentation-only.** No app code changed this checkpoint. Base @ `eade083`.
Findings are grounded in the 128-screenshot sweep + `_metrics-<w>.json` (overflow,
console, nav mode) and targeted handler reads. Severity: BLOCKER / HIGH / MEDIUM / LOW.

## Findings by severity

### BLOCKER — 0
No crash, no dead route, no console error at any viewport; every route renders its shell.

### HIGH — 2
- **H1 · `/submission/presentation` horizontal overflow.** Fixed-width slides clip:
  **238px @ 768**, **616px @ 390** (screenshot-confirmed; content cut off, tab row
  overflowing). This page is the **academic deliverable**, so overflow on a projector
  or tablet is high-impact. Fix: make slide layout fluid (`max-width:100%`, wrap the
  deck in `overflow-x:auto`, responsive slide width).
- **H2 · Persistent sidebar only at 1440.** `nav.os-nav` is inline at 1440 (31/32) but
  **collapses to the hamburger at 1024/768/390** (0 inline). A 1024–1439 "desktop" user
  loses the primary navigation affordance. Fix: show the inline sidebar from ~1024 (or a
  slim rail), keep the hamburger for < 768.

### MEDIUM — 5
- **M1 · Navigation grouping.** Flatten-and-regroup to **6 primary areas + AI Lab + a
  "more/admin" area** per `PAGE_KEEP_HIDE_REMOVE_MATRIX.md` (reduces cognitive load;
  local, low-risk).
- **M2 · Header density at ≤1024.** Search + two theme toggles + mail + notifications +
  quick-add + account compete for space. Condense (single theme control; group
  secondary icons) to prevent overload at 1024.
- **M3 · Contextual panel ("לוח הקשר").** On ≤1024 captures it lands at the bottom;
  ensure it is **collapsible** and never precedes main content on mobile, and never
  reduces the workspace excessively at 1024.
- **M4 · Inconsistent selects/controls.** Standardize native/dark selects, buttons,
  filters, chips, badges and empty states into the shared component set (preserve
  visible focus + accessible names).
- **M5 · `/automations` overflow (transient).** The authoritative full-reload sweep
  showed **0px** at 1024; the earlier 12px was a soft-navigation artifact. Verify it
  stays 0 after the nav/header changes; no dedicated fix needed unless it reappears.

### LOW — 4 (document, do not expand scope)
- **L1 · ≤1024 cold-load paint.** `<main>` content paints > 200ms on hard reload at
  ≤1024 (blank middle in sweep frames; content proven present by passing gates). Add
  loading skeletons for perceived performance.
- **L2 · Mixed Hebrew/English.** Intentional product/agent names (TERAGON, AI Copilot,
  Hunter, Stage Gates, Microlearning) are acceptable; sweep the UI for *unintended*
  English strings only.
- **L3 · Card/badge density.** Some dashboard sections repeat status text/badges; a
  density pass (≤4 KPI cards is already met) improves calm.
- **L4 · Long content pages.** UI_ONLY pages are scroll-heavy by design; acceptable.

## Fix policy (for the Phase-2 implementation PR)

- **Fix all BLOCKER + HIGH** → H1 (presentation overflow), H2 (sidebar breakpoint).
- **Fix MEDIUM when local + low-risk** → M1 nav grouping, M2 header condense, M3 panel
  collapsible, M4 control standardization.
- **Document LOW** (L1–L4) rather than widen scope.

## What is already good (do not "fix")

- Dashboard already respects **≤4 KPI cards**, grouped nav, and a genuine **human-in-the-
  loop AI approval** flow (why · evidence · approve/reject · busy state · empty states).
- **RTL integrity** holds at every viewport; **zero console errors**; **no no-op /
  broken / misleading controls** were found. The redesign is a **calm/rationalize** pass,
  not a rescue.

## Exact first implementation PR (Phase 2)

**Branch `feature/teragon-visual-rationalization` → Draft PR to
`feature/teragon-supabase-app-auth`.** First coherent commit batch: **H1 presentation
responsiveness + H2 sidebar breakpoint** (the two HIGH findings), each with a
cross-browser/overflow assertion at 1440/1024/768/390, then M1–M4 in follow-up batches.
No Supabase/flags/migrations; Customers & Contacts untouched.
