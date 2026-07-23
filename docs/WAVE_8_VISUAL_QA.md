# WAVE 8 — VISUAL QA (W8-F · Phase 8.17)

Screenshots of every Wave-8 surface at **three resolutions** (1920×1080,
2560×1440, 3840×2160) + an **axe** accessibility gate on the five new routes
and two drawer states + **A4 print** validation. Each capture waits for the
surface's real content marker first — no screenshot shows a loading stub.

- Screenshot spec: `e2e/analytics/w8f-visual.spec.ts` → **66 captures** (22
  surfaces × 3 res) → `docs/screenshots/wave8/`.
- Print captures: `e2e/analytics/w8f-print.spec.ts` → 2 A4 PNGs.
- Axe spec: `e2e/analytics/w8f-axe.spec.ts` → **7/7 PASS** (5 routes + 2
  drawers), ZERO serious/critical.

---

## Screenshots (`docs/screenshots/wave8/`, ×3 resolutions each)

| # | Surface | slug |
|---|---|---|
| 1 | /analytics | `01-analytics` |
| 2 | /analytics — insufficient-data (טרם נמדד) | `02-analytics-insufficient-data` |
| 3 | /analytics — drilldown drawer | `03-analytics-drilldown` |
| 4 | /analytics — report print view | `04-analytics-report-print` |
| 5 | /governance | `05-governance` |
| 6 | /governance — policy detail | `06-governance-policy-detail` |
| 7 | /governance — permission matrix | `07-governance-permission-matrix` |
| 8 | /governance — audit explorer | `08-governance-audit-explorer` |
| 9 | /governance — risk register | `09-governance-risk-register` |
| 10 | /governance — incident drawer | `10-governance-incident-drawer` |
| 11 | /administration | `11-administration` |
| 12 | /administration — user drawer (assign role) | `12-administration-user-drawer` |
| 13 | /administration — permission request | `13-administration-permission-request` |
| 14 | /administration — emergency mode | `14-administration-emergency` |
| 15 | /system-health | `15-system-health` |
| 16 | /system-health — degraded/unavailable states | `16-system-health-degraded-unavailable` |
| 17 | /system-health — diagnostic drawer | `17-system-health-diagnostic` |
| 18 | /settings | `18-settings` |
| 19 | /settings — AI tab | `19-settings-ai-tab` |
| 20 | /settings — security tab | `20-settings-security-tab` |
| 21 | command-center — management band | `21-command-center-management-band` |
| 22 | submission — pending state | `22-submission-pending-state` |

Print: `print-analytics-report-a4.png`, `print-quick-start-a4.png`.

## Axe accessibility gate — 7/7 PASS

| Target | Result |
|---|---|
| /analytics | ZERO serious/critical |
| /governance | ZERO serious/critical |
| /administration | ZERO serious/critical |
| /system-health | ZERO serious/critical |
| /settings | ZERO serious/critical |
| analytics drilldown drawer (open) | ZERO serious/critical |
| governance incident detail (open) | ZERO serious/critical |

### Findings + fixes (cycle 1 → fixed → cycle 2 clean)

Two **real** serious violations were found on cycle 1 and fixed (trivial-a11y
exception — aria/role/tabIndex only):

1. **`nested-interactive` (serious)** — `/analytics`, 12 nodes. The metric
   `MetricChart` `<svg role="img">` (an atomic image) nested focusable
   `role="button"` chart points. **Fix:** svg `role="img"` → `role="group"`
   (a group legitimately contains interactive children under one accessible
   name). `src/modules/analytics/MetricChart.tsx`.
2. **`scrollable-region-focusable` (serious)** — `/governance`, node
   `.os-rail__body`. The intelligence-rail body scrolls when its content is
   tall but was not keyboard-reachable. **Fix:** `tabIndex=0` + `role="region"`
   + aria-label. `src/layout/LeftIntelligenceRail.tsx` (shared component —
   benefits every route's rail).

Cycle 2 after both fixes: **all 7 axe checks green**, zero serious/critical.
Full unit suite re-run after the src edits: **1639/1639 green**.

## A4 print validation

The analytics **report print** (`reportPrint.tsx`) was validated at A4 (794×
1123 CSS px, `emulateMedia('print')`):

| Check | Result |
|---|---|
| Dedicated print root `.an-print-root` mounts on print | PASS |
| RTL direction | PASS |
| Light print palette (background ≥ 200 avg) | PASS |
| CSS page-number counters (`counter(anpage)`) declared | PASS |
| Product/owner header ("מוצר: TERAGON… · בעלים:") | PASS |
| App nav hidden in print | PASS |
| Print body non-empty (real report rows) | PASS |

Full print detail + the W7 P-1/P-2 re-verification is in
`docs/WAVE_8_PRINT_QA.md`.

## Responsive / theme notes

All 22 surfaces rendered correctly at all three resolutions with no horizontal
body overflow (wide tables scroll inside their own `overflow-x:auto` regions).
At A4 width the left nav sidebar collapses (its labels share text with page
headings — the specs target `role="heading"` to disambiguate).
