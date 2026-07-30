# TERAGON Business Graph — Query Readiness & Data Gaps (Phase 7)

Honesty layer for the business query pack. Source of truth: the `BUSINESS_QUERY_CAPABILITIES` registry in
`src/graph/query/capabilities.ts` — one entry per query with its baseline readiness against the 15-entity
spine **as shipped** and, as **structured data** (`missingFacts`), every missing node/edge/metadata fact
required for full support. No entry claims `SUPPORTED` by fabricating data.

## Readiness states

`SUPPORTED` · `PARTIALLY_SUPPORTED` · `INSUFFICIENT_GRAPH_DATA` · `BLOCKED_BY_PERMISSION` ·
`BLOCKED_BY_HEALTH` · `UNSUPPORTED`.

A query returns an honest readiness when a required fact is missing — it does **not** guess. In particular:
delayed enrollment is never inferred from enrollment age; recurring issues need stable
printer/customer/service relationships; unanswered quotations need an explicit status + deterministic
cutoff; recommendation conflicts need a registered contradiction / incompatible authoritative state (never
semantic AI inference).

## Baseline readiness against the spine as shipped

| Query | Readiness | Why |
|-------|-----------|-----|
| `findCustomersNeedingFollowUp` | **SUPPORTED** | authoritative open opportunity/task prove the need (the fixture task→customer link is INFERRED, so surfaced only under `includeInferred`, kept labelled) |
| `findUnansweredQuotations` | **SUPPORTED** | `quotation.status` + `createdAt` exist; an eligible-status quotation aged past `asOf − N` is flagged |
| `findRecurringServiceIssues` | **INSUFFICIENT_GRAPH_DATA** | no edge ties a `serviceTicket` to the `customerPrinter`/`printerModel`, so tickets can't be grouped to detect recurrence |
| `findDelayedEnrollments` | **INSUFFICIENT_GRAPH_DATA** | enrollment envelope carries only `paymentStatus` — no progress / due-date; delay never inferred from age |
| `assessPrinterModelSupportImpact` | **INSUFFICIENT_GRAPH_DATA** | `USES` is oriented printer→model, so `calculateImpact(model)` has no outbound edges to propagate |
| `findSupersededEvidence` | **SUPPORTED** | `SUPERSEDES` + lifecycle metadata label current vs historical |
| `findRecommendationConflicts` | **SUPPORTED** | detection works; spine ships no `CONTRADICTS` edge → 0 findings (no inference permitted) |
| `findTasksFromApprovedRecommendations` | **INSUFFICIENT_GRAPH_DATA** | no approved `APPROVED_BY` hop carrying a named-human approver; `GENERATED_TASK` originates at `agentRun`, not the recommendation |
| `buildFullEvidencePath` | **SUPPORTED** | bounded permission-filtered provenance-labelled path |

Each `INSUFFICIENT_GRAPH_DATA` query is proven `SUPPORTED` in tests on a **synthetic augmented fixture**
that adds exactly the missing edge/fact — demonstrating the query logic is correct and the blocker is
data, not code.

## Missing graph facts discovered (per query)

Lifted verbatim from `capabilities.ts` `missingFacts` — the concrete graph additions each query needs for
full spine support:

- **findCustomersNeedingFollowUp** — `task.dueDate` (no SLA field), `task.followUpType`,
  `customer.lastContactedAt`.
- **findUnansweredQuotations** — `quotation.sentAt` (age is from `createdAt`), `quotation.lastCustomerResponseAt`.
- **findRecurringServiceIssues** — **edge `serviceTicket→customerPrinter`**, **edge `serviceTicket→printerModel`**,
  `serviceTicket.faultCode`/`category` (a fault taxonomy to define "recurring" beyond raw count).
- **findDelayedEnrollments** — `enrollment.progress`/`stageProgress` (stages live inside `Enrollment.stages`,
  not projected on the node), `enrollment.dueDate`/`expectedCompletionAt`, `enrollment.expectedStage`.
- **assessPrinterModelSupportImpact** — **outbound `printerModel→customerPrinter` / AFFECTS edge**;
  operational-consequence fields (downtime/severity — never invented).
- **findSupersededEvidence** — `evidence.supersededAt` (current-vs-historical is inferred from edge
  direction only; no explicit transition timestamp).
- **findRecommendationConflicts** — registered `aiRecommendation ⇄ aiRecommendation CONTRADICTS` edges
  (must be explicit; inference is forbidden).
- **findTasksFromApprovedRecommendations** — `APPROVED_BY.approvalState = approved`, an approval→named-human
  approver reference, and an `aiRecommendation→task` edge (`GENERATED_TASK` originates at `agentRun`).
- **buildFullEvidencePath** — none (fully spine-supported).

These are the concrete backlog items to raise the four `INSUFFICIENT_GRAPH_DATA` queries to `SUPPORTED`
in a future derivation phase.
