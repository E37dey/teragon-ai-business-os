// TERAGON Business Graph — retention + recovery tests (Phase 4).
import { describe, expect, it } from "vitest";
import {
  recoverOrganizationIndex,
  rebuildOrganizationGraph,
  selectExpiredSnapshotIds,
  verifyRecoveryCandidate,
  buildIndexSnapshot,
  deriveOrganizationGraphSnapshot,
  type GraphIndexSnapshotHeader,
} from "@/graph";
import {
  cleanRecords,
  cleanRecordsWithUsers,
  contextFor,
  freshStore,
  makeClock,
} from "./helpers";

describe("retention — selectExpiredSnapshotIds (pure)", () => {
  it("keeps active + previous known-good + keepHistorical; expires only older history", () => {
    const headers = ["s1", "s2", "s3", "s4", "s5"].map(
      (id): GraphIndexSnapshotHeader => ({
        snapshotId: id,
        organizationId: "org",
        createdAt: "",
        sourceSnapshotVersion: "",
        sourceHash: "h",
        registryVersion: "core-v1",
        schemaVersion: "graph-index-v1",
        derivationVersion: "phase-3",
        nodeCount: 0,
        edgeCount: 0,
        issueCounts: { error: 0, warning: 0, info: 0 },
        validationState: "VALID",
        buildState: id === "s5" ? "ACTIVE" : "SUPERSEDED",
        activatedAt: null,
        supersedesSnapshotId: null,
        checksum: "c",
        unmappableCount: 0,
      }),
    );
    const expired = selectExpiredSnapshotIds(headers, "s5", { keepHistorical: 1 });
    expect(expired).toEqual(["s1", "s2"]);
  });
});

describe("retention — deleteExpiredSnapshots removes only eligible historical snapshots", () => {
  it("keeps the active + kept history and returns the deleted ids", async () => {
    const store = freshStore({ retention: { keepHistorical: 1 } });
    const org = "org-retention";
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await rebuildOrganizationGraph(cleanRecordsWithUsers(i), contextFor(org), store, { now: makeClock() });
      ids.push(r.snapshotId as string);
    }
    const active = await store.getActiveSnapshot(org);
    expect(active?.snapshotId).toBe(ids[4]);

    const deleted = await store.deleteExpiredSnapshots(org);
    expect(deleted.sort()).toEqual([ids[0], ids[1]].sort());

    expect(await store.getSnapshot(ids[0]!)).toBeNull();
    expect(await store.getSnapshot(ids[1]!)).toBeNull();
    expect(await store.getSnapshot(ids[2]!)).not.toBeNull();
    expect(await store.getSnapshot(ids[3]!)).not.toBeNull();
    expect((await store.getActiveSnapshot(org))?.snapshotId).toBe(ids[4]);
  });
});

describe("recovery — restores a previous known-good snapshot non-destructively", () => {
  it("recovers to the prior known-good, records a recovery point, keeps exactly one serving", async () => {
    const store = freshStore();
    const org = "org-recovery";
    const a = await rebuildOrganizationGraph(cleanRecords(), contextFor(org), store, { now: makeClock() });
    const b = await rebuildOrganizationGraph(cleanRecordsWithUsers(1), contextFor(org), store, { now: makeClock() });
    expect((await store.getActiveSnapshot(org))?.snapshotId).toBe(b.snapshotId);

    const point = await recoverOrganizationIndex(store, org);
    expect(point).not.toBeNull();
    expect(point?.restoredSnapshotId).toBe(a.snapshotId);
    expect(point?.replacedSnapshotId).toBe(b.snapshotId);

    const active = await store.getActiveSnapshot(org);
    expect(active?.snapshotId).toBe(a.snapshotId);
    expect(active?.buildState).toBe("RECOVERY");

    const headers = await store.listSnapshots(org);
    const serving = headers.filter((h) => h.buildState === "ACTIVE" || h.buildState === "RECOVERY");
    expect(serving.length).toBe(1);
    // the replaced snapshot is now superseded, not lost.
    expect(headers.find((h) => h.snapshotId === b.snapshotId)?.buildState).toBe("SUPERSEDED");
  });

  it("recovery does NOT mutate the canonical records it was derived from", async () => {
    const store = freshStore();
    const org = "org-canonical-immutable";
    const records = cleanRecords();
    const before = JSON.stringify(records);
    await rebuildOrganizationGraph(records, contextFor(org), store, { now: makeClock() });
    await rebuildOrganizationGraph(cleanRecordsWithUsers(1), contextFor(org), store, { now: makeClock() });
    await recoverOrganizationIndex(store, org);
    expect(JSON.stringify(records)).toBe(before);
  });
});

describe("recovery — verifyRecoveryCandidate", () => {
  it("rejects a candidate from a different organization", () => {
    const ctx = contextFor("org-real");
    const derivation = deriveOrganizationGraphSnapshot(cleanRecords(), ctx);
    const snapshot = buildIndexSnapshot(derivation, ctx, { now: makeClock() }).snapshot;
    const validated = { ...snapshot, validationState: "VALID" as const };
    expect(verifyRecoveryCandidate(validated, "org-real")).toBe(true);
    expect(verifyRecoveryCandidate(validated, "org-other")).toBe(false);
  });
});
