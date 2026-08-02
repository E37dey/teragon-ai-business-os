# TERAGON Business Graph — Event Indexing (Phase 5)

Event-driven **full-rebuild** coordination. A canonical mutation may *trigger* a rebuild, but every
successful update still produces a **complete** organization snapshot through
`deriveOrganizationGraphSnapshot → stage → validate → SHA-256 → atomic activate`. **No delta grafting,
no in-place mutation of an active snapshot.** Source: `src/graph/indexing/**`. **Flag-gated, default OFF
— not wired into app runtime.**

## Delivery guarantee (the REAL model — Phase 5.1)

`Repository.subscribe` is **best-effort in-process notification, NOT a durable transactional outbox**.
The durable `graphPendingEvents` queue protects an event **only after** it has been ingested — it cannot
guarantee an event survives the gap between the canonical commit and durable graph-queue persistence.
The honest model is therefore:

> **best-effort event ingestion + durable replay after ingestion + startup canonical reconciliation =
> eventual graph consistency.**

There is **no exactly-once** and **no durable-outbox** semantics. Startup **canonical reconciliation**
(below) is what closes any commit-before-enqueue gap.

## What it consumes

Only the in-process `Repository.subscribe` `ChangeEvent {type, collection, id?, item?}` (post-commit).
`GraphIndexingCoordinator.register()` (flag ON only) subscribes; each event is normalized and, in **one
atomic IndexedDB transaction**, allocated a per-org monotonic **ingest sequence**, written to the durable
pending queue, and recorded with a safe **source fingerprint** — the coordinator's private checkpoint/
replay substrate, **not** a competing product bus.

## Normalized `GraphIndexingEvent`

`eventId` = **`gidxevt:{organizationId}:{ingestSequence}`** (durable per-org monotonic sequence, always
unique — Phase 5.1; no timestamps/display values, no collision when `aggregateVersion` is null) ·
`ingestSequence` · `sourceFingerprint` (`collection:id:aggregateVersion:operation`, present only when
version is non-null — used for **versioned** duplicate-source detection; a **versionless** event is never
fingerprint-deduped, so two versionless updates to a record remain two events) · `organizationId` (via
registry `organizationField` + `classifyOrganization`, else null — **never invented**) · `aggregateType`
· `aggregateId` · `operation` · `aggregateVersion` (retained for ordering + versioned dedup, not as
identity) · `occurredAt` (item.updatedAt) · `sourceRepository` · `transactionId`/`correlationId` (null)
· `changedFields` (empty — the channel carries no diff) · `approvalState` · `supported` ·
`unmappableReason`.

`operation ∈ { CREATE, UPDATE, DELETE, ARCHIVE, RESTORE, APPROVE, REJECT, SUPERSEDE }` — create/update/
remove are mapped; ARCHIVE/RESTORE/APPROVE/REJECT/SUPERSEDE are inferred from `archivedAt`/
`approvalState`/`supersedesId`; unknown collections and `clear` events are recorded as **UNSUPPORTED**
(never fabricate a relationship). **No entity body, notes, prompt, secret, or protected content is ever
copied into an event** (test-enforced) — the event is a rebuild signal + audit reference.

## What is never indexed

Draft UI state · failed transactions · optimistic state · unapproved AI proposals as canonical
relationships. The subscription only sees committed writes; an unapproved record (`approvalState !==
"מאושר"`) is refused as authoritative by the derivation, not treated as a canonical edge.

## Full-rebuild-only per accepted batch

1. read a consistent canonical snapshot (injected `loadOrganizationRecords(organizationId)` — the
   coordinator never reads repositories directly);
2. `deriveOrganizationGraphSnapshot`;
3. compare the derived `sourceHash` with the ACTIVE snapshot's `sourceHash`;
4. **NO_OP** when identical (advance checkpoint, create **no** snapshot, active untouched);
5. else stage a complete new snapshot;
6. validate (existing gate + closed activation policy);
7. SHA-256 verify;
8. atomically activate;
9. previous → SUPERSEDED;
10. persist the successful checkpoint.

`deriveEntityGraph` is **not** used to build the activated snapshot (diagnostic-only). Deletion,
archival, rejection, and supersession are handled naturally by the complete rebuild.

## Concurrency & isolation (per organization)

- **One in-flight rebuild max** per org; **strict org isolation** (orgs processed independently, never
  share `inFlight`/`dirty`/checkpoint state); **never two activations concurrently for one org.**
- Events arriving **during** a rebuild set a per-org **dirty** flag ⇒ exactly **one** subsequent rebuild
  after the current activation.
- **Dedup by eventId**; **coalesce** all pending-after-checkpoint into one batch; **idempotent**
  (a repeated batch that yields the same `sourceHash` is a NO_OP — never a second active snapshot).

Uses an **injected clock and scheduler** (no `Date.now`, no `setTimeout` sleeps) so ordering, retry, and
coalescing are deterministic and testable.

## Feature control

`BUSINESS_GRAPH_EVENT_INDEXING_ENABLED = false` (default). When disabled: no subscriptions, no
background rebuild, the manual Phase-4 `rebuildOrganizationGraph` remains for tests/internal code,
product runtime unchanged. Not exposed to users/agents. `AI_REMOTE_ENABLED` stays false and is unrelated.

See: [EVENT_ORDERING](BUSINESS_GRAPH_EVENT_ORDERING.md) · [EVENT_RECOVERY](BUSINESS_GRAPH_EVENT_RECOVERY.md)
· [INDEXING_OBSERVABILITY](BUSINESS_GRAPH_INDEXING_OBSERVABILITY.md) ·
[PHASE5_TEST_REPORT](BUSINESS_GRAPH_PHASE5_TEST_REPORT.md).
