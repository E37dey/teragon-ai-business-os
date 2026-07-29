// TERAGON Business Graph — Phase 5 coordinator behavior tests.
// Injected clock + hand-driven scheduler (NO real sleeps). Proves the full
// event→full-rebuild coordination contract.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  GraphIndexingCoordinator,
  GraphIndexingStateStore,
  IndexedDBGraphIndexStore,
  type CanonicalRecord,
  type LoadOrganizationRecords,
  type OrganizationRecordsSnapshot,
} from "@/graph";
import {
  FakeRepository,
  ManualScheduler,
  baseRecords,
  customerChange,
  makeClock,
  makeHarness,
  memoryRecord,
} from "./helpers";

type RecordMap = Partial<Record<string, CanonicalRecord[]>>;

/** A mutable per-org source holder the loader reads from. */
class SourceBook {
  private readonly map = new Map<string, OrganizationRecordsSnapshot>();
  set(org: string, records: RecordMap, sourceSnapshotVersion: string): void {
    this.map.set(org, { records, sourceSnapshotVersion });
  }
  loader: LoadOrganizationRecords = (org) => {
    const snap = this.map.get(org);
    if (!snap) return Promise.reject(new Error(`no records for ${org}`));
    // hand back a deep clone so the coordinator reads a consistent snapshot.
    return Promise.resolve({
      records: structuredClone(snap.records),
      sourceSnapshotVersion: snap.sourceSnapshotVersion,
    });
  };
}

describe("coordinator — feature flag OFF", () => {
  it("registers NO consumer and ingests nothing when disabled", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1"), "v1");
    const h = makeHarness({ enabled: false, loader: book.loader });
    const repo = new FakeRepository("customers");

    const unsub = h.coordinator.register([repo]);
    expect(repo.subscribeCalls).toBe(0);

    const { change, item } = customerChange("org-1", "cu-1");
    const result = await h.coordinator.ingest(change, item);
    expect(result).toBeNull();
    await h.scheduler.runUntilIdle();
    expect(await h.graphStore.getActiveSnapshot("org-1")).toBeNull();
    unsub();
  });
});

describe("coordinator — a committed event triggers one full rebuild", () => {
  it("activates a complete snapshot and advances the checkpoint", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1"), "v1");
    const h = makeHarness({ loader: book.loader });

    const { change, item } = customerChange("org-1", "cu-1");
    const ev = await h.coordinator.ingest(change, item);
    await h.scheduler.runUntilIdle();

    const active = await h.graphStore.getActiveSnapshot("org-1");
    expect(active).not.toBeNull();
    expect(active?.nodes.some((n) => n.entityType === "customer")).toBe(true);

    const runs = await h.coordinator.listRuns("org-1");
    expect(runs.length).toBe(1);
    expect(runs[0]?.result).toBe("ACTIVATED");

    const cp = await h.coordinator.getCheckpoint("org-1");
    expect(cp?.lastIngestSequence).toBe(ev?.ingestSequence);
  });
});

describe("coordinator — dedup + coalesce", () => {
  it("processes a duplicate eventId only once", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1"), "v1");
    const h = makeHarness({ loader: book.loader });

    const { change, item } = customerChange("org-1", "cu-1", "update");
    await h.coordinator.ingest(change, item);
    await h.coordinator.ingest(change, item); // identical eventId
    await h.scheduler.runUntilIdle();

    const runs = await h.coordinator.listRuns("org-1");
    const activated = runs.filter((r) => r.result === "ACTIVATED");
    expect(activated.length).toBe(1);
    expect(activated[0]?.batchEventIds.length).toBe(1);
  });

  it("coalesces multiple events into ONE rebuild", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1", ["cu-1", "cu-2", "cu-3"]), "v1");
    const h = makeHarness({ loader: book.loader });

    for (const id of ["cu-1", "cu-2", "cu-3"]) {
      const { change, item } = customerChange("org-1", id);
      await h.coordinator.ingest(change, item);
    }
    await h.scheduler.runUntilIdle();

    const runs = await h.coordinator.listRuns("org-1");
    const activated = runs.filter((r) => r.result === "ACTIVATED");
    expect(activated.length).toBe(1);
    expect(activated[0]?.batchEventIds.length).toBe(3);
    const active = await h.graphStore.getActiveSnapshot("org-1");
    expect(active?.nodes.filter((n) => n.entityType === "customer").length).toBe(3);
  });
});

describe("coordinator — idempotency", () => {
  it("a repeated event stream does not create a second active snapshot", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1"), "v1");
    const h = makeHarness({ loader: book.loader });

    const { change, item } = customerChange("org-1", "cu-1", "update");
    await h.coordinator.ingest(change, item);
    await h.scheduler.runUntilIdle();
    const first = await h.graphStore.getActiveSnapshot("org-1");

    // replay the SAME event again (new sequence, same eventId + same source).
    await h.coordinator.ingest(change, item);
    await h.scheduler.runUntilIdle();
    const second = await h.graphStore.getActiveSnapshot("org-1");

    expect(second?.snapshotId).toBe(first?.snapshotId);
    const headers = await h.graphStore.listSnapshots("org-1");
    expect(headers.length).toBe(1);
  });
});

describe("coordinator — NO_OP on unchanged source", () => {
  it("a batch whose derived sourceHash equals the active one is a NO_OP that advances the checkpoint but creates no snapshot", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1"), "v1");
    const h = makeHarness({ loader: book.loader });

    // first event → ACTIVATED
    const a = customerChange("org-1", "cu-1");
    await h.coordinator.ingest(a.change, a.item);
    await h.scheduler.runUntilIdle();
    const active1 = await h.graphStore.getActiveSnapshot("org-1");
    const headers1 = await h.graphStore.listSnapshots("org-1");

    // a DIFFERENT event (distinct eventId) but the SAME unchanged source → NO_OP
    const b = customerChange("org-1", "cu-1", "update");
    const evb = await h.coordinator.ingest(b.change, b.item);
    await h.scheduler.runUntilIdle();

    const active2 = await h.graphStore.getActiveSnapshot("org-1");
    const headers2 = await h.graphStore.listSnapshots("org-1");
    expect(active2?.snapshotId).toBe(active1?.snapshotId); // no new snapshot
    expect(headers2.length).toBe(headers1.length);

    const runs = await h.coordinator.listRuns("org-1");
    expect(runs.some((r) => r.result === "NO_OP")).toBe(true);
    const cp = await h.coordinator.getCheckpoint("org-1");
    expect(cp?.lastIngestSequence).toBe(evb?.ingestSequence); // checkpoint advanced
  });
});

describe("coordinator — one rebuild in-flight + events during a rebuild", () => {
  it("an event arriving DURING a rebuild triggers exactly ONE subsequent rebuild", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1", ["cu-1"]), "v1");
    const h = makeHarness({ loader: book.loader });

    // wrap the loader so the FIRST rebuild ingests a new event mid-flight, then
    // upgrades the source so the subsequent rebuild is a real activation.
    let fired = false;
    const wrapped: LoadOrganizationRecords = async (org) => {
      const snap = await book.loader(org);
      if (org === "org-1" && !fired) {
        fired = true;
        book.set("org-1", baseRecords("org-1", ["cu-1", "cu-2"]), "v2");
        const mid = customerChange("org-1", "cu-2");
        await h.coordinator.ingest(mid.change, mid.item);
      }
      return snap; // this call still returns the pre-mutation snapshot (v1)
    };
    // rebuild the coordinator with the wrapped loader over the same stores.
    const coordinator = new GraphIndexingCoordinator({
      graphStore: h.graphStore,
      stateStore: h.stateStore,
      loadOrganizationRecords: wrapped,
      scheduler: h.scheduler,
      clock: h.clock,
      enabled: true,
    });

    const first = customerChange("org-1", "cu-1");
    await coordinator.ingest(first.change, first.item);
    await h.scheduler.runUntilIdle();

    const runs = await coordinator.listRuns("org-1");
    const activated = runs.filter((r) => r.result === "ACTIVATED");
    expect(activated.length).toBe(2); // exactly one subsequent rebuild
    const active = await h.graphStore.getActiveSnapshot("org-1");
    expect(active?.nodes.filter((n) => n.entityType === "customer").length).toBe(2);
  });
});

describe("coordinator — organization isolation", () => {
  it("different orgs are processed independently and never share state", async () => {
    const book = new SourceBook();
    book.set("org-A", baseRecords("org-A", ["cu-a"]), "vA");
    book.set("org-B", baseRecords("org-B", ["cu-b"]), "vB");
    const h = makeHarness({ loader: book.loader });

    const a = customerChange("org-A", "cu-a");
    const b = customerChange("org-B", "cu-b");
    await h.coordinator.ingest(a.change, a.item);
    await h.coordinator.ingest(b.change, b.item);
    await h.scheduler.runUntilIdle();

    const activeA = await h.graphStore.getActiveSnapshot("org-A");
    const activeB = await h.graphStore.getActiveSnapshot("org-B");
    expect(activeA?.organizationId).toBe("org-A");
    expect(activeB?.organizationId).toBe("org-B");
    expect(activeA?.snapshotId).not.toBe(activeB?.snapshotId);
    for (const n of activeA?.nodes ?? []) expect(n.organizationId).toBe("org-A");
    const cpA = await h.coordinator.getCheckpoint("org-A");
    const cpB = await h.coordinator.getCheckpoint("org-B");
    expect(cpA?.organizationId).toBe("org-A");
    expect(cpB?.organizationId).toBe("org-B");
  });
});

describe("coordinator — deterministic ordering by aggregateVersion (not wall-clock)", () => {
  it("orders out-of-order events by committed version, ignoring arrival + occurredAt", async () => {
    const org = "org-order";
    const book = new SourceBook();
    book.set(org, { ...baseRecords(org), memoryRecords: [memoryRecord(org, "mem-1", 2)] }, "v1");
    const h = makeHarness({ loader: book.loader });

    // v2 arrives FIRST (earlier occurredAt), v1 SECOND (later occurredAt).
    const v2 = memoryRecord(org, "mem-1", 2, "2026-07-02T00:00:00.000Z") as unknown as import("@/domain/types").BaseEntity;
    const v1 = memoryRecord(org, "mem-1", 1, "2026-07-09T00:00:00.000Z") as unknown as import("@/domain/types").BaseEntity;
    await h.coordinator.ingest({ type: "update", collection: "memoryRecords", id: "mem-1", item: v2 }, v2);
    await h.coordinator.ingest({ type: "update", collection: "memoryRecords", id: "mem-1", item: v1 }, v1);
    await h.scheduler.runUntilIdle();

    const runs = await h.coordinator.listRuns(org);
    const activated = runs.find((r) => r.result === "ACTIVATED" || r.result === "NO_OP");
    // canonical order: version 1 (eventId …:1:…) BEFORE version 2 (…:2:…).
    expect(activated?.batchEventIds).toEqual([
      "memoryRecords:mem-1:1:APPROVE",
      "memoryRecords:mem-1:2:APPROVE",
    ]);
  });
});

describe("coordinator — deletion via full rebuild", () => {
  it("a delete event removes stale graph state through a complete rebuild", async () => {
    const org = "org-del";
    const book = new SourceBook();
    book.set(org, baseRecords(org, ["cu-1", "cu-2"]), "v1");
    const h = makeHarness({ loader: book.loader });

    const c = customerChange(org, "cu-1");
    await h.coordinator.ingest(c.change, c.item);
    await h.scheduler.runUntilIdle();
    const before = await h.graphStore.getActiveSnapshot(org);
    expect(before?.nodes.filter((n) => n.entityType === "customer").length).toBe(2);

    // remove cu-2 from source (+ bump version) and emit the remove event.
    book.set(org, baseRecords(org, ["cu-1"]), "v2");
    const del = customerChange(org, "cu-2", "remove");
    await h.coordinator.ingest(del.change, del.item);
    await h.scheduler.runUntilIdle();

    const after = await h.graphStore.getActiveSnapshot(org);
    const customers = after?.nodes.filter((n) => n.entityType === "customer") ?? [];
    expect(customers.length).toBe(1);
    expect(customers.some((n) => n.id.includes("cu-2"))).toBe(false);
  });
});

describe("coordinator — rejected proposal is never authoritative", () => {
  it("an unapproved aiRecommendation (approvalState !== מאושר) does not become a canonical edge", async () => {
    const org = "org-rej";
    const book = new SourceBook();
    // an aiRecommendation with an approval that is NOT מאושר.
    const records: RecordMap = {
      ...baseRecords(org),
      agents: [{ id: "ag-1", name: "סוכן", status: "פעיל", promptVersion: 1, createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-07-02T09:00:00.000Z" }],
      aiRecommendations: [{ id: "rec-1", agentId: "ag-1", approvalRequired: true, approvalState: "ממתין", createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-07-02T09:00:00.000Z" }],
    };
    book.set(org, records, "v1");
    const h = makeHarness({ loader: book.loader });

    const c = customerChange(org, "cu-1");
    await h.coordinator.ingest(c.change, c.item);
    await h.scheduler.runUntilIdle();

    const active = await h.graphStore.getActiveSnapshot(org);
    // the recommendation is not approved ⇒ no authoritative CANONICAL edge from it.
    const recEdges = (active?.edges ?? []).filter((e) => e.source.includes("aiRecommendation") && e.authority === "CANONICAL");
    expect(recEdges.length).toBe(0);
  });
});

describe("coordinator — failure preserves the active snapshot + bounded retry + HALT", () => {
  it("a failing rebuild preserves the active snapshot, does not advance the checkpoint, retries a bounded number of times, then HALTS the org", async () => {
    const org = "org-fail";
    const book = new SourceBook();
    book.set(org, baseRecords(org), "v1");
    const h = makeHarness({ loader: book.loader, maxRetries: 2, retryBackoffMs: 1000 });

    // 1) a clean event → ACTIVATED.
    const good = customerChange(org, "cu-1");
    await h.coordinator.ingest(good.change, good.item);
    await h.scheduler.runUntilIdle();
    const activeGood = await h.graphStore.getActiveSnapshot(org);
    const cpGood = await h.coordinator.getCheckpoint(org);
    expect(activeGood).not.toBeNull();

    // 2) poison the source so the NEXT rebuild fails validation (foreign-org node).
    book.set(org, { ...baseRecords(org), memoryRecords: [memoryRecord("org-foreign", "mem-x", 1)] }, "v2");
    const bad = customerChange(org, "cu-9", "update");
    await h.coordinator.ingest(bad.change, bad.item);
    await h.scheduler.runUntilIdle(); // first failure → RETRY_PENDING

    // active snapshot preserved + checkpoint NOT advanced.
    const afterFail1 = await h.graphStore.getActiveSnapshot(org);
    expect(afterFail1?.snapshotId).toBe(activeGood?.snapshotId);
    const cpFail1 = await h.coordinator.getCheckpoint(org);
    expect(cpFail1?.lastIngestSequence).toBe(cpGood?.lastIngestSequence);
    expect((await h.coordinator.getIndexingStatus(org)).state).toBe("DEGRADED");

    // drive the bounded retries via the scheduler (no real sleeps).
    await h.scheduler.advance(1000); // retry 1
    await h.scheduler.advance(2000); // retry 2 → exhausted → HALT

    const status = await h.coordinator.getIndexingStatus(org);
    expect(status.state).toBe("REBUILD_REQUIRED");
    expect(status.halted).toBe(true);
    const cpHalt = await h.coordinator.getCheckpoint(org);
    expect(cpHalt?.lastIngestSequence).toBe(cpGood?.lastIngestSequence); // still not advanced
    const finalActive = await h.graphStore.getActiveSnapshot(org);
    expect(finalActive?.snapshotId).toBe(activeGood?.snapshotId); // preserved throughout

    const runs = await h.coordinator.listRuns(org);
    expect(runs.some((r) => r.result === "HALTED")).toBe(true);
    // no infinite loop: retries are bounded, no timers remain queued.
    expect(h.scheduler.pendingTimers()).toBe(0);
  });

  it("HALTS only the affected org — a healthy org keeps rebuilding", async () => {
    const book = new SourceBook();
    book.set("org-bad", { ...baseRecords("org-bad"), memoryRecords: [memoryRecord("org-foreign", "mem-x", 1)] }, "v1");
    book.set("org-ok", baseRecords("org-ok"), "v1");
    const h = makeHarness({ loader: book.loader, maxRetries: 1, retryBackoffMs: 500 });

    const bad = customerChange("org-bad", "cu-1");
    const ok = customerChange("org-ok", "cu-1");
    await h.coordinator.ingest(bad.change, bad.item);
    await h.coordinator.ingest(ok.change, ok.item);
    await h.scheduler.runUntilIdle();
    await h.scheduler.advance(10_000); // drive org-bad retries to exhaustion

    expect((await h.coordinator.getIndexingStatus("org-bad")).halted).toBe(true);
    expect(await h.graphStore.getActiveSnapshot("org-bad")).toBeNull();

    const okStatus = await h.coordinator.getIndexingStatus("org-ok");
    expect(okStatus.halted).toBe(false);
    expect(await h.graphStore.getActiveSnapshot("org-ok")).not.toBeNull();
  });
});

describe("coordinator — startup replay after checkpoint", () => {
  it("a restarted coordinator replays durable pending events and rebuilds once", async () => {
    const book = new SourceBook();
    book.set("org-1", baseRecords("org-1"), "v1");
    const h = makeHarness({ loader: book.loader });

    // ingest WITHOUT draining (simulate a crash before processing).
    const c = customerChange("org-1", "cu-1");
    await h.coordinator.ingest(c.change, c.item);
    expect(await h.graphStore.getActiveSnapshot("org-1")).toBeNull();

    // "restart": a NEW coordinator + scheduler over the SAME durable stores.
    const scheduler2 = new ManualScheduler();
    const coord2 = new GraphIndexingCoordinator({
      graphStore: h.graphStore,
      stateStore: h.stateStore,
      loadOrganizationRecords: book.loader,
      scheduler: scheduler2,
      clock: makeClock("2026-08-01T00:00:00.000Z"),
      enabled: true,
    });
    await coord2.start();
    await scheduler2.runUntilIdle();

    const active = await h.graphStore.getActiveSnapshot("org-1");
    expect(active).not.toBeNull();
    const runs = await coord2.listRuns("org-1");
    expect(runs.filter((r) => r.result === "ACTIVATED").length).toBe(1);
  });
});

describe("coordinator — no in-place mutation of an active snapshot", () => {
  it("a second activation leaves the first snapshot's content byte-identical (never patched)", async () => {
    const org = "org-immut";
    const book = new SourceBook();
    book.set(org, baseRecords(org, ["cu-1"]), "v1");
    const h = makeHarness({ loader: book.loader });

    const a = customerChange(org, "cu-1");
    await h.coordinator.ingest(a.change, a.item);
    await h.scheduler.runUntilIdle();
    const first = await h.graphStore.getActiveSnapshot(org);
    const firstId = first?.snapshotId as string;
    const firstJson = JSON.stringify({ nodes: first?.nodes, edges: first?.edges, checksum: first?.checksum });

    // a real content change → a NEW activation.
    book.set(org, baseRecords(org, ["cu-1", "cu-2"]), "v2");
    const b = customerChange(org, "cu-2");
    await h.coordinator.ingest(b.change, b.item);
    await h.scheduler.runUntilIdle();

    const second = await h.graphStore.getActiveSnapshot(org);
    expect(second?.snapshotId).not.toBe(firstId);
    // the ORIGINAL snapshot is untouched — same nodes/edges/checksum as before.
    const firstReRead = await h.graphStore.getSnapshot(firstId);
    expect(JSON.stringify({ nodes: firstReRead?.nodes, edges: firstReRead?.edges, checksum: firstReRead?.checksum })).toBe(firstJson);
  });
});

describe("coordinator — no sensitive payload in durable logs", () => {
  it("neither the run/checkpoint nor a failure log contains entity bodies or secrets", async () => {
    const org = "org-secret";
    const book = new SourceBook();
    book.set(org, { ...baseRecords(org), memoryRecords: [memoryRecord("org-foreign", "mem-x", 1)] }, "v1");
    const h = makeHarness({ loader: book.loader, maxRetries: 0 });

    const item = { id: "cu-1", organizationId: org, notes: "SECRET-NOTES-777", prompt: "SECRET-PROMPT-777", status: "פעיל", createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-07-02T09:00:00.000Z" } as unknown as import("@/domain/types").BaseEntity;
    await h.coordinator.ingest({ type: "update", collection: "customers", id: "cu-1", item }, item);
    await h.scheduler.runUntilIdle(); // fails validation, maxRetries 0 → HALT immediately

    const runs = await h.coordinator.listRuns(org);
    const failures = await h.coordinator.listFailures(org);
    const cp = await h.coordinator.getCheckpoint(org);
    const serialized = JSON.stringify({ runs, failures, cp });
    for (const secret of ["SECRET-NOTES-777", "SECRET-PROMPT-777", "org-foreign"]) {
      expect(serialized.includes(secret)).toBe(false);
    }
    // failure diagnostics carry only SAFE error codes.
    expect(failures.length).toBeGreaterThan(0);
    for (const code of failures[0]?.safeErrorCodes ?? []) {
      expect(/^[A-Z0-9_]+$/.test(code)).toBe(true);
    }
  });
});

describe("coordinator — durable state store type is the shared DB", () => {
  it("uses IndexedDBGraphIndexStore + GraphIndexingStateStore over one DB", () => {
    // a light guard that the wiring types line up (compile + construct).
    const state = new GraphIndexingStateStore();
    const graph = new IndexedDBGraphIndexStore();
    expect(state).toBeInstanceOf(GraphIndexingStateStore);
    expect(graph).toBeInstanceOf(IndexedDBGraphIndexStore);
  });
});
