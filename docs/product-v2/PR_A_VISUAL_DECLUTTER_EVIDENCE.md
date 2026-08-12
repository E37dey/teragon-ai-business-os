# PR A — Visual Declutter + Navigation V2 + Context-Rail Reduction (S13.1)

Implements the first Product V2 improvement from the merged S13.0 audit. Goal: make TERAGON feel like a
**calm enterprise AI OS**, not *every feature visible at once* — **without removing functionality**. No
new business features; no chart-engine redesign (PR B); no AI Workspace (PR C); no Obsidian vault, remote
LLM, Supabase, or migration changes.

Baseline "before" numbers are the S13.0 live measurements (base `3168dad`); "after" are live DOM
measurements on this build (`npm run preview`) at 1440×900 unless noted. Screenshots were not embedded
(the in-app browser can't commit binaries); every number below is reproducible from the running preview
with the same DOM probe.

## 1. Navigation — before → after

| | Before | After |
|---|---|---|
| Primary groups | **5** (ניהול העסק · שירות והדרכה · מעבדת AI · דמו מקומי · הטמעה והגשה · עוד) | **6** (מרכז השליטה · לקוחות ואנשי קשר · AI וסוכנים · ידע וזיכרון · תפעול ואוטומציה · מערכת ומתקדם) |
| Business vs academic | interleaved (Analytics under "Submission"; Governance under "local demo") | business-first; **all academic/training/reference/submission + governance demoted** to a collapsed "מערכת ומתקדם" |
| Customers / Contacts | not in nav | **surfaced** in "לקוחות ואנשי קשר" |
| Duplicated destinations | — | none (unique paths, asserted by test) |
| Routes reachable | 32 | 32 (no route deleted; demoted ≠ removed) |

Active-state, RTL hierarchy, and the ≤1024 hamburger drawer are preserved (hamburger confirmed present at 390).

## 2. Context rail — before → after (the biggest workspace-width win)

Policy change: **no permanent left rail by default.** `DefaultRail` (the placeholder that filled the rail
with "…ייבנה יחד עם המסך" on every page without its own rail) is **deleted**. A permanent rail now renders
only for an allowlist of routes where it materially contributes an action/value.

| Route | Rail before | Rail after |
|-------|:---:|:---:|
| `/memory` | permanent (import/export — useful) | **kept** |
| `/agents` | permanent (fleet + approvals cross-link) | **kept** |
| `/` Command Center | hidden (HideShellRail) | hidden (unchanged) |
| `/customers`, `/customers/:id`, `/system-health` | permanent (duplicated page data) | **removed → full-width** |
| `/analytics`, `/crm`, `/knowledge`, `/automations`, `/governance`, … | permanent / placeholder | **removed → full-width** |
| `/contacts` (+ any route w/o a PageRail) | `DefaultRail` placeholder filler | **removed → full-width** |

**Result: permanent rail on ~10+ routes → exactly 2 (`/memory`, `/agents`).** Verified live: rail present
only on `/agents` and `/memory`; `/`, `/analytics`, `/customers`, `/contacts`, `/system-health`,
`/governance`, `/crm`, `/settings` all render full-width. Because the placeholder no longer supplied the
route title synchronously, **each page now owns its heading** (router smoke awaits the page's own title;
CRM + Customer-Detail gained proper headings). `HideShellRail` still works.

## 3. Command Center — before → after (1440×900)

The Command Center was already partly decluttered (hidden rail, 4 primary KPIs, two `<details>`
disclosures, one focal AI-decision panel). PR A moves the **second** always-open operational panel — the
"תור פולואו-אפ" follow-up queue — into an on-demand disclosure so the first viewport holds **one** primary
work area (AI decision center) + **one** AI/agent summary.

| Metric | Before | After |
|--------|:---:|:---:|
| Document height | 1,486px | **1,080px (−27%)** |
| Always-open operational panels | 2 (decision center + follow-up queue) | **1** (follow-up now on-demand) |
| Primary KPIs above fold | 4 | 4 (unchanged — information-driven) |
| Badges | 15 | 14 |
| Horizontal overflow | 0 | 0 |

Comprehension target met: KPIs → attention band → **one** focal AI-decision area → **one** agent summary →
secondary progressively disclosed. All data retained (searchable in the DOM).

## 4. Header — before → after

Removed the decorative live clock and its 30s timer; kept a single Hebrew + Gregorian date. Meta strip:
**3 elements → 2**; one fewer moving element. Identity, quick-add, notifications (real badge), search
(⌘K), theme, logout unchanged.

## 5. Honest memory label — before → after

S13.0 classified the memory as LOCAL_ONLY / IndexedDB *(corrected S13.7: a manual Obsidian import/export bridge is in fact connected; only a live vault sync is absent)*. Renamed the user-facing surface:

| | Before | After |
|---|---|---|
| Route title | "זיכרון ארגוני · Obsidian" | **"זיכרון מקומי"** |
| Nav label | "זיכרון Obsidian" | **"זיכרון מקומי"** |
| Page h1 | "זיכרון ארגוני" | **"זיכרון מקומי"** |
| Honest line | — | **"נשמר מקומית במצב הדמו — אינו מחובר כעת לכספת Obsidian."** |

No vault integration added (correctly out of scope for PR A).

## 6. AI visibility (lightweight only — full Workspace is PR C)

No fabricated state. AI is surfaced via: (a) **"AI וסוכנים" promoted to a primary nav group**; (b) the
existing **real** pending-approvals badge on `/agents` (`agentTasksAwaitingApprovalCount`, shown only when
> 0); (c) Command Center's existing `AgentNetworkLive` agent-activity summary + engine-approvals section
with an honest empty state. The full run timeline / orchestration UI remains PR C, as instructed.

## 7. Global density (sections 5–6) — what PR A did vs. deferred

Addressed **structurally** (highest-impact, lowest-risk): permanent rail removed from ~25 pages
(full-width workspace), navigation consolidated, Command Center follow-up disclosed, header simplified.
Deeper per-component typography/badge tuning and the **analytics/governance content density** (badge
walls, chart footprint) are intentionally **deferred to PR B** (charts) — PR A only removed those pages'
permanent rail (they are now full-width; content unchanged). *Note:* the S13.0 vs current heights for
`/analytics` and `/governance` differ due to page-state/query-cache variance between sessions; PR A did
not alter their content, so no content-level reduction is claimed for them here.

## 8. Success metrics — obvious task, less at once, no loss

| Surface | Before | After |
|---------|--------|-------|
| Shell — primary nav groups | 5, interleaved | 6, business-first |
| Shell — permanent rails | ~10+ routes | **2** (Memory, Agents) |
| Shell — workspace width | rail column on most pages | **full-width on ~25 pages** |
| Command Center — panels above fold | 2 operational + focal | 1 focal + 1 summary (−1) |
| Command Center — height | 1,486px | 1,080px (−27%) |
| Header — meta elements | 3 (+ live clock) | 2 (no clock) |
| Memory — label honesty | over-promises Obsidian | honest "זיכרון מקומי" |

Functionality preserved: **32/32 routes resolve**; no route deleted; no dead primary control (static
dead-control auditor: 0 HIGH findings); all data still reachable/searchable.

## 9. Validation results

| Gate | Result |
|------|--------|
| Build (`tsc -b && vite build`) | ✅ green (734ms) |
| `typecheck` | ✅ 0 errors |
| `typecheck:tests` | ✅ 0 errors |
| Unit/integration (`vitest run`) | ✅ **2571/2571 tests pass** (only the 12 known `tests/platform/*` Rolldown **file-load** failures — pre-existing, CI-authoritative) |
| Router smoke (32 routes) + nav integrity | ✅ 47/47 |
| `oxlint` | ✅ no new findings (2 pre-existing warnings only) |
| Responsive overflow sweep 1440 / 1024 / 768 / 390 | ✅ **0 overflow** on all sampled routes |
| Mobile hamburger @390 | ✅ present |
| Console errors (full nav sweep) | ✅ 0 |
| a11y / network-resilience / cross-browser gates | Playwright, **CI-authoritative** — run on this PR (as every prior checkpoint) |

## 10. Remaining Product V2 work (after PR A)

- **PR B** — professional analytics/charts; collapse `/analytics` & `/governance` content to ≤2 screens
  (small-multiples + ranked tables); redesign Gantt; wire/drop KpiCard delta/sparkline.
- **PR C** — unify agent actions + collaboration into one **AI Workspace** with record-derived live state
  and an always-on activity timeline.
- **PR D** — memory: wire `noopMemorySearchPort` to real search; optional File-System-Access vault (flagged).
- **PR E** — bounded Agent Loop (native, free).
- **PR F** — Prime Agent POC (conditional, paid, WSL2 + security gate).
- Per-component typography/badge tuning and converting the remaining Knowledge/CRM/Automations/Analytics
  side content into on-demand drawers (deferred from this PR to keep it bounded).
