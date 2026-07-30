# TERAGON Business Graph — Facade Capability & Readiness (Phase 8)

`getCapabilities()` and `getQueryReadiness()` surface the honest state of all 9 queries at the application
boundary, straight from the Phase-7 `BUSINESS_QUERY_CAPABILITIES` registry — **no store read, no synthetic
augmentation, no upgrade**. Source: `src/graph/application/facade.ts` (`capabilityViews`).

## Baseline (spine as shipped)

| Query | Readiness |
|-------|-----------|
| findCustomersNeedingFollowUp | **SUPPORTED** |
| findUnansweredQuotations | **SUPPORTED** |
| findSupersededEvidence | **SUPPORTED** |
| findRecommendationConflicts | **SUPPORTED** |
| buildFullEvidencePath | **SUPPORTED** |
| findRecurringServiceIssues | **INSUFFICIENT_GRAPH_DATA** |
| findDelayedEnrollments | **INSUFFICIENT_GRAPH_DATA** |
| assessPrinterModelSupportImpact | **INSUFFICIENT_GRAPH_DATA** |
| findTasksFromApprovedRecommendations | **INSUFFICIENT_GRAPH_DATA** |

The facade reports these verbatim. It does **not** use synthetic fixture data to upgrade readiness — the
four `INSUFFICIENT_GRAPH_DATA` queries stay honestly unsupported until real canonical data provides the
missing facts, at which point running such a query returns `QUERY_NOT_READY` rather than a fabricated
result.

## Missing facts as safe metadata

Each capability view carries the required missing graph facts as **typed safe metadata** (entity/edge/
field descriptions) — never repository internals, file paths, or sensitive detail. Summary (full list in
[QUERY_READINESS](BUSINESS_GRAPH_QUERY_READINESS.md)):

- **findRecurringServiceIssues** — serviceTicket→customerPrinter / →printerModel edges + a fault taxonomy.
- **findDelayedEnrollments** — enrollment progress / due-date / expected-stage facts.
- **assessPrinterModelSupportImpact** — an outbound printerModel→customerPrinter (AFFECTS) edge.
- **findTasksFromApprovedRecommendations** — an approved `APPROVED_BY` hop with a named-human approver + an
  aiRecommendation→task edge.

`getStatus()` reports only safe facade state (enabled, constructed, disposed) and never reads the store or
resolves identity. `getCapabilities`/`getQueryReadiness` require a resolved identity (access-gated) but
perform no store read.

## Readiness states

`SUPPORTED` · `PARTIALLY_SUPPORTED` · `INSUFFICIENT_GRAPH_DATA` · `BLOCKED_BY_PERMISSION` ·
`BLOCKED_BY_HEALTH` · `UNSUPPORTED` — plus the facade-level `QUERY_NOT_READY` result code when a caller
invokes a query whose data prerequisites are unmet.
