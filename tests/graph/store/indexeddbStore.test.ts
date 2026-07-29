// TERAGON Business Graph — IndexedDB store behavior tests (Phase 4).
import { describe, expect, it } from "vitest";
import {
  buildIndexSnapshot,
  deriveOrganizationGraphSnapshot,
  rebuildOrganizationGraph,
  GraphIndexError,
} from "@/graph";
import {
  ADVERSARIAL_CONTEXT,
  buildAdversarialRecords,
} from "../fixtures/adversarialFixture";
import {
  cleanRecords,
  contextFor,
  freshStore,
  makeClock,
  openRawGraphIndexDb,
} from "./helpers";

describe("store — staging visibility", () => {
  it("a staged snapshot is NOT visible as active and reads back as STAGED", async () => {
    const store = freshStore();
    const org = "org-stage";
    const ctx = contextFor(org);
    const derivation = deriveOrganizationGraphSnapshot(cleanRecords(), ctx);
    const built = buildIndexSnapshot(derivation, ctx, { now: makeClock() });
    await store.stageSnapshot(built.snapshot);

    expect(await store.getActiveSnapshot(org)).toBeNull();
    const read = await store.getSnapshot(built.snapshot.snapshotId);
    expect(read?.buildState).toBe("STAGED");
    expect(read?.validationState).toBe("UNVALIDATED");
  });
});

describe("store — invalid snapshot cannot activate", () => {
  it("an INVALID snapshot throws on activateSnapshot", async () => {
    const store = freshStore();
    const derivation = deriveOrganizationGraphSnapshot(buildAdversarialRecords(), ADVERSARIAL_CONTEXT);
    const built = buildIndexSnapshot(derivation, ADVERSARIAL_CONTEXT, { now: makeClock() });
    await store.stageSnapshot(built.snapshot);
    const validation = await store.validateStagedSnapshot(built.snapshot.snapshotId);
    expect(validation.valid).toBe(false);

    await expect(store.activateSnapshot(built.snapshot.snapshotId)).rejects.toBeInstanceOf(GraphIndexError);
    expect(await store.getActiveSnapshot(ADVERSARIAL_CONTEXT.organizationId)).toBeNull();
  });
});

describe("store — organization isolation", () => {
  it("org A never sees org B's snapshot data", async () => {
    const store = freshStore();
    const a = await rebuildOrganizationGraph(cleanRecords(), contextFor("org-A"), store, { now: makeClock() });
    const b = await rebuildOrganizationGraph(cleanRecords(), contextFor("org-B"), store, { now: makeClock() });
    expect(a.snapshotId).not.toBe(b.snapshotId);

    const activeA = await store.getActiveSnapshot("org-A");
    const activeB = await store.getActiveSnapshot("org-B");
    expect(activeA?.organizationId).toBe("org-A");
    expect(activeB?.organizationId).toBe("org-B");
    for (const node of activeA?.nodes ?? []) expect(node.organizationId).toBe("org-A");
    for (const node of activeB?.nodes ?? []) expect(node.organizationId).toBe("org-B");

    const headersA = await store.listSnapshots("org-A");
    expect(headersA.every((h) => h.organizationId === "org-A")).toBe(true);
    expect(headersA.some((h) => h.snapshotId === b.snapshotId)).toBe(false);
  });

  it("two snapshots in one org never mix their node sets", async () => {
    const store = freshStore();
    const org = "org-nomix";
    const derivation1 = deriveOrganizationGraphSnapshot(cleanRecords(), contextFor(org));
    const built1 = buildIndexSnapshot(derivation1, contextFor(org), { now: makeClock() });
    await store.stageSnapshot(built1.snapshot);

    const active = await rebuildOrganizationGraph(cleanRecords(), contextFor(org), store, { now: makeClock() });
    const staged = await store.getSnapshot(built1.snapshot.snapshotId);
    const activeSnap = await store.getSnapshot(active.snapshotId ?? "");
    // both belong to the org; each returns only its own rows.
    expect(staged?.nodes.every((n) => n.organizationId === org)).toBe(true);
    expect(activeSnap?.nodes.every((n) => n.organizationId === org)).toBe(true);
  });
});

describe("store — discard", () => {
  it("discards a staged snapshot and its rows", async () => {
    const store = freshStore();
    const org = "org-discard";
    const ctx = contextFor(org);
    const derivation = deriveOrganizationGraphSnapshot(cleanRecords(), ctx);
    const built = buildIndexSnapshot(derivation, ctx, { now: makeClock() });
    await store.stageSnapshot(built.snapshot);
    await store.discardStagedSnapshot(built.snapshot.snapshotId);
    expect(await store.getSnapshot(built.snapshot.snapshotId)).toBeNull();
    const headers = await store.listSnapshots(org);
    expect(headers.some((h) => h.snapshotId === built.snapshot.snapshotId)).toBe(false);
  });

  it("refuses to discard a served (ACTIVE) snapshot", async () => {
    const store = freshStore();
    const org = "org-noactivediscard";
    const result = await rebuildOrganizationGraph(cleanRecords(), contextFor(org), store, { now: makeClock() });
    await expect(store.discardStagedSnapshot(result.snapshotId ?? "")).rejects.toBeInstanceOf(GraphIndexError);
    expect(await store.getActiveSnapshot(org)).not.toBeNull();
  });
});

describe("store — corruption + partial-write detection", () => {
  it("detects checksum corruption via getHealth (CORRUPT)", async () => {
    const store = freshStore();
    const org = "org-corrupt";
    const result = await rebuildOrganizationGraph(cleanRecords(), contextFor(org), store, { now: makeClock() });
    const snapshotId = result.snapshotId as string;

    // simulate external corruption of the stored header checksum.
    const raw = await openRawGraphIndexDb();
    const header = await raw.get("graphSnapshots", snapshotId);
    header.checksum = "0000000000000000";
    await raw.put("graphSnapshots", header);
    raw.close();

    const health = await store.getHealth(org);
    expect(health.state).toBe("CORRUPT");
    expect(health.checksumVerified).toBe(false);
  });

  it("detects a partial IndexedDB write (a missing node row) as CORRUPT", async () => {
    const store = freshStore();
    const org = "org-partial";
    await rebuildOrganizationGraph(cleanRecords(), contextFor(org), store, { now: makeClock() });

    // delete one persisted node row directly.
    const raw = await openRawGraphIndexDb();
    const keys = await raw.getAllKeys("graphNodes");
    await raw.delete("graphNodes", keys[0]!);
    raw.close();

    const health = await store.getHealth(org);
    expect(health.state).toBe("CORRUPT");
  });
});

describe("store — health when nothing is indexed", () => {
  it("reports MISSING when there is no active snapshot", async () => {
    const store = freshStore();
    const health = await store.getHealth("org-empty");
    expect(health.state).toBe("MISSING");
    expect(health.activeSnapshotId).toBeNull();
  });
});
