# TERAGON Business Graph — Query Readiness & Data Gaps (Phase 7, updated Phase 9)

Honesty layer for the business query pack. Source of truth: `BUSINESS_QUERY_CAPABILITIES` +
`evaluateStructuralReadiness()` in `src/graph/query/capabilities.ts`. **Phase 9 separates structural
capability from instance data** (see below); after the canonical enrichment, all 9 queries are
structurally **SUPPORTED**, and honesty is preserved by returning instance-level `INSUFFICIENT_GRAPH_DATA`
when the *records themselves* lack required canonical facts.

## Readiness states

`SUPPORTED` · `PARTIALLY_SUPPORTED` · `INSUFFICIENT_GRAPH_DATA` · `BLOCKED_BY_PERMISSION` ·
`BLOCKED_BY_HEALTH` · `UNSUPPORTED`.

## Structural vs instance (Phase 9)

- **SUPPORTED + []** — the contracts/derivation support the query, but no matching records exist.
- **INSUFFICIENT_GRAPH_DATA** — relevant records exist, but required canonical facts are missing/incomplete.
- **PARTIALLY_SUPPORTED** — only part of the requested scope can be proven safely.
- **UNSUPPORTED** — required contracts or registered relationships do not exist.

Structural readiness is evaluated against the ENTITY/EDGE **registries** — never against whether a given
fixture happens to contain an edge. A query still returns an honest instance-level readiness when a
required fact is missing — it does **not** guess (delayed enrollment is never inferred from age; recurrence
never groups by free-text; conflicts need a registered relationship, never AI inference).

## Structural readiness (all 9, post-enrichment)

| Query | Structural | Instance-level `INSUFFICIENT` when… |
|-------|-----------|--------------------------------------|
| `findCustomersNeedingFollowUp` | **SUPPORTED** | — |
| `findUnansweredQuotations` | **SUPPORTED** | — |
| `findRecurringServiceIssues` | **SUPPORTED** (Phase 9) | tickets exist but lack `customerPrinterId`/`faultCategory` |
| `findDelayedEnrollments` | **SUPPORTED** (Phase 9) | enrollments exist but carry no stage `due`/status facts |
| `assessPrinterModelSupportImpact` | **SUPPORTED** (Phase 9) | — (empty impact is an honest empty answer) |
| `findSupersededEvidence` | **SUPPORTED** | — |
| `findRecommendationConflicts` | **SUPPORTED** | — |
| `findTasksFromApprovedRecommendations` | **SUPPORTED** (Phase 9) | no approved-HUMAN approval hop present |
| `buildFullEvidencePath` | **SUPPORTED** | — |

The four Phase-9 queries are proven SUPPORTED against a graph **derived from canonical records** carrying
the new fields (not hand-built synthetic edges). The Phase-9 canonical/derivation changes are in
[CANONICAL_ENRICHMENT](BUSINESS_GRAPH_CANONICAL_ENRICHMENT.md); the original gap analysis (retained for
history) follows.

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
