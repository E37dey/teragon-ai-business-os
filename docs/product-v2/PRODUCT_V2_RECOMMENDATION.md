# Product V2 Recommendation (S13.0)

Synthesis of the S13.0 re-audit. Target feel: **a calm enterprise AI OS** — not *every feature visible
at once*. Evidence in the companion docs. This checkpoint is **audit/architecture only**; the PRs below
are proposed, not executed.

## Strongest 10 things already in TERAGON (keep and build on)

1. **Honesty doctrine is real** — engines ban `Math.random`; charts render `"טרם נמדד"` not fake zeros.
2. **Deterministic, no-cost AI** — `LocalRulesProvider`, `remoteEnabled:false`; no paid dependency.
3. **Genuine approval gates** — `fixer.apply-correction`/`flow.automation-proposal` are idempotent, duplicate-blocked, human-gated.
4. **A best-in-class chart already exists** — MetricChart (units, drilldown, table alternative, honest empty).
5. **The "alive" agent machinery exists** — real run lifecycle + event timeline + orchestrator-dispatch graph (just hidden).
6. **0-overflow responsive canvas + correct RTL** across 32 routes.
7. **Structured, auditable results** — `AgentActionResult` with evidence, 5-part `why`, `correlationId`, `engineLabel`.
8. **Real local persistence** — IndexedDB memory with append-only versions and import/export audit jobs.
9. **RLS-first + fail-closed architecture** (ADR 0001/0002) — a sound production spine.
10. **Command Center already goes full-width** (`HideShellRail`) — the right layout instinct to extend.

## Weakest 10 things (fix)

1. **Dashboard-within-dashboard** — `/governance` 5,917px, `/analytics` 4,496px tall.
2. **Badge/status inflation** — 66 / 61 / 34 simultaneous badges; nothing reads as important.
3. **Agents feel dead** — 14 stateless buttons; the live timeline is one hidden click away and seeded empty.
4. **Two disjoint agent subsystems** that never connect (actions vs. collaboration graph).
5. **Obsidian memory over-promises** — nav says "Obsidian"; there is **no** vault/filesystem connection.
6. **Expensive, duplicative left rail** — restates page data or shows placeholder filler; eats horizontal space.
7. **Uniform "4-KPI" template padding** on pages that don't need it (incl. list pages).
8. **Long, mixed navigation** — 28 items; Analytics buried under "Submission", Governance under "local demo".
9. **Weak/placeholder analytics feel** — most "analytics-looking" pages have **zero** charts, only badges/tiles.
10. **Dead visual affordances** — KpiCard delta-chip + sparkline render only showcase data in production.

## Pages: keep / merge / demote / hide

- **KEEP (16):** `/`, `/customers`, `/customers/:id`, `/automations`, `/agents`, `/memory`, `/analytics`
  (primary); `/crm`, `/contacts`, `/sales`, `/service`, `/printers`, `/organizations`, `/tasks`,
  `/knowledge`, `/system-health` (simplified).
- **MERGE (2):** `/documents` → `/sales`; `/agents/collaboration` → `/agents` (unified **AI Workspace**).
- **DEMOTE (12) → Advanced/Learning/System:** `/courses`, `/learning`, `/governance`, `/implementation`,
  `/personas`, `/stage-gates`, `/training-materials`, `/quick-start`, `/faq`, `/support`, `/administration`, `/settings`.
- **HIDE from primary nav (2):** `/submission`, `/submission/presentation` (reachable; not everyday).

## UI elements to remove

- **`DefaultRail`** placeholder (`OsShell.tsx:45-61`) — never show filler.
- **Duplicative permanent rails** (Customers, Customer Detail, System Health) → fold unique datum into page.
- **KpiCard delta-chip + embedded sparkline** where unwired → drop props until real deltas exist.
- **Decorative header clock**; keep a single date.
- **Badge walls** → convert most info-badges to text / one rolled-up status.
- Gate **`/design`** showcase out of any shipped nav.

## Charts to replace

- **REDESIGN** GanttTimeline (add time axis + legend + tooltip, or REPLACE_WITH_TABLE).
- **REPLACE_WITH_KPI** the KpiCard delta/sparkline (wire real MoM deltas from `revenueByMonth`, else remove).
- Standardize new visualizations on the MetricChart pattern. **No new chart library needed.**

## Target navigation (6 groups)

1. **Command Center** — `/`, `/analytics`
2. **Customers & Contacts** — `/crm`, `/customers`, `/contacts`, `/organizations`, `/sales`(+documents)
3. **AI Agents & Workspace** — `/agents` (unified), `/automations`
4. **Knowledge & Memory** — `/knowledge`, `/memory`
5. **Operations** — `/tasks`, `/service`, `/printers`, `/system-health`
6. **System / Advanced** — `/settings`, `/administration`, `/governance` + nested **Learning** & **Submission**

## AI visibility improvements (PR C)

Unify actions + collaboration into one **AI Workspace**; route every action through a run/event recorder
(reuse `agentRuns`/`agentEvents`); derive one live per-agent state (IDLE/RUNNING/WAITING_APPROVAL/
COMPLETED/FAILED); always-on record-derived activity feed; on-demand evidence/tools/memory inspector.
**Never fake events.**

## Verdicts

- **Obsidian:** *(corrected S13.7)* a **manual, functional import/export bridge is connected** (Obsidian-compatible Markdown/ZIP, governed); **no live vault sync**. Storage is IndexedDB.
- **Prime Agent:** feasibility **~4.5/10 for this academic project** — MIT, powerful, but **no native
  Windows** (needs WSL2/Docker), **requires a paid provider**, and is **explicitly not a sandbox**. POC-only,
  deferred to **PR F**, gated on the security boundary. High *product* potential (8/10) later.
- **Agent Loop:** recommend **Option B** (Prime-Agent-*inspired* bounded loop, native/free/Windows-safe)
  built on Option A's deterministic actions as steps — **PR E**.

## Target 2026 wireframes (spec L)

Each page: one context/title, **≤4** information-driven KPIs, **one** primary content area, **one** obvious
action, secondary info in an **on-demand** drawer.

**1. Command Center** — H: "מרכז הפיקוד". KPIs: revenue (MoM delta), open leads, service SLA, tasks due (4).
Primary: one revenue trend (sparkline+value) + a compact "needs attention" list. Action: open the top item.
Secondary: funnel/priority in a drawer. *Removed:* 56→~15 icons, 17→~6 panels, badge clutter.

**2. Customers** — H: "לקוחות". KPIs: total, incomplete, top-revenue, awaiting-reply (4, real). Primary:
**the table** (dominant). Action: open a customer. Secondary: filters/insights in a drawer. *Removed:*
duplicative rail, 24 stat nodes → 4, most badges.

**3. AI Workspace** (`/agents`, merges collaboration) — H: "סביבת עבודת AI". Top strip: agents · running ·
awaiting-approval · actions-today (record-derived). Primary: selected agent's action area + result card.
Action: run an action / approve a gated one. Secondary: evidence/tools/memory inspector + always-on
activity feed. *Removed:* the separate collaboration page; stateless-button feel.

**4. Agent Run Detail** — H: "ריצת סוכן · <id>". KPIs: status, steps, duration, records-touched (4).
Primary: the **run timeline** (Hunter→scanned→found→sent) + dispatch graph. Action: approve/cancel (kill
switch). Secondary: raw evidence + correlationId. *Removed:* nothing new — this surfaces existing records.

**5. Knowledge & Memory** — H: "ידע וזיכרון (מקומי)". KPIs: notes, sources, unresolved links, last import (4).
Primary: search + LinkGraph. Action: search / import / export. Secondary: note detail drawer. *Removed:*
"Obsidian" live-integration promise (honest rename).

**6. Automations** — H: "אוטומציות". KPIs: active, queued, awaiting-approval, run-today (4). Primary: rules
list with state. Action: run / approve. Secondary: run summary drawer. *Removed:* duplicative rail; padded KPIs.

**7. Analytics** — H: "דוחות וניתוחים". KPIs: ≤4 headline metrics with deltas. Primary: **one** MetricChart
(the chosen metric) + table alternative. Action: pick metric → drill to records. Secondary: comparison /
extra metrics as small-multiples in a drawer. *Removed:* 4,496px stack → ~2 screens; 78 buttons / 61 badges cut.

**8. System Health** — H: "בריאות המערכת". KPIs: attention, failed, pending, blocked (4). Primary: a single
ranked issues table. Action: open an issue. Secondary: last-snapshot detail drawer. *Removed:* the
rail-vs-KPI duplication and the 34-badge wall.

## Estimated implementation phases (evidence-based sequence)

| PR | Title | Scope | Cost/Windows | Depends on |
|----|-------|-------|--------------|------------|
| **A** | Visual declutter + rail reduction | Delete `DefaultRail`; rails→on-demand drawer; kill badge walls; de-pad KPI strips; header clock out; nav → 6 groups; demote/hide 14 routes | Free · Windows-native | — |
| **B** | Professional analytics/charts | Redesign Gantt (axis/legend/tooltip); wire real KpiCard deltas or drop; collapse `/analytics` & `/governance` to ≤2 screens w/ small-multiples + ranked tables | Free · Windows-native | A |
| **C** | AI Workspace + visible execution timeline | Unify actions+collaboration; run/event recorder; live per-agent state; always-on activity feed; inspector | Free · Windows-native | A |
| **D** | Memory reality: honest rename + (scoped) real adapter | Rename off "Obsidian"; wire `noopMemorySearchPort`→real memory search; optionally File-System-Access vault behind a flag | Free (rename) · adapter later | C |
| **E** | Bounded Agent Loop (Option B) | Local loop controller over deterministic actions: max-steps/time, kill switch, capability allowlist, approval-before-mutation, full audit | Free · Windows-native | C |
| **F** | Prime Agent POC — **conditional** | Real RPC/`AgentSession` in WSL2 + security gate; provider required | **Paid · WSL2/Linux** | E + positive re-check |

**Exact first implementation PR: PR A — visual declutter + contextual-rail reduction + navigation
rationalization** (highest impact, zero cost, no risk to tests/data, directly answers the user's rejection).

## Recommendation

Ship **A → B → C → D → E** as free, local, Windows-native, honesty-preserving PRs; treat **F** as an
optional, sandboxed, provider-cost POC only after a positive re-check. This converts TERAGON from a dense
feature-grid into a calm AI Business OS whose agents are visibly, honestly alive — without acquiring cost,
an unsandboxed runtime, or a single fabricated capability.
