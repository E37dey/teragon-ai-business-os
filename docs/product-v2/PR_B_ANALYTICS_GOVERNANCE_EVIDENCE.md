# PR B — Analytics + Governance Content Restructuring (S13.2)

Second Product V2 build. Makes the two remaining dense operational pages easier to scan without
changing business meaning, data behaviour, or removing any control. **No AI Workspace work is included
in this PR** (that is PR C). No Supabase / migrations / Production / remote-AI / memory / agent-action /
Customers-Contacts-persistence changes.

All numbers below are **same-session** measurements on one build (`npm run preview`, base `f2aa234` + this
PR) via a DOM probe; "before" and "after" were captured in the same session (no cross-session/S13.0
comparison). Screenshots were not embedded (the in-app browser can't commit binaries); every metric is
reproducible from the running preview.

## Governance — before → after (the major restructure)

Governance stacked **7 large always-open zone panels** (policies, boundaries, permissions, prompts, audit,
risks, incidents) below the 4 KPIs. Restructured to the brief: **4 status KPIs + the risk register stay
visible** (current status + attention area); the **supporting reference** (policies, boundaries,
permissions, protected prompts, audit) and the **incident log** now open on demand in two collapsed
`<details>`. **Nothing removed** — all 7 zone `data-testid`s preserved; every badge/policy/prompt/
permission/incident is still in the DOM and searchable.

| Viewport | Height before | Height after | Δ | Overflow after |
|---------|---:|---:|---:|:---:|
| 1440 | 4,773px | **961px** | **−80%** | 0 |
| 1024 | 6,006px | **984px** | **−84%** | 0 |
| 768 | 8,706px | **1,507px** | **−83%** | 0 |
| 390 | 19,208px | **2,981px** | **−84%** | 0 |

| Density (1440) | Before | After |
|---|---|---|
| Always-open zone panels | 7 | **2** (KPIs region + risk register) |
| Disclosures | 1 | **3** (more-metrics + reference + incident log) |
| Badges/chips in DOM | 66 | 66 (unchanged — **disclosed, not deleted**; far fewer *visible* at a glance) |
| Top-level KPIs | 4 | 4 (unchanged) |

Governance is no longer "a wall of equally-important cards": status (KPIs) → attention (risk register) →
supporting reference (on demand). No production-compliance certification is implied (honest draft/pending
policy state retained: "— עד אישור", "אף מדיניות אינה מאושרת אוטומטית").

## Analytics — before → after

Analytics was already well-structured post-PR-A (tabbed views, one primary `MetricChart`, an existing
secondary-insights `<details>`, and the metrics-auditor findings surfaced inline). Its one on-brief issue
was the wide filter bar. PR B **compacts the filter toolbar** (padding `space-4→3`, gap `space-4→2`) —
**every filter preserved** — leaving the hierarchy (exec KPIs + one primary chart + tabbed/disclosed
secondary) intact.

| Viewport | Height before | Height after | Overflow after |
|---------|---:|---:|:---:|
| 1440 | 1,425px | 1,421px | 0 |
| 1024 | 1,368px | 1,390px | 0 |
| 768 | 1,538px | 1,530px | 0 |
| 390 | 2,076px | 2,060px | 0 |

Analytics height is ~equal (it was already ≈1.4 screens); the filter bar is visually lighter. No chart
redesign was attempted (correctly out of scope — the chart engine stays untouched).

## Charts / KPIs / cards — reduced or regrouped

- **Governance:** 7 always-open zone panels → **2 visible + 5 disclosed** across 2 new `<details>`; 4 KPIs
  unchanged; no chart added/removed.
- **Analytics:** filter bar compacted; primary `MetricChart` and tab/disclosure structure unchanged; no
  chart redesign (deferred — chart-engine work is not in this PR's scope).

## Functionality preserved

- Governance: all 7 zones present (tests assert each `data-testid`); policy state, permission matrix,
  protected-prompt contract, risk lifecycle, incident actions, and the auditor findings all intact and
  reachable. Analytics: all 5 filters, the table/graph toggle, CSV export, report tabs, drilldown, and the
  metrics auditor preserved. No `NO_OP` or disabled-looking-enabled control introduced (0 dead controls).
  Demo/live honesty, empty/loading/error states, route titles, dark mode, and responsive nav unchanged.

## Accessibility & responsive

- **0 document overflow** at 1440 / 1024 / 768 / 390 on both pages.
- **0 console errors** across the sweep.
- `<details>`/`<summary>` are native, keyboard-operable, and screen-reader-friendly; status colours are
  paired with text labels (not colour-alone); RTL preserved.
- CI a11y / network-resilience / cross-browser gates are authoritative and run on this PR.

## Validation (local)

Build ✅ · typecheck ✅ · typecheck:tests ✅ · analytics + governance + router + nav suites **178/178** ✅ ·
oxlint ✅ (no new) · responsive **0 overflow @ 4 widths** ✅ · **0 console errors** · 0 dead controls · full
`vitest` (only the 12 known `tests/platform/*` Rolldown file-load failures — pre-existing, CI-authoritative).
No `test.skip` / `test.fail` / weakened assertions.

## Remaining visual weaknesses (honest)

- Analytics still carries 5 filters + tab controls; a future pass could group filters behind a single
  "מסננים" popover, but that risked the tab/test structure and was left for later.
- Governance badge **count** in the DOM is unchanged (by design — disclosure, not deletion); a later pass
  could convert some info-badges to plain text.
- Chart redesign (Gantt, KpiCard delta/sparkline) remains **PR B-charts / future** — not attempted here.

## Scope note

**No AI Workspace (PR C) work is included.** No agent-action, memory, Supabase, migration, Production, or
remote-AI changes. Focused commits: analytics filter compaction · governance progressive disclosure ·
(no shared primitive needed) · evidence.
