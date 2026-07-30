# TERAGON Business Graph — Internal Application Facade (Phase 8)

ONE internal application boundary that safely composes the graph layers. Source: `src/graph/application/**`.
**Default OFF, read-only, internal.** Not wired into app runtime, no UI, no HTTP, no agents, no Copilot.
Product modules must not construct `GraphIndexStore` / `BusinessGraphTraversalService` /
`BusinessGraphQueryService` independently — they go through this facade.

## Surface — `BusinessGraphApplicationFacade`

The **9 approved business queries** (`findCustomersNeedingFollowUp`, `findUnansweredQuotations`,
`findRecurringServiceIssues`, `findDelayedEnrollments`, `assessPrinterModelSupportImpact`,
`findSupersededEvidence`, `findRecommendationConflicts`, `findTasksFromApprovedRecommendations`,
`buildFullEvidencePath`), each `(context) => Promise<BusinessGraphFacadeResult>`, plus:

- `getStatus(): BusinessGraphFacadeStatus` — safe status; never touches the store or resolves identity.
- `getCapabilities(ctx)` / `getQueryReadiness(ctx)` — honest readiness for all 9 (no store read, no augmentation).
- `dispose(): Promise<void>` — idempotent; releases a lazily-opened store handle. Phase 8 starts no subscriptions.

**Never exposed:** the raw `GraphIndexStore`, active snapshot bodies, the unrestricted traversal service,
any graph mutation, activation/recovery controls, protected payloads. Results are the safe mapped view
only (findings' `bodyOpened` is a constant `false`).

## Contracts (9)

`BusinessGraphApplicationFacade`, `BusinessGraphFacadeFactory`, `BusinessGraphRequestContext`,
`BusinessGraphIdentityResolver`, `BusinessGraphFeaturePolicy`, `BusinessGraphFacadeStatus`,
`BusinessGraphFacadeResult`, `BusinessGraphCapabilityResult`, `BusinessGraphApplicationError`.

## Composition / dependency graph

`BusinessGraphFacadeFactory.create(config)` explicitly injects into the facade:

```
BusinessGraphFacadeFactory.create
  ├─ featurePolicy         (from flag.ts — resolveFacadeEnabled)
  ├─ identityResolver      (BusinessGraphIdentityResolver adapter)
  ├─ permissionAdapter     (BusinessGraphPermissionAdapter → GraphPermissionOracle)
  ├─ storeProvider         (BusinessGraphStoreProvider — lazy getStore()/dispose())
  ├─ auditSink             (BusinessGraphAuditSink adapter)
  ├─ clock                 (BusinessGraphClock — injected; system clock at the boundary only)
  ├─ executionIdProvider   (shared across facade + query + traversal → distinct ids per layer)
  └─ buildQueryService     (store → BusinessGraphTraversalService → BusinessGraphQueryService)
```

No service locator, no module-level mutable singletons, no hidden global identity, no hidden `Date.now`,
**no automatic background work on import**. The `GraphIndexStore` is opened **lazily on the first query
only** (`ensureQueryService` → `storeProvider.getStore()`), so a disabled or status-only facade never
touches IndexedDB.

## Single secure execution path

Every facade query runs, in order:

1. **feature check** — OFF ⇒ build NOTHING, resolve NOTHING, touch NO store → `DISABLED`.
2. **identity resolution** — via the resolver only (below).
3. **organization validation** — org comes only from the resolver; every targeted node id must belong to
   that org (a request-supplied org/subject in another org → `ORGANIZATION_MISMATCH`).
4. **graph health check** — CORRUPT/MISSING → typed safe error; STALE/DEGRADED needs resolved stale grant.
5. **capability / readiness check** — an INSUFFICIENT/unsupported query → `QUERY_NOT_READY`.
6. **`BusinessGraphQueryService`** — the one query path (never the store/traversal directly, never
   duplicated logic, totals never computed before permission filtering, protected bodies never fetched).
7. **safe result mapping** — preserves graph health, stale state, readiness, evidence paths, provenance,
   authority, approval state, truncation, snapshotId, policyVersion.
8. **correlated audit completion** — see AUDIT below.

See: [IDENTITY_ADAPTER](BUSINESS_GRAPH_IDENTITY_ADAPTER.md) · [FACADE_SECURITY](BUSINESS_GRAPH_FACADE_SECURITY.md)
· [FACADE_READINESS](BUSINESS_GRAPH_FACADE_READINESS.md) · [PHASE8_TEST_REPORT](BUSINESS_GRAPH_PHASE8_TEST_REPORT.md).
