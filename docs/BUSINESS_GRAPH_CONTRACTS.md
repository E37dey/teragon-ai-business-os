# TERAGON Business Graph — Contracts (Phase 2)

**Branch:** `feature/teragon-business-graph`. **Scope:** typed contracts, registries, Zod schemas, and
unit tests **only**. No storage, indexing, traversal, graph service, APIs, UI, agent integration,
migrations, Copilot, or deployment. The graph is a **derived, read-only** contract layer over the
canonical repositories and must **never become a second CRM**.

The contracts are a **standalone module** (`src/graph/**`) — deliberately **not imported by any app
runtime code** in Phase 2, so the built bundle and E2E behavior are unchanged.

## Module layout

```
src/graph/
  contracts/
    identity.ts    — GraphEntityType, GraphNodeId/EdgeId, GraphEntityRef, buildNodeId/parseNodeId
    node.ts        — BusinessGraphNode (envelope-safe), ProtectedPayloadReference
    edge.ts        — 22-type relationship union, provenance/authority, BusinessGraphEdge
    references.ts  — legacy "kind:id"/embedded/name reference classifier (never silently converts)
    security.ts    — GraphViewerContext, PermissionDecision, SensitivityPolicy, TraversalLimits, AuditContext
  registry/
    entityRegistry.ts — closed Record<GraphEntityType, EntityRegistryEntry> (exhaustive)
    edgeRegistry.ts   — EDGE_REGISTRY (30 entries)
    coreV1Spine.ts    — CORE_V1_ENTITY_SPINE (15) + priority relationships
  index.ts         — public barrel
tests/graph/       — 37 unit tests (6 files)
```

## Public surface (barrel `@/graph`)

- **Identity:** `GRAPH_ENTITY_TYPES`, `GraphEntityType`, `GraphNodeId`, `GraphEdgeId`, `GraphEntityRef`,
  `buildNodeId`, `parseNodeId`, `isArrayPositionId`, `classifyOrganization`, `GraphIdentityError`,
  `graphEntityRefSchema`, `graphNodeIdSchema`.
- **Node:** `BusinessGraphNode`, `ProtectedPayloadReference`, `GRAPH_SENSITIVITIES`,
  `GRAPH_HIDDEN_SENSITIVITIES`, `businessGraphNodeSchema`, `protectedPayloadReferenceSchema`.
- **Edge:** `GraphRelationshipType` (22), `GraphProvenance`, `GraphAuthority`, `GraphEdgeStaleState`,
  `BusinessGraphEdge`, `edgeIsAuthoritative`, `businessGraphEdgeSchema`.
- **References:** `LegacyReferenceKind`, `ReferenceResolutionStatus`, `parseKindIdRef`,
  `classifyReference`, `referenceMayBeAuthoritative`.
- **Security:** `GraphViewerContext`, `GraphPermissionDecision`, `denyByDefault`,
  `GraphSensitivityPolicy`, `mayRevealBody`, `GraphTraversalLimits`, `GraphAuditContext`,
  `humanApproverGuard`, `GraphSecurityError`.
- **Registries:** `ENTITY_REGISTRY`, `assertEntityRegistryExhaustive`, `EDGE_REGISTRY`,
  `CORE_V1_ENTITY_SPINE`, `CORE_V1_PRIORITY_RELATIONSHIPS`.

## Counts

| | |
|---|---|
| Entity types (closed union) | **37** (permission + stageProgress excluded; PrinterModel/CustomerPrinter and agentRun/agentEvent kept separate) |
| Relationship types (closed union) | **22** |
| Entity-registry entries | **37** (exhaustive, compile-time checked) |
| Edge-registry entries | **30** |
| Core-v1 entity spine | **15** |
| Unit tests | **37** (all green); full Vitest **1743** passing |

## The four discipline rules the contracts encode (from Discovery)

1. **Stable identity from canonical identity** — `teragon://{organizationId}/{entityType}/{entityId}`;
   never a name, array position, denormalized field, or mutable slug. `organizationId` is required;
   records without a valid org are **reported unmappable**, never assigned `org-teragon`.
2. **Provenance ≠ authority** — an INFERRED/FOREIGN_KEY_DERIVED edge can never be CANONICAL; a PROPOSED
   edge can never be authoritative until approved.
3. **Sensitive bodies never ride in the envelope** — `BusinessGraphNode` holds only safe metadata; a
   sensitive body is reachable only via a separate `ProtectedPayloadReference` (a pointer, no content).
4. **Deny-by-default security** — a node being connected does not make it visible.

See the companion docs: [IDENTITY](BUSINESS_GRAPH_IDENTITY.md), [ENTITY_REGISTRY](BUSINESS_GRAPH_ENTITY_REGISTRY.md),
[EDGE_REGISTRY](BUSINESS_GRAPH_EDGE_REGISTRY.md), [SECURITY_CONTRACTS](BUSINESS_GRAPH_SECURITY_CONTRACTS.md),
[PHASE2_TEST_REPORT](BUSINESS_GRAPH_PHASE2_TEST_REPORT.md).
