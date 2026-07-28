# TERAGON Business Graph — Derivation (Phase 3)

**Pure, deterministic** transformation of canonical records into `BusinessGraphNode` / `BusinessGraphEdge`
contract objects. Source: `src/graph/derivation/**`. **No persistence, index, event subscriptions,
incremental updates, traversal, service, APIs, UI, agents, migrations, or Copilot.** The derivation is a
**standalone, pure module** — not wired into app runtime, so the bundle and E2E are unchanged. Functions
never read a repository or the clock.

## Functions

| Function | Purpose |
|---|---|
| `deriveGraphNode(record, entityType, context)` | → `{ node?, issues, unmappable? }` (one node) |
| `deriveGraphEdges(record, entityType, lookup, context)` | → `{ edges, issues }` (a record's outbound edges) |
| `deriveEntityGraph(record, entityType, lookup, context)` | → `GraphDerivationResult` (node + its edges) |
| `deriveOrganizationGraphSnapshot(records, context)` | → `GraphDerivationResult` (full snapshot for one org; builds its own lookup over the supplied records) |
| `validateDerivedGraph(snapshot)` | → `GraphDerivationResult` (re-checks orphans, duplicates, dangling endpoints, sensitivity leakage) |

`lookup` is a caller-supplied existence/eligibility oracle (`exists`/`get`) — derivation never touches a
repository itself. `GraphDerivationContext` carries `{ organizationId, registryVersion,
sourceSnapshotVersion, allowOrgInheritance? }` — **no clock, no randomness**.

## `GraphDerivationResult`

`nodes · edges · issues · unmappableRecords · duplicateEdges · orphanReferences · stats ·
registryVersion · sourceSnapshotVersion`. `stats` (`GraphDerivationStats`) counts nodes-by-type,
edges-by-type/provenance/authority, issues-by-severity, unmappable, duplicateEdges, orphanReferences.

## Determinism (guaranteed; unit-tested)

- **Node ids** via `buildNodeId` → `teragon://{org}/{entityType}/{entityId}`.
- **Edge ids** via `buildEdgeId` from stable values ONLY: `organizationId + sourceNodeId +
  relationshipType + targetNodeId + a stable relationship discriminator (source field name)`. **No**
  timestamps, array positions, iteration order, or display names.
- `createdAt`/`updatedAt` on derived objects come from the **source record**, never `new Date()`.
- `nodes`, `edges`, `issues`, `unmappableRecords` are sorted by stable keys ⇒ **identical input produces
  byte-equivalent output** (proved by `JSON.stringify` equality across two runs).

## Organization context — never invents an org

A record with no `organizationId` may inherit `context.organizationId` **only** when: the registry says
the repository is org-scoped AND `context.allowOrgInheritance` AND the caller supplied `organizationId`
— and the result **records** the inheritance (an `ORG_SCOPE_INHERITED` info issue). Otherwise the record
is marked `MISSING_ORGANIZATION` / unmappable. **`org-teragon` is never fabricated.**

## Authority & references (via the Phase-2.1 central policy)

- Every edge's authority is set by `resolveEdgeAuthority(...)` — never hand-set. An explicit link record
  or an eligible FK field becomes `CANONICAL`/`DERIVED` only after existence + same-org + not-archived +
  non-ambiguous checks.
- Legacy `"kind:id"` / embedded-id / string-key refs pass through `parseKindIdRef`/`classifyReference`
  and must satisfy syntax + registry + target-existence + same-org + lifecycle validation before any
  authoritative edge; on failure the matching **issue** is emitted and **no authoritative edge**.
- Name-based fields (`customerName`, `studentName`, free-text `printer`, `printerSummary`, `courseNames`)
  emit an `AMBIGUOUS_REFERENCE` issue and at most an `UNVERIFIED`/`PROPOSED` non-authoritative candidate
  — **never** an authoritative edge, **never** silently resolved.

## No sensitive bodies

Derived nodes are envelope-only (no body/content field); a sensitive source sets `node.sensitivity` and
is reachable only via `ProtectedPayloadReference` semantics — the body is never copied. Where a body
would otherwise be required, a `SENSITIVITY_BLOCKED` issue is emitted.
