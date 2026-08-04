# TERAGON — Page Keep / Merge / Move / Hide / Remove Matrix (S11.1-A)

**Documentation-only proposal.** No route is removed or hidden in this checkpoint.
Guiding rule: **hiding a screen from nav never deletes its schema, domain data, or
tested repository code.** Base @ `eade083`.

## Decision per route

| Route | Decision | Rationale (evidence) |
|-------|----------|----------------------|
| `/` | **KEEP_PRIMARY** | Command center; working approval flow + KPIs |
| `/customers` | **KEEP_PRIMARY** | LIVE_VALIDATED |
| `/sales` | **KEEP_PRIMARY** | Core revenue workflow, tested |
| `/service` | **KEEP_PRIMARY** | Core ops workflow, tested |
| `/tasks` | **KEEP_PRIMARY** | Cross-cutting daily task, tested |
| `/submission` | **KEEP_PRIMARY** | Academic submission hub (grading-critical) |
| `/submission/presentation` | **KEEP_PRIMARY** | The deliverable deck — but **fix overflow @≤768** first |
| `/crm` | **KEEP_SECONDARY** | Overlaps customers; keep under a Customers area |
| `/contacts` | **KEEP_SECONDARY** | LIVE but reachable via customer detail + CRM |
| `/customers/:id` | **KEEP_SECONDARY** | Detail; already hidden from nav, reachable |
| `/courses` | **KEEP_SECONDARY** | Tested demo domain, lower frequency |
| `/organizations` | **KEEP_SECONDARY** | Tested demo domain, reference data |
| `/analytics` | **KEEP_SECONDARY** | Computed reports; supports other areas |
| `/administration` | **KEEP_SECONDARY** | Admin, low frequency |
| `/system-health` | **KEEP_SECONDARY** | Diagnostics, low frequency |
| `/settings` | **KEEP_SECONDARY** | Settings, low frequency |
| `/implementation` | **KEEP_SECONDARY** | Rollout content (submission material) |
| `/stage-gates` | **KEEP_SECONDARY** | Evidence content |
| `/training-materials` | **KEEP_SECONDARY** | Training content |
| `/faq` | **KEEP_SECONDARY** | FAQ content |
| `/documents` | **MERGE_WITH_OTHER_PAGE** | Overlaps `/sales` ("הצעות מחיר"); fold in as a tab |
| `/printers` | **MERGE_WITH_OTHER_PAGE** | Belongs with `/service` (printer service catalog) |
| `/quick-start` | **MERGE_WITH_OTHER_PAGE** | Fold into `/faq` (onboarding + Q&A) |
| `/support` | **MERGE_WITH_OTHER_PAGE** | Fold into `/faq` (post-launch help) |
| `/personas` | **MERGE_WITH_OTHER_PAGE** | Fold into `/training-materials` |
| `/agents` | **MOVE_TO_AI_LAB** | DETERMINISTIC_DEMO; group all AI under one lab |
| `/agents/collaboration` | **MOVE_TO_AI_LAB** | Make a tab inside the Agents lab |
| `/automations` | **MOVE_TO_AI_LAB** | DETERMINISTIC_DEMO |
| `/memory` | **MOVE_TO_AI_LAB** | AI-adjacent; keep tested data layer |
| `/knowledge` | **MOVE_TO_AI_LAB** | AI-adjacent |
| `/learning` | **MOVE_TO_AI_LAB** | DETERMINISTIC_DEMO |
| `/governance` | **MOVE_TO_AI_LAB** | AI governance belongs with AI |

## Totals

| Decision | Count |
|----------|:-----:|
| KEEP_PRIMARY | **7** |
| KEEP_SECONDARY | **13** |
| MERGE_WITH_OTHER_PAGE | **5** |
| MOVE_TO_AI_LAB | **7** |
| HIDE_UNTIL_CONNECTED | **0** |
| REMOVE_DEAD_UI | **0** |
| **Total** | **32** |

**HIDE_UNTIL_CONNECTED = 0** and **REMOVE_DEAD_UI = 0** are deliberate, evidence-backed
findings: no route is dishonest enough to require hiding (every AI page is labelled
demo/local), and no route is dead (all render, zero console errors, no no-op controls).
Merges/moves are **navigation grouping**, not deletion — routes and code remain.

## Proposed top-level information architecture (≈6 areas + AI Lab + more)

1. **מרכז השליטה** — `/`
2. **לקוחות (CRM)** — customers · contacts · crm · organizations · analytics
3. **מכירות ומסמכים** — sales (+documents tab)
4. **שירות והדרכה** — service (+printers) · courses · tasks
5. **AI Lab** — agents (+collaboration tab) · automations · memory · knowledge · learning · governance
6. **הטמעה והגשה** — implementation · personas → training-materials · stage-gates · faq (+quick-start/support) · submission · presentation
7. **עוד / ניהול** — administration · system-health · settings

This reduces ~11 flat/loosely-grouped entries to **6 primary areas + an AI Lab + a
"more/admin" area**, matching the 5–7 top-level target while preserving access to every
capability.
