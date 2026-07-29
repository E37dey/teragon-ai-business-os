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

## Fixture results (as persisted)

| Fixture | Outcome | Detail |
|---|---|---|
| **Valid** (`validFixture`) | **ACTIVATED** | validation 0 errors; **20 nodes / 20 edges** persisted; no cross-org edge; no body payload on any node envelope |
| **Adversarial** (`adversarialFixture`) | **REJECTED_INVALID** | activation blocked; `getActiveSnapshot` stays null; staged `issueCounts.error === 14` (all CROSS_ORGANIZATION), 21 warnings / 169 info; no forbidden cross-org edge persisted |

## Deterministic hashing

`canonicalJSON` (recursive ASCII key-sort, array order preserved, drops `undefined`, refuses non-finite)
→ `fnv1a64` (BigInt, no Date/random). `checksum` = full content (integrity); `sourceHash` = source-derived
content (staleness); `snapshotId = idx-{org}-{checksum}` (deterministic). Identical input ⇒ identical
checksum/sourceHash/snapshotId.

## Store surface

10 methods, **no node/edge CRUD**: getActiveSnapshot, getSnapshot, listSnapshots, stageSnapshot,
validateStagedSnapshot, activateSnapshot, discardStagedSnapshot, restoreSnapshot, deleteExpiredSnapshots,
getHealth.
