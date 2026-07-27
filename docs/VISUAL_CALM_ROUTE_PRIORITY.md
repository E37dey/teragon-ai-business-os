# Visual Calm — Route Information Priority

Every visible data block is classified: **PRIMARY** (needed for the current workflow, permanently visible) · **SECONDARY** (useful context → drawer/expansion) · **ANALYTICAL** (reporting → analytics / "מדדים נוספים") · **AUDIT** (evidence/history/technical → on demand). Nothing is deleted — only re-leveled. No item stays permanently visible merely because it already exists.

## Pilot routes (fully specified)

### /courses
- **PRIMARY**: learner summary · 3 progress phases · active-phase steps · current task · instructor action (approve/return) · instructor feedback · learner record summary · ≤4 KPIs (ממתינים לבדיקת מדריך, לומדים הדורשים מעקב, מפגשים בשבעת הימים הקרובים, התקדמות במסלולים).
- **SECONDARY → "תובנות והמשך" drawer**: system recommendation · next-stage preparation detail · future meetings · learner list (on narrow).
- **ANALYTICAL → "מדדים נוספים"**: total registrations · total active courses · general completion stats.
- **AUDIT**: per-stage evidence · submission history.

### /crm
- **PRIMARY**: customer table + filters · selected-record actions.
- **SECONDARY (drawer)**: customer detail · activity.
- **ANALYTICAL**: summary KPIs (quiet, ≤4).
- **AUDIT**: interaction/evidence trail.

### /service
- **PRIMARY**: ticket queue · selected ticket · diagnosis + technician workflow · SLA state.
- **SECONDARY (drawer)**: ticket history.
- **ANALYTICAL**: queue KPIs (≤4).
- **AUDIT**: evidence, part/repair records.

### /agents
- **PRIMARY**: current agent state · pending approvals · emergency controls (grouped, not per-row).
- **SECONDARY (drawer)**: per-agent detail.
- **ANALYTICAL**: usage/cost (honest "טרם נמדד").
- **AUDIT**: errors · run/audit log.

### /governance
- **PRIMARY**: policies · risks · approvals; critical risk gets semantic emphasis.
- **SECONDARY (drawer/tab)**: policy detail; draft policies stay neutral.
- **ANALYTICAL**: governance counts.
- **AUDIT**: audit trail on demand.

### /analytics
- **PRIMARY**: neutral charts (one accent series) · table alternative.
- **SECONDARY**: drill-down.
- **ANALYTICAL**: this route may show grouped, quiet metrics (dashboard exception).
- **AUDIT**: method + last-check provenance.

## Remaining routes (framework — detailed during VC-C…VC-G)

| Route | PRIMARY | SECONDARY→drawer | ANALYTICAL | AUDIT |
|-------|---------|------------------|------------|-------|
| `/` command center | actionable decisions, pending approvals | agent network (subdued unless active) | secondary analytics | audit |
| `/customers/:id` | identity + next action; section tabs | non-active sections | rollup metrics | memory/evidence |
| `/sales` | pipeline / current opportunity | recommendations + evidence panel | financials (neutral until action) | deal history |
| `/documents` | document list + selected | preview/detail | counts | version/audit |
| `/tasks` | work queue + filters + ownership | task detail | — (no decorative KPI strip) | history |
| `/printers` | fleet table · condition · service status · maintenance timeline | device detail | fleet metrics | service log |
| `/organizations` | identity · contacts · active agreements · tasks · documents | secondary history (tabs) | rollups | audit |
| `/memory` `/knowledge` `/learning` | record nav + selected content + governance state | graph (only when useful) | counts | provenance/audit |
| `/automations` | current state + pending approvals | detail | usage | run log |
| `/implementation` `/personas` `/stage-gates` `/training-materials` `/quick-start` `/faq` | primary content | detail | progress metrics | — |
| `/submission` | blockers first; pending-human = amber; complete-not-approved = neutral | deliverable detail | completeness metrics | evidence |
| `/administration` | tables + permission workflow; emergency actions separated | user detail | — | audit |
| `/system-health` | neutral healthy state; color only when degraded/failed; method + last check | component detail | trends | check history |
| `/settings` | grouped settings | advanced (disclosure) | — | change log |
| presentation | keep presentation hierarchy; no dense app chrome | — | — | — |

## VC-A status
VC-A applies the **global calm color/glow/border/type system** to all routes at once. The PRIMARY/SECONDARY re-leveling (KPI reduction, drawers, nesting) is per-route work in VC-C…VC-G, tracked here and in the scorecard.
