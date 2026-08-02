# TERAGON Business Graph — Indexing Observability (Phase 5)

Safe, auditable metadata for every coordinator run. Source: `src/graph/indexing/types.ts`
(`GraphIndexingRun`) + `stateStore.ts` (`graphIndexingRuns`).

## `GraphIndexingRun` (safe metadata only)

`runId · organizationId · batchEventIds · eventCount · startingCheckpoint · endingCheckpoint ·
startedAt · completedAt · result · previousSnapshotId · resultingSnapshotId · sourceHashBefore ·
sourceHashAfter · retryCount · safeErrorCodes`.

**No entity bodies and no sensitive field values are ever stored** — only ids, counts, checksums,
timestamps, result, and safe error codes (test-enforced). This makes an indexing run auditable and
diagnosable without leaking business content.

## Results

| Result | Meaning |
|---|---|
| `ACTIVATED` | a new complete snapshot was validated and atomically activated; previous → SUPERSEDED |
| `NO_OP` | the derived `sourceHash` equalled the active snapshot's; checkpoint advanced, no snapshot created, active untouched |
| `RETRY_PENDING` | the batch failed and a bounded retry is scheduled; active snapshot preserved |
| `FAILED` | the batch failed this attempt (diagnostics persisted); active snapshot preserved |
| `HALTED` | retries exhausted; the organization's queue is halted for human review (health `REBUILD_REQUIRED`) |
| `DISABLED` | the feature flag is OFF — no consumer registered, no rebuild attempted |

## Relationship to index health

A run's outcome feeds the index-health signal ([INDEX_HEALTH](BUSINESS_GRAPH_INDEX_HEALTH.md)): a
`FAILED`/`RETRY_PENDING` run leaves health `DEGRADED`; a `HALTED` run leaves `REBUILD_REQUIRED`; an
`ACTIVATED`/`NO_OP` run leaves the served snapshot `HEALTHY` (subject to the usual checksum/endpoint/
source-hash verification — health is never inferred merely from a successful run record).
