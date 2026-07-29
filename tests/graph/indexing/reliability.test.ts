// TERAGON Business Graph — Phase 5.1 reliability-hardening tests.
// Proves the durable event-identity + startup-reconciliation contract, with an
// injected clock + hand-driven scheduler (NO real sleeps) over a real fake-indexeddb.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { BaseEntity } from "@/domain/types";
import {
  GraphIndexingCoordinator,
  type CanonicalRecord,
  type LoadOrganizationRecords,
  type OrganizationRecordsSnapshot,
} from "@/graph";
import {
  ManualScheduler,
  baseRecords,
  customerChange,
  makeClock,
  makeHarness,
  memoryRecord,
  type Harness,
} from "./helpers";

type RecordMap = Partial<Record<string, CanonicalRecord[]>>;

/** A mutable per-org source holder the loader reads from (deep-cloned per read). */
class SourceBook {
  private readonly map = new Map<string, OrganizationRecordsSnapshot>();
  set(org: string, records: RecordMap, sourceSnapshotVersion: string): void {
    this.map.set(org, { records, sourceSnapshotVersion });
  }
  loader: LoadOrganizationRecords = (org) => {
    const snap = this.map.get(org);
    if (!snap) return Promise.reject(new Error(`no records for ${org}`));
    return Promise.resolve({
      records: structuredClone(snap.records),
      sourceSnapshotVersion: snap.sourceSnapshotVersion,
    });
  };
}

/** Build a fresh coordinator over the SAME durable stores (a "restart"). */
function restart(h: Harness, loader: LoadOrganizationRecords, enabled = true): {
  coordinator: GraphIndexingCoordinator;
  scheduler: ManualScheduler;
} {
  const scheduler = new ManualScheduler();
  const coordinator = new GraphIndexingCoordinator({
    graphStore: h.graphStore,
    stateStore: h.stateStore,
    loadOrganizationRecords: loader,
    scheduler,
    clock: makeClock("2026-09-01T00:00:00.000Z"),
    enabled,
  });
  return { coordinator, scheduler };
}

// ---------------------------------------------------------------------------
// (1) two versionless updates are NOT deduplicated
// ---------------------------------------------------------------------------

describe("durable identity — versionless updates are distinct events", () => {
  it("two versionless updates to the same record allocate two distinct sequences/eventIds", async () => {
    const org = "org-vl";
    const book = new SourceBook();
    book.set(org, baseRecords(org), "v1");
    const h = makeHarness({ loader: book.loader });

    const { change, item } = customerChange(org, "cu-1", "update"); // customers carry NO version
    const e1 = await h.coordinator.ingest(change, item);
    const e2 = await h.coordinator.ingest(change, item);

    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    expect(e1?.aggregateVersion).toBeNull();
    expect(e1?.ingestSequence).toBe(0);
    expect(e2?.ingestSequence).toBe(1);
    expect(e1?.eventId).toBe(`gidxevt:${org}:0`);
    expect(e2?.eventId).toBe(`gidxevt:${org}:1`);
    expect(e1?.eventId).not.toBe(e2?.eventId);
    expect(await h.stateStore.lastIngestSequence(org)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (2) a repeated VERSIONED source event IS deduplicated
// ---------------------------------------------------------------------------

describe("durable identity — versioned source-event dedup", () => {
  it("a re-delivered versioned source event is skipped and allocates no sequence", async () => {
    const org = "org-vd";
    const book = new SourceBook();
    book.set(org, { ...baseRecords(org), memoryRecords: [memoryRecord(org, "mem-1", 4)] }, "v1");
    const h = makeHarness({ loader: book.loader });

    const item = memoryRecord(org, "mem-1", 4) as unknown as BaseEntity;
    const first = await h.coordinator.ingest({ type: "update", collection: "memoryRecords", id: "mem-1", item }, item);
    const dup = await h.coordinator.ingest({ type: "update", collection: "memoryRecords", id: "mem-1", item }, item);

    expect(first?.eventId).toBe(`gidxevt:${org}:0`);
    expect(dup).toBeNull(); // deduped — no sequence allocated
    expect(await h.stateStore.lastIngestSequence(org)).toBe(0);

    // a DIFFERENT version of the same record is NOT a duplicate.
    const item5 = memoryRecord(org, "mem-1", 5) as unknown as BaseEntity;
    const next = await h.coordinator.ingest({ type: "update", collection: "memoryRecords", id: "mem-1", item: item5 }, item5);
    expect(next?.ingestSequence).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (3) sequence allocation survives a restart (durable + monotonic)
// ---------------------------------------------------------------------------

describe("durable identity — sequence survives restart", () => {
  it("a fresh coordinator over the same DB continues the monotonic per-org sequence", async () => {
    const org = "org-restart";
    const book = new SourceBook();
    book.set(org, baseRecords(org, ["cu-1", "cu-2"]), "v1");
    const h = makeHarness({ loader: book.loader });

    const a = customerChange(org, "cu-1", "update");
    const e0 = await h.coordinator.ingest(a.change, a.item);
    expect(e0?.ingestSequence).toBe(0);

    // restart: brand-new coordinator instance over the SAME durable stores.
    const { coordinator: coord2 } = restart(h, book.loader);
    const b = customerChange(org, "cu-2", "update");
    const e1 = await coord2.ingest(b.change, b.item);
    expect(e1?.ingestSequence).toBe(1); // continued, not reset to 0
    expect(e1?.eventId).toBe(`gidxevt:${org}:1`);
  });
});

// ---------------------------------------------------------------------------
// (4) pending event + sequence persist atomically (no gap, no partial row)
// ---------------------------------------------------------------------------

describe("durable identity — atomic ingest", () => {
  it("a failed ingest write leaves neither an allocated sequence nor a partial pending row", async () => {
    const org = "org-atomic";
    const book = new SourceBook();
    book.set(org, baseRecords(org), "v1");
    const h = makeHarness({ loader: book.loader });

    const { change, item } = customerChange(org, "cu-1", "update");
    h.stateStore.failNextIngestForTests();
    await expect(h.coordinator.ingest(change, item)).rejects.toThrow();

    // nothing persisted: no sequence counter advanced, no pending row.
    expect(await h.stateStore.lastIngestSequence(org)).toBe(-1);
    expect((await h.stateStore.pendingAfter(org, -1)).length).toBe(0);

    // the next clean ingest starts at sequence 0 — no gap left behind.
    const ok = await h.coordinator.ingest(change, item);
    expect(ok?.ingestSequence).toBe(0);
    expect((await h.stateStore.pendingAfter(org, -1)).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (5) commit-before-enqueue gap is detected on startup → reconciliation rebuild
// ---------------------------------------------------------------------------

describe("startup reconciliation — commit-before-enqueue gap", () => {
  it("an active graph missing an already-committed canonical change is rebuilt on startup", async () => {
    const org = "org-gap";
    const book = new SourceBook();
    book.set(org, baseRecords(org, ["cu-1"]), "v1");
    const h = makeHarness({ loader: book.loader });

    const c = customerChange(org, "cu-1");
    await h.coordinator.ingest(c.change, c.item);
    await h.scheduler.runUntilIdle();
    const before = await h.graphStore.getActiveSnapshot(org);
    expect(before?.nodes.filter((n) => n.entityType === "customer").length).toBe(1);

    // a canonical change was COMMITTED but its ChangeEvent was LOST (never ingested).
    book.set(org, baseRecords(org, ["cu-1", "cu-2"]), "v2");

    // restart: startup reconciliation must close the gap (no pending events exist).
    const { coordinator: coord2, scheduler: sched2 } = restart(h, book.loader);
    await coord2.start();
    await sched2.runUntilIdle();

    const after = await h.graphStore.getActiveSnapshot(org);
    expect(after?.nodes.filter((n) => n.entityType === "customer").length).toBe(2);
    const runs = await coord2.listRuns(org);
    expect(runs.some((r) => r.runId.startsWith("reconcile-") && r.result === "ACTIVATED")).toBe(true);
    // the reconcile signal is operational metadata — it folds NO synthesized events.
    const reconcile = runs.find((r) => r.runId.startsWith("reconcile-"));
    expect(reconcile?.batchEventIds).toEqual([]);
    expect(reconcile?.eventCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (6) a stale active sourceHash triggers a rebuild on startup
// ---------------------------------------------------------------------------

describe("startup reconciliation — stale active sourceHash", () => {
  it("rebuilds when the active snapshot's sourceHash differs from the canonical one", async () => {
    const org = "org-stale";
    const book = new SourceBook();
    book.set(org, baseRecords(org, ["cu-1"]), "v1");
    const h = makeHarness({ loader: book.loader });

    const c = customerChange(org, "cu-1");
    await h.coordinator.ingest(c.change, c.item);
    await h.scheduler.runUntilIdle();
    const before = await h.graphStore.getActiveSnapshot(org);

    // the canonical source drifts (different derived content ⇒ different sourceHash).
    book.set(org, baseRecords(org, ["cu-1", "cu-9"]), "v2");

    const { coordinator: coord2 } = restart(h, book.loader);
    await coord2.start();

    const runs = await coord2.listRuns(org);
    const reconcile = runs.find((r) => r.runId.startsWith("reconcile-"));
    expect(reconcile?.result).toBe("ACTIVATED");
    expect(reconcile?.sourceHashBefore).toBe(before?.sourceHash);
    expect(reconcile?.sourceHashAfter).not.toBe(before?.sourceHash);
    const after = await h.graphStore.getActiveSnapshot(org);
    expect(after?.snapshotId).not.toBe(before?.snapshotId);
  });
});

// ---------------------------------------------------------------------------
// (7) a matching sourceHash produces a reconciliation NO_OP (no rebuild)
// ---------------------------------------------------------------------------

describe("startup reconciliation — matching sourceHash NO_OP", () => {
  it("records RECONCILED_NO_OP and performs no rebuild when the source is unchanged", async () => {
    const org = "org-noop";
    const book = new SourceBook();
    book.set(org, baseRecords(org, ["cu-1"]), "v1");
    const h = makeHarness({ loader: book.loader });

    const c = customerChange(org, "cu-1");
    await h.coordinator.ingest(c.change, c.item);
    await h.scheduler.runUntilIdle();
    const before = await h.graphStore.getActiveSnapshot(org);
    const headersBefore = await h.graphStore.listSnapshots(org);

    // restart with the SAME (unchanged) canonical source.
    const { coordinator: coord2, scheduler: sched2 } = restart(h, book.loader);
    await coord2.start();
    await sched2.runUntilIdle();

    const runs = await coord2.listRuns(org);
    const reconcile = runs.find((r) => r.runId.startsWith("reconcile-"));
    expect(reconcile?.result).toBe("RECONCILED_NO_OP");
    // no new snapshot was created; the active pointer is unchanged.
    const after = await h.graphStore.getActiveSnapshot(org);
    expect(after?.snapshotId).toBe(before?.snapshotId);
    expect((await h.graphStore.listSnapshots(org)).length).toBe(headersBefore.length);
  });
});

// ---------------------------------------------------------------------------
// (8) failed reconciliation preserves the active snapshot + DEGRADED
// ---------------------------------------------------------------------------

describe("startup reconciliation — failure preserves active + DEGRADED", () => {
  it("a reconciliation that cannot load the canonical source preserves the active graph and marks DEGRADED", async () => {
    const org = "org-degraded";
    const book = new SourceBook();
    book.set(org, baseRecords(org, ["cu-1"]), "v1");

    let failReconcile = false;
    const loader: LoadOrganizationRecords = (o) =>
      failReconcile ? Promise.reject(new Error("canonical read failed")) : book.loader(o);
    const h = makeHarness({ loader });

    const c = customerChange(org, "cu-1");
    await h.coordinator.ingest(c.change, c.item);
    await h.scheduler.runUntilIdle();
    const before = await h.graphStore.getActiveSnapshot(org);
    expect(before).not.toBeNull();

    // restart; now the canonical load fails during reconciliation.
    failReconcile = true;
    const { coordinator: coord2 } = restart(h, loader);
    await coord2.start();

    // the active snapshot is preserved untouched.
    const after = await h.graphStore.getActiveSnapshot(org);
    expect(after?.snapshotId).toBe(before?.snapshotId);
    // the org is DEGRADED and a safe RECONCILE_FAILED run is recorded.
    const status = await coord2.getIndexingStatus(org);
    expect(status.state).toBe("DEGRADED");
    const runs = await coord2.listRuns(org);
    const failed = runs.find((r) => r.result === "RECONCILE_FAILED");
    expect(failed).toBeDefined();
    expect(failed?.resultingSnapshotId).toBeNull();
    for (const code of failed?.safeErrorCodes ?? []) {
      expect(/^[A-Z0-9_]+$/.test(code)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// (9) feature OFF performs no startup repository scan
// ---------------------------------------------------------------------------

describe("startup reconciliation — flag OFF performs no repository scan", () => {
  it("does not call loadOrganizationRecords on startup when disabled", async () => {
    const org = "org-off";
    const book = new SourceBook();
    book.set(org, baseRecords(org), "v1");
    let calls = 0;
    const loader: LoadOrganizationRecords = (o) => {
      calls += 1;
      return book.loader(o);
    };
    const h = makeHarness({ enabled: false, loader });

    await h.coordinator.start();
    expect(calls).toBe(0);
    // ingest is also a no-op when disabled — still no canonical read.
    const c = customerChange(org, "cu-1");
    expect(await h.coordinator.ingest(c.change, c.item)).toBeNull();
    await h.scheduler.runUntilIdle();
    expect(calls).toBe(0);
  });
});
