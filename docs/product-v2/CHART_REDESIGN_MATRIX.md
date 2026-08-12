# Chart Redesign Matrix (S13.0)

Complete audit of every visualization. There is **no charting library** (recharts/chart.js/d3 are
**not** installed — `Sparkline.tsx:17`, `MetricChart.tsx:1`); every chart is hand-rolled SVG/CSS.
The codebase enforces an **honesty doctrine**: charts refuse to fake trends, break the line on null
gaps, and render `"טרם נמדד"` (not-measured) instead of 0. **No visualization is fed by
`Math.random`** — the analytics engine (`analytics/engine.ts:3`) and dashboard selectors
(`dashboardKpis.ts:2`) explicitly forbid it.

## Inventory (8 primitives + 1 dev-only gallery)

| # | Chart | File:line | Route(s) | Type | Data backing | Labels/legend/units/tooltip/empty | Class |
|---|-------|-----------|----------|------|--------------|-----------------------------------|:---:|
| 1 | Sparkline (revenue) | `design-system/Sparkline.tsx:20` → `CommandCenterPage.tsx:724` | `/` | custom-svg sparkline | **Real** — `revenueByMonth(quotations)` | no axes/legend/units/tooltip; paired with explicit month/value list + honest empty (`<2` pts → null) | **KEEP** |
| 2 | MetricChart | `analytics/MetricChart.tsx:20` | `/analytics` (×2) | custom-svg line | **Real** — analytics engine over ~18 collections | units in `<title>`+aria; per-point drilldown; **table alternative**; honest empty | **KEEP** |
| 3 | LinkGraphView | `memory/components/LinkGraph.tsx:26` | `/memory` | network/node-link | **Real** — memory items + resolved wikilinks | node/edge counts in aria; node `title`; honest empty | **KEEP** |
| 4 | Run Task Graph | `agents-ui/AgentCollaborationPage.tsx:636` | `/agents/collaboration` | DAG/network | **Real** — persisted run records | per-node kind+status; click-to-highlight; honest empty | **KEEP** (elevate) |
| 5 | GanttTimeline | `implementation/ImplementationPage.tsx:113` | `/implementation` | custom-svg gantt | **Static** — bootstrapped plan dates; aria says *"תאריכי יעד, לא עובדות"* | no time axis/ticks/legend/tooltip; status by color only | **REDESIGN** |
| 6 | MiniBarRow | `command-center/CommandCenterPage.tsx:186` | `/` (funnel, priority) | css bars | **Real** — `salesFunnel(leads)`, `openTicketsByPriority` | category label + value; no tooltip | **KEEP** |
| 7 | ConfidenceBar | `design-system/ConfidenceBar.tsx:22` | `/`,`/courses`,`/support`,`/memory`,`/personas`, agents envelope | css meter | **Real/derived, else honest-null** | label + % or `"טרם נמדד"`; role=meter | **KEEP** (prune always-null instances) |
| 8 | KpiCard delta chip + embedded sparkline | `design-system/KpiCard.tsx:73,83` | app-wide | delta chip + sparkline | **Static** — `delta`/`spark` supplied **only in showcase**, never in production pages | value is real; delta/spark features **dead in prod** | **REPLACE_WITH_KPI** (drop unwired sub-features) |
| 9 | DesignShowcase sparklines/bars | `design-system/showcase/DesignShowcase.tsx:201-234` | `/design` (dev only, outside shell/nav) | mixed | **Hardcoded** demo | labeled "(הדגמה)" | **KEEP dev-only** — ensure not shipped to end users |

## Per-chart questionnaire (spec C)

The full X/Y, labels, legend, units, values, baseline, tooltip, empty-state, data-source, and
worth-the-space answers per chart are captured in the inventory table above and the source citations.
Highlights:

- **MetricChart (#2)** is the best-in-codebase: units, drilldown to source records, an accessible table
  alternative, honest gap-breaking, honest empty. It is the model the rest should follow.
- **GanttTimeline (#5)** is the one "technical-looking but weak" chart: large, no axis/legend/tooltip,
  and backed by **static** target-date content its own aria-label calls "not facts."
- **KpiCard delta/sparkline (#8)** are technical affordances that in practice render only hardcoded
  showcase data — visual promise with no production payload.

## Counts

- **Total:** 8 primitives (+1 dev gallery). Rendered instances: MetricChart ×2, MiniBarRow ×2, ConfidenceBar ×8+.
- **Real/derived:** **6** — #1,2,3,4,6,7 (cover `/`, `/analytics`, `/memory`, `/agents/collaboration`, `/courses`, `/support`).
- **Static/hardcoded:** **2** — #5 Gantt, #9 showcase (plus #8's delta/spark sub-features).
- **Random/synthetic:** **0**.

## Classification totals & decisions

| Decision | Count | Items |
|----------|:---:|-------|
| **KEEP** | 6 | Sparkline, MetricChart, LinkGraphView, Run Task Graph, MiniBarRow, ConfidenceBar |
| **REDESIGN** | 1 | GanttTimeline — add a real time axis + legend + tooltip, **or** REPLACE_WITH_TABLE (milestone table) |
| **REPLACE_WITH_KPI** | 1 | KpiCard delta/sparkline — wire real deltas or drop the props |
| **REMOVE** | 0 | (none — no decorative/fake chart exists to remove) |
| KEEP (dev-only, gate) | 1 | DesignShowcase |

## Recommended professional patterns for PR B

- **Command Center revenue** → keep the compact sparkline but add a small **KPI + delta** (real MoM delta
  computed from `revenueByMonth`), replacing the currently-dead KpiCard delta chip.
- **`/analytics`** → keep MetricChart as the single primary visualization; move secondary metrics into a
  **ranked table** and **small-multiples** row instead of stacking full panels 5 screens deep.
- **`/governance`, `/system-health`** → replace badge walls with **bullet/progress** rows (status + target
  baseline) and a single **KPI + delta** summary; progressively disclose detail.
- **`/implementation`** → REDESIGN the Gantt with a labeled time axis + legend, or a **timeline/milestone
  table** if the visual doesn't earn its full-width footprint.
- **Composition donuts** — only where composition genuinely matters (e.g. revenue mix); none needed today.
- **No decorative charts.** Every visualization must answer one question with real/derived data (already
  the codebase's own doctrine — enforce it in review).
