# Visual Density Audit (S13.0)

Measured on the running build (`npm run preview`, base `3168dad`) at **1440×900**, plus source
counts. The user rejected the current density; this audit confirms the complaint with numbers and
does **not** defend the design because automated QA passed. Passing tests ≠ good experience.

## The rule we are measuring against

A professional 2026 enterprise page should be understood in **~3 seconds** and normally contain:
one title/context area · **≤4 KPIs** · **one** primary visualization *or* work area · **one** obvious
primary action · secondary information progressively disclosed. **No dashboard-within-dashboard.**

## Measured density (live DOM, 1440×900)

| Route | Doc height | Screens tall | Inline SVG | Stat-class nodes | Badges/chips | Buttons | Panels | Verdict |
|-------|-----------:|:---:|---:|---:|---:|---:|---:|---|
| `/governance` | **5,917px** | ~6.6 | 42 | 31 | **66** | 16 | 16 | **Critical overload** |
| `/analytics` | **4,496px** | ~5.0 | 32 | 30 | **61** | **78** | 13 | **Critical overload** |
| `/system-health` | 1,673px | ~1.9 | 31 | 24 | **34** | 19 | 8 | Overloaded (status noise) |
| `/` Command Center | 1,486px | ~1.7 | **56** | 32 | 15 | 17 | 17 | Overloaded (icon+panel noise) |
| `/memory` | 1,446px | ~1.6 | 36 | 30 | 7 | 29 | 11 | Dense |
| `/customers` (a list) | 1,098px | ~1.2 | 21 | 24 | 27 | 31 | 5 | Over-decorated for a list |
| `/agents` | 953px | ~1.1 | 32 | 28 | 15 | 36 | 12 | Acceptable height, busy |

*Stat-class nodes = elements whose class contains kpi/stat/metric. Badges = badge/chip/status/pill.*

## The 12 biggest density problems (ranked)

1. **Dashboard-within-dashboard on `/governance` and `/analytics`.** 5–6.6 screens tall, 60+ badges
   each. No single page should require 6 vertical screens; these are report *suites* masquerading as one page.
2. **Status/badge inflation.** 66 badges (governance), 61 (analytics), 34 (system-health). Simultaneous
   statuses far exceed what a human tracks; every badge claims equal urgency, so none reads as important.
3. **Uniform "4 KPI cards" template inflation.** Nearly every page ships exactly 4 KpiCards regardless of
   purpose (Customers, Agents, Automations, Knowledge, Memory, System Health) — a copy-paste artifact,
   not information-driven. A list page does not need a 4-KPI strip.
4. **Command Center icon/panel noise.** 56 inline SVGs + 17 panels + 32 stat nodes on the first screen —
   too many focal points; nothing dominates, so the "3-second purpose" test fails.
5. **The left contextual rail is expensive and mostly duplicative.** Rails on Customers, Customer Detail,
   and System Health **restate data already on the page**; Contacts falls back to a placeholder rail
   (`DefaultRail`, `OsShell.tsx:45-61`) that prints filler text. Only Memory's import/export rail and
   Agents' cross-link rail add real value.
6. **Right navigation is long and mixes concerns.** 5 groups / 28 items with everyday-business
   interleaved with academic/submission/training (Analytics buried under "Adoption & Submission";
   Governance nested inside a group self-labeled "local demo").
7. **Header density.** Identity block + ~5 action buttons + full-width search + a three-part date/clock
   meta strip, all in one row (`CompactTopHeader.tsx:167-177`). The date/clock strip is decorative.
8. **Weak/placeholder-feeling analytics.** Outside Command Center (5 sparklines) and Analytics (2
   MetricCharts), most "analytics-looking" pages have **zero** charts — the visual weight is badges and
   stat tiles, which read as placeholder.
9. **`/customers` over-decoration.** A list/table page carries 24 stat nodes + 27 badges + a duplicative rail.
10. **Repeated warning/attention blocks.** System Health repeats attention/failed/pending/blocked both in
    a rail and in the KPI row directly below it.
11. **Card nesting.** Panels contain KpiCards contain delta chips + sparklines (the delta/spark
    sub-features are dead in production — see CHART_REDESIGN_MATRIX) — nesting without payload.
12. **Analytics control overload.** 78 buttons + 5 selects on one page; every metric point is a button.
    Powerful, but overwhelming as the default view.

## Elements whose removal improves comprehension without losing function

- The **`DefaultRail` placeholder** (filler text) — remove entirely; show no rail when a page has no
  contextual value.
- **Duplicative rails** (Customers, Customer Detail, System Health) — fold the one unique datum into the
  page; drop the rail.
- The **decorative date/clock meta strip** in the header — keep a single date; drop the clock.
- **Dead KPI strips** on list pages (Contacts has none — correct; Customers should follow).
- **KpiCard delta-chip + embedded sparkline** where unwired (production passes no `delta`/`spark`) — drop
  the props until real deltas exist.
- **Badge demotion** — convert most "info" badges to plain text or a single rolled-up status; reserve
  colored badges for genuine exceptions.

## What is already good (keep)

- **Honest data doctrine** — engines ban `Math.random`, charts refuse to fake trends and render
  `"טרם נמדד"` (not-measured) instead of 0. Density is *too many honest elements*, not fake data.
- **0-overflow responsive canvas** and RTL correctness — retain through the redeclutter.
- **Command Center already hides the shell rail** (`HideShellRail`) for a full-width canvas — the right
  instinct; extend it.

## Density targets for PR A/B (per operational page)

| Metric | Current typical | Target |
|--------|:---:|:---:|
| Doc height (main pages) | 1.5–6.6 screens | ≤ ~2 screens above-the-fold value |
| KPIs above fold | 4 fixed (often padded) | ≤4, information-driven (fewer is fine) |
| Simultaneous colored badges | 15–66 | ≤ ~6 exceptions |
| Primary visualizations | 0 or 2–5 scattered | **1** primary per page |
| Permanent rails | ~10 routes | ≤2 (Memory, Agents) → on-demand drawer elsewhere |
