# TERAGON Business Graph — Phase 5 Test Report

**Branch:** `feature/teragon-business-graph`. Event-driven **full-rebuild** coordination, flag-gated
(default OFF). No delta grafting, in-place mutation, dependency-based partial indexing, traversal,
service, APIs, UI, agents, Copilot, or deploy. Not wired into app runtime.

## Gate results (all green)

| Gate | Result |
|------|--------|
| oxlint (`src/graph tests/graph`) | **clean** |
| TypeScript strict (`tsc -b`) | **0 errors** |
| `typecheck:tests` | **0 errors** |
| Vitest — indexing + full graph suites | green |
| Vitest — full suite | **1907 / 1907 passed** (207 files; 1880 prior + 27 indexing) |
| Production build | **pass** |
| Secret scanner | **CLEAN — 0 findings** |
| Playwright baseline (smoke `shell.spec.ts`) | **14 / 14** (coordinator not wired into runtime; E2E unaffected) |
| Working tree | additive only (`src/graph/indexing/**`, `tests/graph/indexing/**`, one line in a store test helper + a store DB-version bump, docs) |

## Invariants proven (27 indexing tests; `fake-indexeddb` + injected clock/scheduler, no sleeps)

feature disabled registers no consumer · committed event triggers one full rebuild · duplicate eventId
processed once · repeated event stream idempotent · multiple events coalesce into one rebuild · events
during a rebuild trigger one subsequent rebuild · only one rebuild per org · different orgs isolated ·
out-of-order events use canonical sequence (aggregateVersion) not wall-clock · sourceHash equality ⇒
NO_OP · NO_OP advances checkpoint without creating a snapshot · successful activation advances
checkpoint · failed validation preserves active snapshot · failed processing does not advance
checkpoint · bounded retry · exhausted retry HALTS only the affected org · restart replays events after
checkpoint · deletion event removes stale graph state via full rebuild · rejected proposal does not
become canonical · no sensitive payload in event/failure logs · IndexedDB upgrade preserves existing
snapshots · no active snapshot mutated in place.

## Coordinator surface

`GraphIndexingCoordinator` (`register`, `ingest`, drain/process, startup replay) + `GraphIndexingEvent`,
`GraphIndexingBatch`, `GraphIndexingCheckpoint`, `GraphIndexingRun`/`RunResult`, `GraphIndexingFailure`,
`GraphIndexingPolicy`. Full-rebuild path delegates to Phase-4 `rebuildOrganizationGraph`; NO_OP compares
`sourceHash` via `deriveOrganizationGraphSnapshot`. `deriveEntityGraph` is **not** used to build an
activated snapshot.

## IndexedDB

`teragon-graph-index` bumped **v1 → v2** (single additive shared upgrade). New stores:
`graphEventCheckpoints`, `graphIndexingRuns`, `graphProcessedEvents`, `graphFailedBatches`,
`graphPendingEvents`. Upgrade preserves all existing snapshots/manifests (proven from a genuine v1 DB).

## Deterministic-fixture rebuild

The canonical **valid** fixture derives **22 nodes / 22 edges** — the content the full-rebuild path
stages, validates (0 errors), SHA-256-checksums, and atomically activates on an accepted batch.

## Feature flag

`BUSINESS_GRAPH_EVENT_INDEXING_ENABLED = false` (default). OFF ⇒ `register()` subscribes to nothing,
`ingest()` returns null, no background rebuild; manual Phase-4 rebuild remains for tests/internal code;
product runtime unchanged; not exposed to users/agents; `AI_REMOTE_ENABLED` unrelated and still false.
