# TERAGON Business Graph — Event Recovery, Retry & Replay (Phase 5)

Failure handling, bounded retry, halted state, and startup replay for the indexing coordinator.
Source: `src/graph/indexing/{coordinator,stateStore}.ts`.

## Failure rules (never corrupt or advance past a failure)

On validation / derivation / checksum / persistence failure while processing a batch:
- the **previous ACTIVE snapshot remains served** (never cleared before a valid replacement);
- the **checkpoint does not advance**;
- the failed batch + **safe diagnostics** (safe error codes only, **no sensitive payload**) are
  persisted to `graphFailedBatches`;
- organization health becomes **DEGRADED** (retryable) or **REBUILD_REQUIRED** (halted);
- a **bounded deterministic retry** follows (fixed max attempts, deterministic backoff via the injected
  scheduler — **no infinite loop**);
- after retry exhaustion the org's queue **HALTS** for human review;
- the failed event is **not skipped** — later causal events are never processed as successful while the
  batch is unresolved.

Other organizations continue rebuilding normally — a halt is per-organization.

## Startup replay (idempotent)

A fresh coordinator over the same durable IndexedDB stores:
1. loads the last successful **checkpoint** per org;
2. inspects the durable **pending-queue** events after that checkpoint;
3. replays them in deterministic order (version → ingest sequence);
4. **dedupes** already-processed `eventId`s (processed ledger);
5. **coalesces** them into at most the required rebuilds;
6. **preserves the current ACTIVE snapshot until a replacement succeeds.**

Replaying the same events is **idempotent** — a repeated batch yields the same `sourceHash` and
resolves as a **NO_OP**; an event received twice never creates two distinct active snapshots.

## What recovery never does

- It never mutates canonical CRM records (the index is derived).
- It never mutates an active snapshot in place — a fix is always a new validated snapshot via full
  rebuild.
- It never serves an `INVALID`/`FAILED`/`CORRUPT` snapshot.
- It never silently skips a failed event to "make progress."
