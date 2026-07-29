# TERAGON Business Graph — Index Health (Phase 4)

Stale / orphan / corruption detection. Source: `src/graph/store/health.ts` (`computeHealth`). Pure —
takes the persisted snapshot state (+ optionally the latest canonical `sourceHash`) and returns a state.

## Health states

`HEALTHY · STALE · DEGRADED · CORRUPT · MISSING · REBUILD_REQUIRED`.

**HEALTHY is never inferred merely because IndexedDB opened.** It requires ALL of:
- a present **served** snapshot (ACTIVE or RECOVERY) whose `validationState === VALID`;
- its **checksum recomputes** to the stored value;
- its header counts (`nodeCount`/`edgeCount`/`issueCounts`) **match the persisted rows**;
- its **schema + registry versions are supported**;
- **all edge endpoints resolve** to present nodes;
- when a latest canonical `sourceHash` is supplied, the snapshot's `sourceHash` **matches** (not stale).

## Detections and the state they raise

| Detection | State |
|---|---|
| edge target absent / source node absent (orphan endpoint) | `DEGRADED` |
| node/edge source version changed | `STALE` |
| snapshot registry version outdated | `STALE` / `REBUILD_REQUIRED` |
| snapshot schema version outdated | `REBUILD_REQUIRED` |
| source hash differs from latest canonical snapshot | `STALE` |
| active snapshot missing | `MISSING` |
| partial IndexedDB write (header/row count mismatch) | `CORRUPT` |
| checksum mismatch | `CORRUPT` |

## Behavior by state

- **HEALTHY** — serve the active snapshot.
- **STALE** — index is intact but the underlying canonical data moved; a full rebuild is due (serving
  may continue until then, honestly labeled).
- **DEGRADED** — structural gap (orphan endpoint); do not treat as authoritative for the affected edges.
- **CORRUPT** — checksum/partial-write; prefer recovery to a known-good snapshot.
- **MISSING** — nothing served; rebuild required.
- **REBUILD_REQUIRED** — schema/registry moved beyond what the snapshot supports; full rebuild.

Corruption and partial-write detections are proven in tests by mutating stored rows through a raw `idb`
connection and asserting the store reports `CORRUPT`/`DEGRADED`, never `HEALTHY`.
