# WAVE 8 — PRINT QA (W8-F · Phase 8.17)

A4 print validation of the **analytics report print** (`reportPrint.tsx`, W8-A)
plus explicit **re-verification that the W7 P-1 / P-2 print defects are FIXED
and HOLD on final `main`**.

Spec: `e2e/analytics/w8f-print.spec.ts` (3 tests, all PASS). A4 = 794×1123 CSS
px (A4 portrait @ 96 dpi), `page.emulateMedia({ media: "print" })`.

---

## 1. Analytics report print (`.an-print-root`)

Follows the submission print contract (RTL, light palette, CSS-counter page
numbers, product/date/owner header). Assertions and results:

| Assertion | How verified | Result |
|---|---|---|
| Print root mounts only on print | `printRun` state → `.an-print-root` attached; `@media screen { display:none }` | **PASS** |
| RTL | `getComputedStyle(.an-print-root).direction === "rtl"` | **PASS** |
| Light print palette | avg(RGB) of background > 200 | **PASS** |
| Page-number counters | stylesheet declares `counter(anpage)` on `.an-print-page` | **PASS** |
| Product / owner header | `.an-print-root` contains "מוצר: TERAGON AI BUSINESS OS · טרגון טכנולוגיות" + "בעלים:" | **PASS** |
| No nav bleed | `nav.os-nav` hidden under print media | **PASS** |
| Non-empty body | real report rows (`> 40` chars) | **PASS** |

Print CSS (`reportPrint.tsx`):
```css
@page { size: A4; margin: 14mm; }
.an-print-root { color:#111; background:#fff; counter-reset: anpage; direction: rtl; }
.an-print-page { counter-increment: anpage; break-after: page; }
.an-print-page footer::after { content: "עמוד " counter(anpage); }
```
Capture: `docs/screenshots/wave8/print-analytics-report-a4.png`.

Honest-value note: report rows render `null` values as **"טרם נמדד"**, never 0
(covered by `tests/analytics/csv.test.ts` + the analytics insufficient-data
e2e). The analytics report print carries only metric aggregates — no record
bodies — so it is clean of personal/secret data (shares the `ReportRun` rows
scanned in `WAVE_8_SECURITY_REPORT.md §3.3`).

## 2. Re-verification — W7 P-1 / P-2 fixes HOLD

`WAVE_7_PRINT_QA.md §2` reported two MINOR defects:

- **P-1** — CSS page-number counters existed ONLY in the submission print; the
  quick-start print and the presentation handout had no page counters.
- **P-2** — only the submission print carried a title/version/date/owner
  header; quick-start and the handout printed content without such a header.

Both are now **FIXED in source and re-verified on final `main`** with explicit
assertions:

| Surface | P-1 counter | P-2 header | Test |
|---|---|---|---|
| Quick-start print (`.qs-print-section`) | `counter(qspage)` declared → **PASS** | `.qs-print-header` "מוצר: TERAGON… · בעלים: צחי זוסטייהם" visible → **PASS** | `w8f-print` t2 |
| Presentation handout (`.pres-handout-section`) | `counter(prespage)` declared → **PASS** | `.pres-handout-header` declared ("מוצר: TERAGON… · בעלים:") → **PASS** | `w8f-print` t3 |
| Submission print (`.sub-print-page`) | `counter(subpage)` (baseline) | header (baseline) | `w7g-print` (baseline) |
| Analytics report print (`.an-print-page`) | `counter(anpage)` → **PASS** | product/owner header → **PASS** | `w8f-print` t1 |

Source confirmation:
- `src/modules/quick-start/QuickStartPage.tsx` — `.qs-print-root { counter-reset: qspage }`, `.qs-print-section .qs-print-footer::after { content: "עמוד " counter(qspage) }`, `.qs-print-header { … }` with product/date/owner line.
- `src/modules/presentation/PresentationPage.tsx` — `.pres-handout-root { counter-reset: prespage }`, `.pres-handout-section { counter-increment: prespage; break-after: page }`, `.pres-handout-header` with product/date/owner line.

**Verdict:** All four print surfaces (submission, quick-start, presentation
handout, analytics report) now carry BOTH page-number counters AND a
product/owner print header. W7 P-1 and P-2 are closed and hold on final `main`.

## 3. Print QA summary

| Surface | Root | RTL | Light | Counters | Header | No-nav |
|---|---|---|---|---|---|---|
| Analytics report | `.an-print-root` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Quick-start | `.qs-print-root` | ✓ | ✓ | ✓ (P-1) | ✓ (P-2) | ✓ |
| Presentation handout | `.pres-handout-root` | ✓ | ✓ | ✓ (P-1) | ✓ (P-2) | ✓ |

No open print defects on Wave-8 surfaces.
