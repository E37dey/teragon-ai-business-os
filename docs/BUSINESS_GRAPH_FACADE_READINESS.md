# TERAGON Business Graph — Facade Capability & Readiness (Phase 8)

`getCapabilities()` and `getQueryReadiness()` surface the honest state of all 9 queries at the application
boundary, straight from the Phase-7 `BUSINESS_QUERY_CAPABILITIES` registry — **no store read, no synthetic
augmentation, no upgrade**. Source: `src/graph/application/facade.ts` (`capabilityViews`).

## Structural readiness (post Phase-9 enrichment)

| Query | Structural readiness |
|-------|----------------------|
| findCustomersNeedingFollowUp | **SUPPORTED** |
| findUnansweredQuotations | **SUPPORTED** |
| findSupersededEvidence | **SUPPORTED** |
| findRecommendationConflicts | **SUPPORTED** |
| buildFullEvidencePath | **SUPPORTED** |
| findRecurringServiceIssues | **SUPPORTED** (Phase 9) |
| findDelayedEnrollments | **SUPPORTED** (Phase 9) |
| assessPrinterModelSupportImpact | **SUPPORTED** (Phase 9) |
| findTasksFromApprovedRecommendations | **SUPPORTED** (Phase 9) |

Phase 9 lifted the last four to **structurally SUPPORTED** via additive canonical facts + derivation +
inbound traversal (see [CANONICAL_ENRICHMENT](BUSINESS_GRAPH_CANONICAL_ENRICHMENT.md)) — **not** by
synthetic fixture data. `getCapabilities`/`getQueryReadiness` evaluate structural capability against the
registries. When a caller invokes a structurally-supported query whose *records* still lack the required
canonical facts, the query returns an honest instance-level `INSUFFICIENT_GRAPH_DATA` rather than a
fabricated result.

## Missing facts as safe metadata

Each capability view carries any residual missing facts as **typed safe metadata** (entity/edge/field
descriptions) — never repository internals, file paths, or sensitive detail. After Phase 9 the four
enriched queries report an empty `missingFacts` structurally; their instance-level gaps (a ticket without
`customerPrinterId`/`faultCategory`, an enrollment without stage due dates, a task without
`sourceRecommendationId`, an approval not decided by a human) surface as instance `INSUFFICIENT_GRAPH_DATA`.

`getStatus()` reports only safe facade state (enabled, constructed, disposed) and never reads the store or
resolves identity. `getCapabilities`/`getQueryReadiness` require a resolved identity (access-gated) but
perform no store read.

## Readiness states

`SUPPORTED` · `PARTIALLY_SUPPORTED` · `INSUFFICIENT_GRAPH_DATA` · `BLOCKED_BY_PERMISSION` ·
`BLOCKED_BY_HEALTH` · `UNSUPPORTED` — plus the facade-level `QUERY_NOT_READY` result code when a caller
invokes a query whose data prerequisites are unmet.
