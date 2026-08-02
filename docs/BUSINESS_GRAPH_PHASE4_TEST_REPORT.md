# TERAGON Business Graph — Phase 4 Test Report

**Branch:** `feature/teragon-business-graph`. Derived-index persistence + full rebuild + validation +
recovery + health. No event subscriptions/incremental indexing/traversal/service/APIs/UI/agents/
migrations/Copilot/deploy. Not wired into app runtime.

## Gate results (all green)

| Gate | Result |
|------|--------|
| oxlint (`src/graph tests/graph`) | **clean** |
| TypeScript strict (`tsc -b`) | **0 errors** |
| `typecheck:tests` | **0 errors** |
| Vitest — store suite (`tests/graph/store`) | **49 / 49 passed** |
| Vitest — full suite | **1861 / 1861 passed** (203 files; 1812 prior + 49 store) |
| Production build | **pass** |
| Secret scanner | **CLEAN — 0 findings** |
| Playwright baseline (smoke `shell.spec.ts`) | **14 / 14** (store not wired into runtime; E2E unaffected) |
| Working tree | additive only (`src/graph/store/**`, `tests/graph/store/**`, barrel, docs) |

## Invariants proven (49 store tests, using `fake-indexeddb`)

valid fixture builds with zero errors · adversarial fixture rejects cross-org edges (activation
blocked) · identical input ⇒ identical snapshot checksum · rebuild is idempotent · staged snapshot
invisible as active · invalid snapshot cannot activate · failed rebuild preserves previous active
snapshot · activation is atomic · only one active snapshot exists · snapshot data never mixes ·
organization isolation (org A never sees org B) · checksum corruption detected · partial write detected ·
stale source hash detected · orphan endpoint blocks activation · duplicate ids block activation ·
recovery restores previous known-good · recovery does not mutate canonical records · schema-version
mismatch handled · registry-version mismatch handled · retention removes only eligible historical
snapshots · sensitive payload remains absent.

## Fixture results (as persisted — updated in Phase 4.1)

| Fixture | Outcome | Detail |
|---|---|---|
| **Valid** (`validFixture`) | **ACTIVATED** | validation 0 errors; **22 nodes / 22 edges** persisted; **`OWNS` and `RESOLVED_BY` now present** (source-FK fix); no cross-org edge; no body payload on any node envelope; deterministic SHA-256 snapshot |
| **Adversarial** (`adversarialFixture`) | **REJECTED_INVALID** | activation blocked; `getActiveSnapshot` stays null; staged `issueCounts.error === 14` (all CROSS_ORGANIZATION), **18 warnings / 165 info**; no forbidden cross-org edge persisted |

> **Phase 4.1 count change (honest):** the seed supplies `serviceTickets` but no `organizations`, so
> after the source-FK fix the three `repairAction.ticketId` refs resolve under the SOURCE type and emit
> real same-org `RESOLVED_BY` edges instead of 3 spurious `MISSING_TARGET` warnings (21→18), which also
> makes their nodes edge-incident, removing 4 `ORPHAN_NODE` infos (169→165). `OWNS` stays an honest
> `MISSING_TARGET` (no `organizations` in the seed), never a cross-org edge. Error count (14) unchanged.

## Phase 4.1 hardening (this branch)

- **Source-pointing FK resolver** fixed generically (`referenceEntityType = fkPointsTo==="source" ?
  registrySourceType : registryTargetType`) — regression tests prove OWNS/RESOLVED_BY emit on valid
  refs, `MISSING_TARGET` on missing, `CROSS_ORGANIZATION` on cross-org, and no name/substring matching.
- **SHA-256** (Web Crypto, async, no dependency) replaces FNV for checksum + sourceHash + recovery
  integrity; `checksumAlgorithm:"SHA-256"` + `checksumVersion:1`; `schemaVersion graph-index-v2`; legacy
  v1/FNV snapshots → `REBUILD_REQUIRED` (tested). `snapshotId = idx-{org}-{fullSha256}`; one-byte change
  ⇒ different checksum (tested); FNV removed from code.
- **Closed activation policy** — `SAFE_NON_INDEXABLE_ACTIVATION_CODES` + `FORBIDDEN_ACTIVATION_CODES`
  (CROSS_ORGANIZATION, SENSITIVITY_BLOCKED, DANGLING_ENDPOINT, MISSING_ORGANIZATION, DUPLICATE_EDGE,
  MALFORMED_REFERENCE) which can never be allow-listed; caller `allowedErrorCodes` stripped; tests prove
  each forbidden code still blocks even when passed.
- **Gate (Phase 4.1):** oxlint 0/0 · tsc strict 0 · typecheck:tests 0 · graph tests **174** · full
  Vitest **1880** · build pass · secret CLEAN · Playwright `shell` 14/14.

## Deterministic hashing

`canonicalJSON` (recursive ASCII key-sort, array order preserved, drops `undefined`, refuses non-finite)
→ `fnv1a64` (BigInt, no Date/random). `checksum` = full content (integrity); `sourceHash` = source-derived
content (staleness); `snapshotId = idx-{org}-{checksum}` (deterministic). Identical input ⇒ identical
checksum/sourceHash/snapshotId.

## Store surface

10 methods, **no node/edge CRUD**: getActiveSnapshot, getSnapshot, listSnapshots, stageSnapshot,
validateStagedSnapshot, activateSnapshot, discardStagedSnapshot, restoreSnapshot, deleteExpiredSnapshots,
getHealth.
