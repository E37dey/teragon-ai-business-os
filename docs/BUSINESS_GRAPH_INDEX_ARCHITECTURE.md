# TERAGON Business Graph — Index Architecture (Phase 4)

**Scope:** persist deterministic graph snapshots produced by `deriveOrganizationGraphSnapshot`, with
deterministic full rebuild, validation, atomic replacement, recovery, corruption/stale/orphan
detection. **No** runtime event subscriptions, incremental indexing, traversal, `BusinessGraphService`,
APIs, UI, agent integration, canonical-data migration, Copilot, or deployment. Source: `src/graph/store/**`.
**Standalone module — not wired into app runtime**, so the bundle and E2E are unchanged.

## Principles

The graph index is **derived · read-only from product modules · rebuildable · replaceable · never the
canonical business source of truth.** Canonical repositories remain authoritative; the index is a
disposable projection that can be dropped and rebuilt at any time.

## `GraphIndexStore` (the only surface)

Ten methods — **no node/edge CRUD exists**: `getActiveSnapshot(organizationId)`, `getSnapshot(id)`,
`listSnapshots(organizationId)`, `stageSnapshot(snapshot)`, `validateStagedSnapshot(id)`,
`activateSnapshot(id)`, `discardStagedSnapshot(id)`, `restoreSnapshot(id)`,
`deleteExpiredSnapshots(organizationId)`, `getHealth(organizationId)`. `createNode/updateNode/
deleteNode/createEdge/updateEdge/deleteEdge` are **deliberately absent** — nodes and edges enter the
store only as a complete derived snapshot.

## Snapshot & build-state machine

`GraphIndexSnapshot` = `{ snapshotId, organizationId, createdAt, sourceSnapshotVersion, sourceHash,
registryVersion, schemaVersion, derivationVersion, nodeCount, edgeCount, issueCounts, nodes, edges,
issues, unmappableRecords, validationState, buildState, activatedAt, supersedesSnapshotId, checksum }`.

```
STAGED → VALIDATING → VALID | INVALID
VALID → ACTIVE   (previous ACTIVE → SUPERSEDED)
(VALID|SUPERSEDED) → RECOVERY   (via restore)
any step → FAILED
```

**Exactly one serving snapshot (ACTIVE or RECOVERY) per organization** — manifest-enforced, swapped
atomically in a single IndexedDB transaction. **INVALID or FAILED can never activate**
(`activateSnapshot` throws `GRAPH_INDEX_INVALID_ACTIVATION` unless `validationState === VALID`).

## Module map

| File | Responsibility |
|------|----------------|
| `store/contracts.ts` | index types + zod schemas + `GraphIndexStore` + build-state + version pins + `GraphIndexError` |
| `store/hash.ts` | deterministic hashing (`canonicalJSON` + **SHA-256** via Web Crypto, checksum, sourceHash, snapshotId); Phase 4.1 |
| `store/snapshot.ts` | wrap a `GraphDerivationResult` into a STAGED snapshot |
| `store/validation.ts` | pure `validateSnapshot` gate |
| `store/rebuild.ts` | `rebuildOrganizationGraph` atomic full rebuild |
| `store/recovery.ts` | retention selection + non-destructive recovery |
| `store/health.ts` | `computeHealth` (stale/orphan/corruption) |
| `store/indexeddbStore.ts` | Local-Demo IndexedDB adapter (`idb`) |

## Integrity & activation policy (Phase 4.1)

- **Checksum = SHA-256** (Web Crypto, async, no dependency) over the canonical serialization; `checksum`
  = full content, `sourceHash` = source-derived content; `snapshotId = idx-{org}-{fullSha256}`. The
  snapshot carries `checksumAlgorithm:"SHA-256"` + `checksumVersion:1`. `schemaVersion` is
  `graph-index-v2`; legacy FNV/v1 snapshots are **unsupported** → `REBUILD_REQUIRED` (never silently
  accepted). See [REBUILD_PROTOCOL](BUSINESS_GRAPH_REBUILD_PROTOCOL.md).
- **Closed activation policy** — activation tolerance is NOT caller-supplied. Two internal constants
  govern it: `SAFE_NON_INDEXABLE_ACTIVATION_CODES` (the only issue codes that may be tolerated) and
  `FORBIDDEN_ACTIVATION_CODES` — `CROSS_ORGANIZATION`, `SENSITIVITY_BLOCKED`, `DANGLING_ENDPOINT`,
  `MISSING_ORGANIZATION`, `DUPLICATE_EDGE`, `MALFORMED_REFERENCE` — which can **never** be allow-listed
  or downgraded through any configuration. Any caller-passed `allowedErrorCodes` is intersected with the
  SAFE set and forbidden codes are dropped unconditionally. Structural checks (checksum mismatch,
  duplicate node/edge id, sensitive-payload-on-node, absent edge endpoint, cross-org) sit outside the
  allow-list path and can't be downgraded.

## Security

Every store operation is **organization-scoped**; the store never returns a snapshot from another
organization (keys are `organizationId + snapshotId + graphId`; reads filter by org + manifest). It
persists **no** sensitive bodies, protected prompts, secrets, auth tokens, or raw notes beyond the safe
node envelope (validation asserts payload absence). Issues carry references + safe remediation only.

See: [INDEXEDDB_SCHEMA](BUSINESS_GRAPH_INDEXEDDB_SCHEMA.md) · [REBUILD_PROTOCOL](BUSINESS_GRAPH_REBUILD_PROTOCOL.md)
· [RECOVERY](BUSINESS_GRAPH_RECOVERY.md) · [INDEX_HEALTH](BUSINESS_GRAPH_INDEX_HEALTH.md) ·
[PHASE4_TEST_REPORT](BUSINESS_GRAPH_PHASE4_TEST_REPORT.md).
