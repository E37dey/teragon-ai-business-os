# TERAGON Business Graph — Implementation Plan (Phase 1 Discovery)

Proposed later phases. **Nothing here is implemented in Phase 1** — no contracts, storage, APIs,
traversal, UI, agent integration, or migration code exists yet. This is the boundary map to review
before any code is written. Grounded in the audits
([`ENTITY_MAP`](BUSINESS_GRAPH_ENTITY_MAP.md), [`EDGE_MAP`](BUSINESS_GRAPH_EDGE_MAP.md),
[`SECURITY_MODEL`](BUSINESS_GRAPH_SECURITY_MODEL.md)).

## Guiding principles (from Discovery)

1. **Derived, read-only index — never a second CRM.** Canonical repositories remain the single source
   of truth. The graph is a projection: `canonical mutation → domain event → graph index update →
   validation → audit`. The graph must never accept a direct write of business data.
2. **Provider-neutral behind an interface** so a server graph DB can replace the local IndexedDB index
   later without touching product modules.
3. **Honesty preserved:** first-class `unresolved` / `broken` / `superseded` / `provisional` edge
   states (never silent drops); `confidence:null ⇒ "טרם נמדד"`; approval-gated edges tagged provisional
   until a named human approves.
4. **Security is a hop-time gate, not a post-filter** (org + role + agent-view + sensitivity + lifecycle).

---

## Phase 2 — Graph contracts (types only, no logic)
Define the closed typed model: `BusinessGraphNode`, `BusinessGraphEdge` (with the 22-type closed
`relationshipType` union from EDGE_MAP §1), `GraphNodeReference`, `GraphEvidenceReference`,
`GraphTraversalRequest/Result`, `GraphPath`, `GraphPathStep`, `GraphImpactResult`, `GraphConflict`,
`GraphSnapshot`, `GraphIndexJob`. Node fields per brief (`id, organizationId, entityType, entityId,
title, status, sensitivity, ownerId, createdAt, updatedAt, version, searchableText, metadata`); edge
fields (`…, relationshipType, direction, confidence, evidence, createdBy, validFrom, validUntil,
approvalState, version`). **Boundary:** types + zod schemas + unit tests only.

## Phase 3 — Node/edge factory (derivation rules)
A pure mapping from each canonical record → node, and each field/link → edge, applying the discipline
the audit demands: discriminate same-collection polymorphism (`recordKind`/`memoryLayer`/`source`);
parse `"kind:id"` strings and **existence-check** targets; resolve embedded-array `stageId` targets;
prefer id FKs over denormalized names; tag org, sensitivity, lifecycle, and `approvalState` on every
node/edge. Emit `unresolved`/`broken` edges rather than dropping. **Boundary:** pure functions + fixture
tests; no storage.

## Phase 4 — Derived indexing & storage (Local Demo Mode = IndexedDB)
Event-driven incremental index over the repositories: `incremental update`, `deterministic full
rebuild`, `schema versioning`, `idempotent indexing`, `recovery`, `orphan detection`, `broken-edge
detection`, `stale-edge detection`. The index is rebuildable from canonical data at any time. Interface
`GraphIndexStore` so a server graph DB can be swapped in. **Boundary:** index + rebuild + validation;
still no traversal API or UI.

## Phase 5 — `BusinessGraphService` (traversal)
`getNode`, `getNeighbors`, `findPath`, `findRelatedEvidence`, `calculateImpact`, `findConflicts`,
`searchGraph`, `getTimeline`, `rebuildEntity`, `rebuildOrganizationGraph`, `validateGraph`. Enforce the
SECURITY_MODEL at every hop: **organization boundary required**, permission + agent-view filtering
required, max depth / nodes / paths, timeout, cancellation, visited-set cycle handling, **no unlimited
recursion**. Every `GraphPath` returns nodes + relationships + evidence + source versions + permissions
applied + limitations + traversal method. Every query calls `writeAudit(action:"graph.query")`.

## Phase 6 — Evidence paths & impact & conflict
- **Evidence path** ("fly to evidence"): resolve an answer to the exact source records + their version +
  approved/superseded/expired status; show a *path* when multiple sources contribute; "לא נמצא מקור
  מאושר שמספיק למענה" when none is authoritative.
- **Impact analysis** (`calculateImpact`): e.g. "what breaks if a printer model is marked unsupported"
  — traverse `USES`/`SUPPORTED_BY` back-edges within limits.
- **Conflict detection**: surface existing `MemoryConflict`/`KnowledgeConflict`/agent `CONTRADICTS`
  edges (e.g. Hunter vs Fixer product disagreement).

## Phase 7 — Agent integration (bounded, propose-only)
Give each of the 7 agents its `canAgent`-derived view window (SECURITY_MODEL §8). Agents may **query**
the graph and **propose** new edges (as `MemoryProposal`/draft edges → ApprovalEngine), but may never
create/approve sensitive or authoritative edges without a named human. Orchestrator plans bounded
multi-agent queries and detects conflicts.

## Phase 8 — Product UI (secondary investigation tool, not a graph-first CRM)
A `/business-graph` route (entity search · selected-entity summary · related-records-by-relationship ·
path explorer · evidence viewer · conflict viewer · impact · timeline · permissions explanation), plus
**contextual** "Show relationships" / "Open evidence path" actions inside Customer 360, Service,
Printers, Sales, Agents Collaboration, Knowledge, Memory, and Command Center decisions. **Keep the
Light Enterprise Hybrid design; no cinematic 3D galaxy in normal workflows** (a graph animation may
exist only in a dedicated demo mode). Do not replace tables/workflows with a visualization.

## Phase 9 — Migration & tests
- **Migration** addresses the ENTITY_MAP risk register: normalize `"kind:id"` strings, reconcile
  denormalized names, resolve embedded-array `stageId` targets, fix the `org-teragon` inconsistency,
  and map string keys → record ids — **without mutating canonical data** (the index absorbs the
  normalization).
- **Tests** (per brief): node/edge creation, incremental update, full rebuild, idempotency, orphan/
  stale/ambiguous detection, traversal-depth & cycle & cancellation limits, permissions, org isolation,
  sensitive & archived & superseded exclusion, agent scope, impact, conflict, audit creation; plus the
  end-to-end chain Customer → Printer → Service Ticket → Knowledge Article → Fixer Recommendation →
  Human Approval → Task → Command Center update. Gates: lint/TS/tests green, production build, no client
  secret, no graph-data leakage, zero serious/critical axe.

## Hard boundaries for every later phase
`AI_REMOTE_ENABLED=false` (LocalRulesProvider only) · no browser AI-provider calls · no API keys in
config/bundle · no graph data or source-code/Graphify paths in the client bundle · canonical
repositories never replaced · no deployment · **stop for human review at each phase gate.**
