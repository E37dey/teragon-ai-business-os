# TERAGON Business Graph — Internal Business Query Pack (Phase 7)

An internal, typed, **evidence-backed** use-case layer that answers real Teragon business questions by
composing the Phase 6/6.1 read-only traversal service. Source: `src/graph/query/**`. **Not wired into app
runtime, no UI, no HTTP API, no agent/Copilot access.** It never mutates and never opens a protected body.

## The rule that shapes everything

Every business query **goes through `BusinessGraphTraversalService`** — it does not read the store, does
not re-implement BFS, does not bypass traversal security, and does not open protected payload bodies. The
query layer is pure composition + typed reason codes + honest readiness over what traversal already
security-filtered.

## Service surface — `BusinessGraphQueryService`

9 methods, each `(request, ctx) => Promise<BusinessQueryResult>`:

| # | Query | Traversal op(s) | What it answers |
|---|-------|-----------------|-----------------|
| 1 | `findCustomersNeedingFollowUp` | `getNeighbors` | customers with an authoritative open task / open opportunity; each finding carries the evidence path for *why* |
| 2 | `findUnansweredQuotations` | `getNeighbors` | quotations in an eligible status, aged past a deterministic `asOf − N` cutoff; linked customer/opportunity/task evidence |
| 3 | `findRecurringServiceIssues` | `getNeighbors` ×2 | service tickets grouped through `customerPrinter`/`printerModel`; counts + paths, **no ticket bodies** |
| 4 | `findDelayedEnrollments` | `getNode` (+ `getNeighbors`) | enrollments behind schedule — **only** when progress/due-date facts exist (else honest readiness) |
| 5 | `assessPrinterModelSupportImpact` | `calculateImpact` | printers/customers/tickets/tasks affected by a model, **direct vs indirect**; no invented consequences |
| 6 | `findSupersededEvidence` | `findConflicts` | evidence replaced via `SUPERSEDES`; **current vs historical** |
| 7 | `findRecommendationConflicts` | `findConflicts` | recommendations in a **registered** `CONTRADICTS`/incompatible authoritative state; **no semantic inference** |
| 8 | `findTasksFromApprovedRecommendations` | `calculateImpact` | tasks reachable via recommendation → **named-human approval** → generated task; unapproved never qualifies |
| 9 | `buildFullEvidencePath` | `findPath` | a bounded, permission-filtered, provenance-labelled path; protected bodies stay unopened |

## Types (8)

`BusinessGraphQueryService`, `BusinessQueryRequest` (zod at the boundary), `BusinessQueryResult`,
`BusinessQueryFinding`, `BusinessQueryEvidence`, `BusinessQueryCapability`, `BusinessQueryReadiness`,
`BusinessQueryPolicy` (plus supporting `BusinessQueryAuditRecord`, `BusinessEntityReference`,
`BusinessQuerySourceConfidence`, and the reason-code / relationship-kind enums).

## Every finding carries the full contract

`BusinessQueryFinding` includes: `organizationId`, `snapshotId`, `graphHealth`, `stale`,
`queryExecutionId`, `subject` + `relatedEntities` (business entity references), typed `reasonCodes`,
`supportingPaths`, `evidence`, `provenanceSummary`, `authoritySummary`, `approvalStateSummary`,
`relationshipKind` (**DIRECT vs INDIRECT**), `truncated`, `policyVersion`, and `sourceConfidence`
(present **only** when a canonical approved source field exists — see EVIDENCE doc). No natural-language
fact absent from the graph, and **no invented AI confidence**, ever appears.

## No fabrication

- No natural-language facts that are not in the graph.
- No AI confidence scores. Confidence is surfaced only when it already exists as a canonical, approved
  **source** field (`BusinessQuerySourceConfidence` keeps `sourceRef` + `sourceField`).
- `bodyOpened` on every evidence item is the literal `false` — the layer cannot open a protected body.

## Time

An injected query clock (`now: () => string`); each request resolves an explicit `asOf` + thresholds.
**No hidden `Date.now`** — `policy.ts` does date arithmetic on the *supplied* instant only. Every result
records the applied `BusinessQueryPolicy` (`policyVersion`, resolved `asOf`, `thresholdDays`, `cutoff`,
`cutoffMode: "calendar-day"`).

## Security (inherits all traversal rules, plus)

- **No aggregate count reveals hidden entities** — findings are assembled only from what traversal
  returns *after* its own security filtering; `counts` are derived strictly from the assembled findings,
  so an inaccessible node is gone before any total (test: a hidden service ticket drops the recurring
  count 3→2 and never enters entity totals).
- **Organization isolation** is mandatory.
- **Stale** findings require the Phase-6.1 stale authorization (`allowStale` + HUMAN/SYSTEM actor +
  oracle `canUseStaleGraph`); otherwise STALE/DEGRADED is denied.
- Every query **audits both** the business query (`BusinessQueryAuditRecord`, own `executionId`, policy,
  readiness, counts, health/stale) **and** the underlying traversal ops (their `audit` records are
  collected into `result.traversalAudits`, linked via `traversalExecutionIds`). No duplicate sensitive
  logging (queries carry no free text; traversal keeps search text as hash/class only).

See: [QUERY_READINESS](BUSINESS_GRAPH_QUERY_READINESS.md) · [QUERY_EVIDENCE](BUSINESS_GRAPH_QUERY_EVIDENCE.md)
· [TRAVERSAL](BUSINESS_GRAPH_TRAVERSAL.md) · [PHASE7_TEST_REPORT](BUSINESS_GRAPH_PHASE7_TEST_REPORT.md).
