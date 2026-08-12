# Full Product Re-Audit (S13.0)

Audit-first. Every one of the **32 routes** inspected against the running build (base `3168dad`,
1440px primary; spot-checked 1024/768/390) and source. The user rejected the current density and
"AI-Business-OS" clarity; this audit takes that as valid signal and does not defend the build because
QA passed. Companion docs: VISUAL_DENSITY_AUDIT, CHART_REDESIGN_MATRIX, NAVIGATION_V2, AI_WORKSPACE_V2,
OBSIDIAN_MEMORY_REALITY, PRIME_AGENT_FEASIBILITY, AGENT_LOOPS_ARCHITECTURE, PRODUCT_V2_RECOMMENDATION.

## A. Route decision matrix (all 32)

**AI TRUTH legend:** `DET` = deterministic local rules · `NONE` = no AI · `STATIC` = static content.
**DATA legend:** `R` = real/derived from repositories · `S` = static/bootstrapped · `MIX`.
**Decision:** KEEP_PRIMARY · KEEP_SIMPLIFIED · MERGE · MOVE_TO_ADVANCED · HIDE_FROM_PRIMARY_NAV · REMOVE_DEAD_UI.

| # | Route | Purpose (1 reason) | Primary action | Data | AI | Duplication | Decision |
|---|-------|--------------------|----------------|:---:|:---:|-------------|----------|
| 1 | `/` | At-a-glance business state | Triage → drill in | R | DET | — | **KEEP_PRIMARY** (cut icon/panel noise; 56 SVG→fewer) |
| 2 | `/crm` | Lead/customer hub | Work a lead | R | NONE | overlaps 3/4/6 | **KEEP_SIMPLIFIED** |
| 3 | `/customers` | Customer list | Open a customer | R | NONE | rail restates table | **KEEP_PRIMARY** (remove dup rail + KPI padding) |
| 4 | `/contacts` | Contact list | Open a contact | R | NONE | placeholder rail | **KEEP_SIMPLIFIED** (delete DefaultRail) |
| 5 | `/customers/:id` | One customer 360 | Act on customer | R | DET(memory tab) | rail restates header | **KEEP_PRIMARY** (remove dup rail) |
| 6 | `/sales` | Quotes/pipeline | Advance a quote | R | NONE | overlaps 12 | **KEEP_SIMPLIFIED** |
| 7 | `/courses` | Training catalog | Track learning | R | NONE | learning content | **MOVE_TO_ADVANCED** (Learning) |
| 8 | `/service` | Service tickets | Resolve a ticket | R | NONE | — | **KEEP_SIMPLIFIED** (Operations) |
| 9 | `/printers` | Printer/model registry | Manage a printer | R | NONE | domain-specific | **KEEP_SIMPLIFIED** (Operations) |
| 10 | `/organizations` | Org accounts | Open an org | R | NONE | — | **KEEP_SIMPLIFIED** (Customers grp) |
| 11 | `/tasks` | Tasks/meetings | Complete a task | R | NONE | — | **KEEP_SIMPLIFIED** (Operations) |
| 12 | `/documents` | Docs & quotes | Open/generate doc | R | NONE | overlaps 6 (quotes) | **MERGE → /sales** |
| 13 | `/automations` | Automation rules | Run/queue automation | R | DET | — | **KEEP_PRIMARY** (AI Workspace grp) |
| 14 | `/agents` | The 7 AI agents | Run an agent action | R | DET | see 15 | **KEEP_PRIMARY → AI Workspace** |
| 15 | `/agents/collaboration` | Orchestration graph/timeline | Watch a run | R | DET | separate from 14 | **MERGE → /agents** (unify, see AI_WORKSPACE_V2) |
| 16 | `/memory` | Local memory + import/export | Import/export/search | R (IndexedDB) | DET(lexical) | rail is useful | **KEEP_PRIMARY** (rename off "Obsidian"; see OBSIDIAN_MEMORY_REALITY) |
| 17 | `/knowledge` | Knowledge base | Find/answer | R | DET | rail = rollups | **KEEP_SIMPLIFIED** (rail→drawer) |
| 18 | `/learning` | Improvement center | Review improvements | R | NONE | learning | **MOVE_TO_ADVANCED** (Learning) |
| 19 | `/analytics` | Reports/trends | Read a metric → drill | R | NONE | — | **KEEP_PRIMARY** (promote to CC grp; **heavy** simplify 4,496px) |
| 20 | `/governance` | AI governance/control | Review controls | MIX | STATIC | badge wall | **MOVE_TO_ADVANCED** (System; **heavy** simplify 5,917px) |
| 21 | `/implementation` | Adoption plan (Gantt) | Track adoption | S | STATIC | plan content | **MOVE_TO_ADVANCED** (Learning; Gantt redesign) |
| 22 | `/personas` | Training personas | Pick a path | R | NONE | training | **MOVE_TO_ADVANCED** (Learning) |
| 23 | `/stage-gates` | Adoption gates | Check a gate | R | NONE | training | **MOVE_TO_ADVANCED** (Learning) |
| 24 | `/training-materials` | Training assets | Open material | R | NONE | training | **MOVE_TO_ADVANCED** (Learning) |
| 25 | `/quick-start` | Onboarding guide | Follow steps | STATIC | NONE | reference | **MOVE_TO_ADVANCED** (Learning) |
| 26 | `/faq` | FAQ/objections | Look up an answer | STATIC | NONE | reference | **MOVE_TO_ADVANCED** (Learning) |
| 27 | `/support` | Post-launch support | Check SLA/support | R | NONE | reference | **MOVE_TO_ADVANCED** (Learning/Adoption) |
| 28 | `/administration` | System admin | Admin action | R | NONE | — | **MOVE_TO_ADVANCED** (System) |
| 29 | `/system-health` | Ops health | Spot a problem | R | DET | rail + badges restate KPIs | **KEEP_SIMPLIFIED** (Operations; kill badge wall) |
| 30 | `/settings` | App settings | Change a setting | R | NONE | — | **MOVE_TO_ADVANCED** (System) |
| 31 | `/submission` | Academic evidence hub | Read evidence | STATIC | NONE | submission | **HIDE_FROM_PRIMARY_NAV** (Submission) |
| 32 | `/submission/presentation` | Demo slides | Present | STATIC | NONE | submission | **HIDE_FROM_PRIMARY_NAV** (Submission) |

**Plus, non-route UI:** `/design` showcase (dev-only, outside shell) — keep dev-only, gate from shipped
nav (**REMOVE_DEAD_UI** from prod surface); **`DefaultRail`** placeholder (`OsShell.tsx:45-61`) —
**REMOVE_DEAD_UI**; **KpiCard delta-chip + embedded sparkline** where unwired — **REMOVE_DEAD_UI**.

### Decision totals

| Decision | Count | Routes |
|----------|:---:|--------|
| KEEP_PRIMARY | 7 | 1,3,5,13,14,16,19 |
| KEEP_SIMPLIFIED | 9 | 2,4,6,8,9,10,11,17,29 |
| MERGE | 2 | 12→6, 15→14 |
| MOVE_TO_ADVANCED (demote) | 12 | 7,18,20,21,22,23,24,25,26,27,28,30 |
| HIDE_FROM_PRIMARY_NAV | 2 | 31,32 |
| REMOVE_DEAD_UI | 3 UI elements | DefaultRail · KpiCard delta/spark · `/design` prod-gate |

> **Roll-up (for the everyday product):** KEEP = **16** · MERGE = **2** · DEMOTE = **12** · HIDE = **2**.
> No domain/repository code is deleted — demotion/hiding is nav-level; all routes stay reachable.

## B. Visual density (summary — full detail in VISUAL_DENSITY_AUDIT)

Measured 1440×900: `/governance` **5,917px / 66 badges**, `/analytics` **4,496px / 78 buttons / 61
badges**, `/system-health` **34 badges**, `/` **56 SVG / 32 stat nodes**, `/customers` (a list) **24 stat
/ 27 badges**. Biggest problems: dashboard-within-dashboard (governance/analytics), badge/status
inflation, uniform "4-KPI" template padding, expensive duplicative left rail, long mixed navigation.
The data itself is honest (no `Math.random`; charts refuse fake trends) — the failure is **too many
honest elements competing**, so the fix is consolidation + progressive disclosure, not deletion.

## C. Charts (summary — full detail in CHART_REDESIGN_MATRIX)

8 primitives, all hand-rolled SVG/CSS (no chart lib). **6 real/derived, 2 static, 0 random.** KEEP 6
(Sparkline, MetricChart, LinkGraph, Run-Task-Graph, MiniBarRow, ConfidenceBar); **REDESIGN 1**
(GanttTimeline — static plan dates, no axis/legend/tooltip); **REPLACE_WITH_KPI 1** (KpiCard delta/
sparkline — dead in production); **REMOVE 0**. MetricChart is the model to standardize on (units,
drilldown, table alternative, honest empty).

## F. AI reality (summary — full detail in AI_WORKSPACE_V2)

Two disjoint agent subsystems. The 14 headline actions are **stateless buttons** (no run record, no
history, no inter-agent awareness); the genuinely "alive" graph+timeline is **real but sequestered** on
`/agents/collaboration`, seeded empty, gated behind one hardcoded demo scenario. `RemoteAIProvider` is
flag-gated off. **Verdict: the product does not visibly/continuously show agents doing connected work.**
Fix = unify the subsystems into one **AI Workspace** with record-derived live state and an always-on
activity timeline (PR C).

## G. Obsidian memory (summary — full detail in OBSIDIAN_MEMORY_REALITY)

**OBSIDIAN MEMORY NOT CONNECTED.** No vault, no filesystem, no `.md` writes; storage is browser
**IndexedDB**; agent-side memory search is a **noop** (`wikiAgent.ts:54`). Classification LOCAL_ONLY. The
code is honest about it; the **nav label over-promises**. Fix = rename now, real adapter later (PR D).
