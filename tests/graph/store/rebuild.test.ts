// TERAGON Business Graph — atomic full-rebuild + fixture tests (Phase 4).
import { beforeEach, describe, expect, it } from "vitest";
import {
  IndexedDBGraphIndexStore,
  parseNodeId,
  rebuildOrganizationGraph,
} from "@/graph";
import {
  VALID_CONTEXT,
  buildValidRecords,
} from "../fixtures/validFixture";
import {
  ADVERSARIAL_CONTEXT,
  ADVERSARIAL_EXPECTED,
  buildAdversarialRecords,
} from "../fixtures/adversarialFixture";
import {
  cleanRecords,
  cleanRecordsWithUsers,
  contextFor,
  crossOrgFailingRecords,
  freshStore,
  makeClock,
  resetIndexedDB,
} from "./helpers";

describe("rebuildOrganizationGraph — valid canonical fixture", () => {
  let store: IndexedDBGraphIndexStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("builds, validates and activates with zero errors; persists 20 nodes / 20 edges", async () => {
    const result = await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, store, { now: makeClock() });
    expect(result.outcome).toBe("ACTIVATED");
    expect(result.activated).toBe(true);
    expect(result.validation?.valid).toBe(true);
    expect(result.validation?.errors).toEqual([]);

    const active = await store.getActiveSnapshot(VALID_CONTEXT.organizationId);
    expect(active).not.toBeNull();
    expect(active?.buildState).toBe("ACTIVE");
    expect(active?.nodeCount).toBe(20);
    expect(active?.edgeCount).toBe(20);
    expect(active?.nodes.length).toBe(20);
    expect(active?.edges.length).toBe(20);
  });

  it("persisted active graph carries no cross-organization edge", async () => {
    await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, store, { now: makeClock() });
    const active = await store.getActiveSnapshot(VALID_CONTEXT.organizationId);
    for (const edge of active?.edges ?? []) {
      expect(parseNodeId(edge.source).organizationId).toBe(edge.organizationId);
      expect(parseNodeId(edge.target).organizationId).toBe(edge.organizationId);
    }
  });

  it("carries NO sensitive body on any persisted node envelope", async () => {
    await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, store, { now: makeClock() });
    const active = await store.getActiveSnapshot(VALID_CONTEXT.organizationId);
    for (const node of active?.nodes ?? []) {
      for (const key of ["body", "content", "bodyMarkdown", "markdown", "prompt", "notes", "plainText"]) {
        expect(key in node.metadataSummary).toBe(false);
      }
    }
  });
});

describe("rebuildOrganizationGraph — adversarial fixture (activation blocked)", () => {
  it("rejects the mixed-org fixture: activation blocked, error issues present, no active snapshot", async () => {
    const store = freshStore();
    const result = await rebuildOrganizationGraph(buildAdversarialRecords(), ADVERSARIAL_CONTEXT, store, { now: makeClock() });
    expect(result.outcome).toBe("REJECTED_INVALID");
    expect(result.activated).toBe(false);
    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.errors.some((e) => e.code === "DERIVATION_ERRORS_PRESENT")).toBe(true);

    // the derivation refused (did not emit) the cross-org edges — none persisted.
    const staged = result.snapshot;
    expect(staged?.issueCounts.error).toBe(ADVERSARIAL_EXPECTED.errorIssues);
    for (const edge of staged?.edges ?? []) {
      expect(parseNodeId(edge.source).organizationId).toBe(parseNodeId(edge.target).organizationId);
    }

    // nothing became active.
    const active = await store.getActiveSnapshot(ADVERSARIAL_CONTEXT.organizationId);
    expect(active).toBeNull();
  });
});

describe("rebuildOrganizationGraph — determinism + idempotency", () => {
  it("identical input creates identical snapshotId + checksum across independent stores", async () => {
    const a = await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, freshStore(), { now: makeClock() });
    const b = await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, freshStore(), { now: makeClock("2030-01-01T00:00:00.000Z") });
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(a.snapshot?.checksum).toBe(b.snapshot?.checksum);
    expect(a.snapshot?.sourceHash).toBe(b.snapshot?.sourceHash);
  });

  it("rebuild is idempotent — a second identical rebuild keeps one active snapshot", async () => {
    const store = freshStore();
    const first = await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, store, { now: makeClock() });
    const second = await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, store, { now: makeClock() });
    expect(second.outcome).toBe("ACTIVATED");
    expect(second.snapshotId).toBe(first.snapshotId);
    const headers = await store.listSnapshots(VALID_CONTEXT.organizationId);
    expect(headers.length).toBe(1);
    const serving = headers.filter((h) => h.buildState === "ACTIVE" || h.buildState === "RECOVERY");
    expect(serving.length).toBe(1);
  });
});

describe("rebuildOrganizationGraph — atomic activation + supersede", () => {
  it("a newer valid rebuild supersedes the previous active; exactly one serving snapshot", async () => {
    const store = freshStore();
    const org = "org-supersede";
    const first = await rebuildOrganizationGraph(cleanRecords(), contextFor(org), store, { now: makeClock() });
    const second = await rebuildOrganizationGraph(cleanRecordsWithUsers(2), contextFor(org), store, { now: makeClock() });

    expect(second.outcome).toBe("ACTIVATED");
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(second.supersededSnapshotId).toBe(first.snapshotId);

    const active = await store.getActiveSnapshot(org);
    expect(active?.snapshotId).toBe(second.snapshotId);

    const headers = await store.listSnapshots(org);
    const serving = headers.filter((h) => h.buildState === "ACTIVE" || h.buildState === "RECOVERY");
    expect(serving.length).toBe(1);
    const prev = headers.find((h) => h.snapshotId === first.snapshotId);
    expect(prev?.buildState).toBe("SUPERSEDED");
  });
});

describe("rebuildOrganizationGraph — failure preserves the previous active", () => {
  beforeEach(() => {
    resetIndexedDB();
  });

  it("a failing rebuild leaves the prior active snapshot unchanged and exposes no partial state", async () => {
    const store = new IndexedDBGraphIndexStore({ now: makeClock() });
    const org = "org-preserve";
    const good = await rebuildOrganizationGraph(cleanRecords(), contextFor(org), store, { now: makeClock() });
    expect(good.outcome).toBe("ACTIVATED");
    const activeBefore = await store.getActiveSnapshot(org);

    // a rebuild that derives a foreign-org node ⇒ validation fails.
    const bad = await rebuildOrganizationGraph(crossOrgFailingRecords("org-foreign"), contextFor(org), store, { now: makeClock() });
    expect(bad.outcome).toBe("REJECTED_INVALID");
    expect(bad.activated).toBe(false);
    expect(bad.previousActiveSnapshotId).toBe(good.snapshotId);

    // previous ACTIVE snapshot is byte-for-byte unchanged and still served.
    const activeAfter = await store.getActiveSnapshot(org);
    expect(activeAfter?.snapshotId).toBe(activeBefore?.snapshotId);
    expect(activeAfter?.buildState).toBe("ACTIVE");
    expect(JSON.stringify(activeAfter)).toBe(JSON.stringify(activeBefore));
  });
});
