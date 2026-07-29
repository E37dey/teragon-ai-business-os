// TERAGON Business Graph — Phase 5 IndexedDB upgrade tests.
// Proves the v1→v2 bump is purely additive: an existing snapshot in a legacy v1
// DB survives, and the new coordinator-state stores appear.
import "fake-indexeddb/auto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GRAPH_INDEX_DB_NAME,
  GRAPH_INDEX_DB_VERSION,
  STORE_EVENT_CHECKPOINTS,
  STORE_FAILED_BATCHES,
  STORE_INDEXING_RUNS,
  STORE_INGEST_SEQUENCES,
  STORE_PENDING_EVENTS,
  STORE_PROCESSED_EVENTS,
  STORE_SOURCE_FINGERPRINTS,
  openGraphIndexDb,
} from "@/graph";

function reset(): void {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange as unknown as typeof globalThis.IDBKeyRange;
}

const LEGACY_V1_STORES = [
  "graphManifests",
  "graphSnapshots",
  "graphNodes",
  "graphEdges",
  "graphIssues",
  "graphRecoveryPoints",
];

describe("graph-index DB — v1 → v2 upgrade", () => {
  beforeEach(() => reset());

  it("preserves an existing snapshot header and adds the new coordinator stores", async () => {
    // 1) create a genuine LEGACY v1 DB with only the Phase-4 stores + one snapshot.
    const legacy = await openDB(GRAPH_INDEX_DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore("graphManifests", { keyPath: "organizationId" });
        db.createObjectStore("graphSnapshots", { keyPath: "snapshotId" });
        db.createObjectStore("graphNodes", { keyPath: "key" });
        db.createObjectStore("graphEdges", { keyPath: "key" });
        db.createObjectStore("graphIssues", { keyPath: "key" });
        db.createObjectStore("graphRecoveryPoints", { keyPath: "recoveryPointId" });
      },
    });
    await legacy.put("graphSnapshots", { snapshotId: "snap-legacy-1", organizationId: "org-legacy", checksum: "abc" });
    await legacy.put("graphManifests", { organizationId: "org-legacy", activeSnapshotId: "snap-legacy-1", snapshotIds: ["snap-legacy-1"] });
    legacy.close();

    // 2) open at the CURRENT version via the shared opener → runs the v2 upgrade.
    const upgraded = await openGraphIndexDb();
    expect(upgraded.version).toBe(GRAPH_INDEX_DB_VERSION);

    // 3) the legacy data survived untouched.
    const survived = await upgraded.get("graphSnapshots", "snap-legacy-1");
    expect(survived).toMatchObject({ snapshotId: "snap-legacy-1", organizationId: "org-legacy", checksum: "abc" });
    const manifest = await upgraded.get("graphManifests", "org-legacy");
    expect(manifest).toMatchObject({ activeSnapshotId: "snap-legacy-1" });

    // 4) every legacy store AND every new coordinator store now exists.
    for (const name of LEGACY_V1_STORES) {
      expect(upgraded.objectStoreNames.contains(name)).toBe(true);
    }
    for (const name of [
      STORE_EVENT_CHECKPOINTS,
      STORE_INDEXING_RUNS,
      STORE_PROCESSED_EVENTS,
      STORE_FAILED_BATCHES,
      STORE_PENDING_EVENTS,
      STORE_INGEST_SEQUENCES,
      STORE_SOURCE_FINGERPRINTS,
    ]) {
      expect(upgraded.objectStoreNames.contains(name)).toBe(true);
    }
    upgraded.close();
  });
});
