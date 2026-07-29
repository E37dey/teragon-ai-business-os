# TERAGON Business Graph — IndexedDB Schema (Phase 4)

Local-Demo persistence adapter (`src/graph/store/indexeddbStore.ts`, via `idb`). Deterministic keys,
explicit version, corruption-safe reads, strict per-organization + per-snapshot isolation.

## Database

- **Name:** `teragon-graph-index` · **Version:** `2` (Phase 5 bumped `1 → 2` via a single additive
  shared `upgradeGraphIndexDb`; the upgrade preserves all existing snapshots/manifests — proven from a
  genuine v1 DB). `upgrade` handler creates stores idempotently.

## Coordinator state stores (Phase 5 — separate from graph content)

Added in v2 for the event-indexing coordinator, keyed per organization; **never** hold graph node/edge
content or sensitive payloads:

| Store | Holds |
|-------|-------|
| `graphEventCheckpoints` | per-org highest processed watermark (advances only on activation or NO_OP) |
| `graphPendingEvents` | the coordinator's durable ingest queue (private replay substrate) |
| `graphProcessedEvents` | processed-eventId ledger (cross-restart dedup) |
| `graphIndexingRuns` | safe run observability metadata (see INDEXING_OBSERVABILITY) |
| `graphFailedBatches` | failed batches + safe diagnostics (no sensitive payload) |

## Object stores & keys

| Store | Key | Holds |
|-------|-----|-------|
| `graphManifests` | `organizationId` | per-org manifest: which snapshotId is served (ACTIVE/RECOVERY), history list |
| `graphSnapshots` | `snapshotId` | snapshot **header** (all fields except the bulk nodes/edges/issues arrays) |
| `graphNodes` | `organizationId␀snapshotId␀graphId` | one `BusinessGraphNode` per row |
| `graphEdges` | `organizationId␀snapshotId␀graphId` | one `BusinessGraphEdge` per row |
| `graphIssues` | `organizationId␀snapshotId␀kind␀paddedIndex` | derivation issues + unmappable records |
| `graphRecoveryPoints` | `recoveryPointId` | recovery audit records |

`␀` denotes a stable separator. Every node/edge/issue key is **prefixed by `organizationId +
snapshotId`**, so a range scan is bounded to a single snapshot and can never cross organizations. Every
public read additionally filters by `organizationId` and resolves the served snapshot via the manifest.

## Isolation guarantees

- **No snapshot mixing** — bulk rows are keyed per snapshot; activating a new snapshot never overwrites
  another snapshot's rows.
- **No cross-organization reads** — org A's operations never return org B's data (proven by the
  organization-isolation test).
- **Atomic activation** — the manifest swap (previous ACTIVE → SUPERSEDED, new → ACTIVE) happens in one
  transaction; a reader never observes two ACTIVE snapshots or a cleared index.

## Corruption-safe reads

Reads tolerate partial/absent data: a missing manifest ⇒ `MISSING`; header/row count mismatch or
checksum mismatch ⇒ `CORRUPT`/`DEGRADED` (never silently treated as healthy). Upgrade handling recreates
missing stores. Writes for a snapshot are grouped so a failed rebuild leaves the previous served
snapshot's rows intact.

## Determinism at the storage layer

Keys derive only from `organizationId`, `snapshotId` (itself a deterministic hash), and the stable
`graphId` (node/edge id) — never from insertion order, timestamps, or auto-increment. Re-persisting the
same snapshot writes byte-identical rows under identical keys.
