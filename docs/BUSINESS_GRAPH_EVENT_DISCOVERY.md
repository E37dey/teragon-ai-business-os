# TERAGON Business Graph — Event Discovery (Phase 5)

Discovery of the **existing canonical mutation-event mechanism** the graph indexer must consume. The
indexer reuses this — it does **not** create a second product event bus.

## Finding: there is NO durable outbox — the mechanism is an in-process repository observer

| Aspect | Reality (cited) |
|---|---|
| **Mechanism** | `Repository.subscribe(listener)` + synchronous `emit(event)` on every mutation (`src/repositories/Repository.ts:30,80,87`). Not a persisted outbox. |
| **Event shape** | `ChangeEvent<T> = { type: "create"\|"update"\|"remove"\|"clear"; collection: string; id?: string; item?: T }` (`Repository.ts:6-16`). Carries the **full item** on create/update — the indexer must NOT persist that body into event logs. |
| **Publication point** | `BaseRepository.emit` fires **after** the write in `IndexedDBRepository` (`create/update/remove/clear`, `IndexedDBRepository.ts:54,64,73,79`) and `InMemoryRepository`. A committed write emits exactly once. |
| **Transaction boundary** | one write = one `emit`; there is **no** multi-record transaction or transactionId on the event. |
| **Ordering guarantees** | emission order only (in-process, synchronous). **No persisted sequence number** and no global order across collections. |
| **Retry behavior** | none — a throwing listener is swallowed so it cannot break persistence (`Repository.ts:88-93`); the event is not redelivered. |
| **Organization field** | **absent** from `ChangeEvent` — org must be derived from the `item` via the entity registry's `organizationField` (Customer.organizationId, MemoryRecordV2.organizationId), else inherited/unmappable. |
| **Aggregate identity** | `collection` (→ `GraphEntityType`) + `id`. Version, where present, is on the item (e.g. `MemoryRecordV2.version`, `Quotation.version`, `GovernancePolicy.currentVersion`). |
| **Current consumers** | TanStack Query invalidation hooks (`src/app/data/hooks.ts`) and notification sync (`src/app/notifications/syncNotifications.ts`). The graph indexer is an additional, independent subscriber. |

## Consequences for graph indexing (Phase 5)

1. **Consume only committed mutations** — subscribing to `Repository` `emit` (which fires post-write)
   means only committed writes are seen. There is no draft/optimistic/failed-transaction state on this
   channel, so those are never indexed. Unapproved AI proposals are ordinary records whose
   `approvalState !== "מאושר"` — the derivation already refuses them as authoritative edges (Phase 3);
   an indexing event for such a record is a rebuild signal, never a canonical relationship.
2. **No native eventId / sequence / org / transactionId** — the Phase-5 event adapter must **synthesize**
   the normalized contract from `ChangeEvent` + the item:
   - `eventId` — deterministic key `${collection}:${id}:${aggregateVersion ?? "-"}:${operation}` (for
     dedup), plus a coordinator-assigned monotonic **ingest sequence** for total order.
   - `organizationId` — derived from the item via the registry (or `unmappable`).
   - `aggregateType` — `collection → GraphEntityType`; `aggregateId` — `id`.
   - `operation` — `type` mapped (`create→CREATE`, `update→UPDATE`, `remove→DELETE`), with
     `ARCHIVE/RESTORE/APPROVE/REJECT/SUPERSEDE` inferred from item field transitions (`archivedAt`,
     `approvalState`, `supersedesId`).
   - `aggregateVersion` — the item's version field where present; `occurredAt` — `item.updatedAt`.
   - `sourceRepository` — `collection`; `transactionId`/`correlationId` — null (none available).
   - `changedFields` — not derivable from `ChangeEvent` (it carries the whole item, not a diff), so
     recorded as unknown/empty; **no full body is stored**.
3. **Ordering** — because there is no canonical outbox sequence, Phase 5 orders by **committed
   aggregate version** where present, then a deterministic **ingest sequence** — **never wall-clock
   alone**.
4. **Full-rebuild-only** — every accepted batch re-reads a consistent repository snapshot and runs the
   whole `deriveOrganizationGraphSnapshot → stage → validate → SHA-256 → atomic activate` path. Deletes/
   archives/rejections/supersessions are handled naturally by the complete rebuild.

## Explicitly NOT indexed

draft UI state · failed transactions · optimistic state · unapproved AI proposals as canonical
relationships. The subscription only sees committed writes; unapproved records are refused as
authoritative by the derivation, not by the event channel.
