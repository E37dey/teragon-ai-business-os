# TERAGON Business Graph — Event Ordering & Checkpointing (Phase 5)

How the coordinator orders events deterministically without a durable outbox sequence, and how the
checkpoint advances. Source: `src/graph/indexing/{coordinator,types,stateStore}.ts`.

## Ordering — committed version, then ingest sequence (never wall-clock alone)

The `ChangeEvent` channel has **no** global sequence number. The coordinator orders by:
1. **committed `aggregateVersion`** where present (nulls last) — the closest thing to a canonical
   committed order (memory/quotation/policy versions);
2. then a coordinator-assigned **monotonic `ingestSequence`** (stamped on receipt).

**Wall-clock / `occurredAt` is never the ordering key** — a test feeds inverted `occurredAt` values and
asserts the version+sequence order still holds.

## Deduplication

`eventId` = `${collection}:${id}:${aggregateVersion ?? "-"}:${operation}`. A repeated `eventId` is
processed once — dedup happens both in-window (the pending queue) and across restart (a processed-event
ledger). A duplicate never causes a second rebuild of the same content.

## Coalescing

A single drain consumes **all** pending events after the checkpoint into **one** `GraphIndexingBatch`
(deduped). Many mutations therefore collapse into one full rebuild. Events that arrive **while** a
rebuild is in flight set the org **dirty** flag and are drained into exactly **one** subsequent batch.

## Checkpoint (per organization)

The checkpoint is the **highest processed watermark** for the org, persisted in `graphEventCheckpoints`,
**separate from graph content**. It advances **only** after:
- a successful **atomic activation**, or
- a verified **`sourceHash` NO_OP** (the derived graph equals the active graph — nothing to activate,
  but the events are accounted for).

It does **not** advance on any failure (validation/derivation/checksum/persistence), so a failed batch is
retried, not skipped. Later causal events are never processed as successful while an earlier batch is
unresolved.

## Isolation

Ordering, dedup, coalescing, checkpoint, `inFlight`, and `dirty` are strictly **per-organization**.
Different organizations are processed independently and never share state; one org halting does not stop
another. There is never more than one in-flight rebuild or activation for a single organization.
