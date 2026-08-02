// TERAGON Business Graph — Phase 10 RUNTIME feature-flag matrix tests.
// All FOUR combinations of the facade flag × the indexing flag, over a REAL
// IndexedDB-backed store shared between the coordinator and the runtime facade.
// Phase 10 itself starts NO event subscriptions and never mutates the active
// snapshot.
import { describe, expect, it } from "vitest";
import {
  GraphIndexingCoordinator,
  RuntimeBusinessGraphComposition,
  type BusinessGraphTraversalStore,
  type GraphIndexStore,
} from "@/graph";
import {
  FakeRepository,
  ManualScheduler,
  baseRecords,
  customerChange,
  makeHarness,
} from "../indexing/helpers";
import {
  activeUser,
  CLOCK,
  counterExec,
  nid,
  recordingStoreProvider,
  reqCtx,
  trustedSession,
  userLookupFrom,
} from "./helpers";

const ORG = "org-1";

function runtime(store: GraphIndexStore | BusinessGraphTraversalStore, facadeEnabled: boolean) {
  const rp = recordingStoreProvider(store);
  const composition = new RuntimeBusinessGraphComposition({
    sessionSource: { lookup: () => trustedSession({ organizationId: ORG }) },
    userLookup: userLookupFrom([activeUser("u-tzachi")]),
    storeProviderFactory: () => rp.provider,
    clock: CLOCK,
    executionIdProvider: counterExec("e"),
    featureOverride: facadeEnabled,
    rolloutOverride: true,
  });
  return { composition, lifecycle: composition.createLifecycle(), rp };
}

const SUBJECT = { subjects: [nid("customer", "cu-1", ORG)] };

describe("runtime feature-flag matrix", () => {
  it("Facade OFF / Indexing OFF — no construction, no store access, no subscription", async () => {
    const h = makeHarness({ enabled: false, loader: () => Promise.resolve({ records: baseRecords(ORG), sourceSnapshotVersion: "v1" }) });
    const repo = new FakeRepository("customers");
    h.coordinator.register([repo]);
    expect(repo.subscribeCalls).toBe(0); // indexing OFF ⇒ no subscription

    const { lifecycle, rp } = runtime(h.graphStore, false);
    const exec = await lifecycle.runQuery("findCustomersNeedingFollowUp", reqCtx("c1", SUBJECT));
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.decision).toBe("FEATURE_DISABLED");
    expect(rp.getStoreCalls()).toBe(0); // facade OFF ⇒ no IndexedDB access
    expect(await h.graphStore.getActiveSnapshot(ORG)).toBeNull();
  });

  it("Facade ON / Indexing OFF — read-only facade opens an already-valid snapshot; no subscription", async () => {
    // build a valid snapshot ONCE (enabled), then represent indexing-OFF with a
    // disabled coordinator that subscribes to nothing.
    const loader = () => Promise.resolve({ records: baseRecords(ORG), sourceSnapshotVersion: "v1" });
    const h = makeHarness({ enabled: true, loader });
    const { change, item } = customerChange(ORG, "cu-1");
    await h.coordinator.ingest(change, item);
    await h.scheduler.runUntilIdle();
    const active = await h.graphStore.getActiveSnapshot(ORG);
    expect(active).not.toBeNull();

    const disabled = new GraphIndexingCoordinator({
      graphStore: h.graphStore,
      stateStore: h.stateStore,
      loadOrganizationRecords: loader,
      scheduler: new ManualScheduler(),
      clock: h.clock,
      enabled: false,
    });
    const repo = new FakeRepository("customers");
    disabled.register([repo]);
    expect(repo.subscribeCalls).toBe(0); // no live indexing/subscription

    const { lifecycle, rp } = runtime(h.graphStore, true);
    const exec = await lifecycle.runQuery("findCustomersNeedingFollowUp", reqCtx("c2", SUBJECT));
    expect(exec.ok).toBe(true);
    if (exec.ok) {
      expect(exec.outcome.result.code).toBe("OK"); // opened the already-valid snapshot
      expect(exec.outcome.result.view?.snapshotId).toBe(active!.snapshotId);
    }
    expect(rp.getStoreCalls()).toBe(1);
  });

  it("Facade OFF / Indexing ON — index maintenance operates; NO user query access", async () => {
    const loader = () => Promise.resolve({ records: baseRecords(ORG), sourceSnapshotVersion: "v1" });
    const h = makeHarness({ enabled: true, loader });
    const { change, item } = customerChange(ORG, "cu-1");
    await h.coordinator.ingest(change, item);
    await h.scheduler.runUntilIdle();
    // index maintenance built an active snapshot …
    expect(await h.graphStore.getActiveSnapshot(ORG)).not.toBeNull();

    // … but the facade is OFF ⇒ no user query access.
    const { lifecycle, rp } = runtime(h.graphStore, false);
    const exec = await lifecycle.runQuery("findCustomersNeedingFollowUp", reqCtx("c3", SUBJECT));
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.decision).toBe("FEATURE_DISABLED");
    expect(rp.getStoreCalls()).toBe(0);
  });

  it("Facade ON / Indexing ON — same store, safe read, active snapshot stays immutable", async () => {
    const loader = () => Promise.resolve({ records: baseRecords(ORG), sourceSnapshotVersion: "v1" });
    const h = makeHarness({ enabled: true, loader });
    const { change, item } = customerChange(ORG, "cu-1");
    await h.coordinator.ingest(change, item);
    await h.scheduler.runUntilIdle();
    const before = await h.graphStore.getActiveSnapshot(ORG);
    expect(before).not.toBeNull();

    const { lifecycle } = runtime(h.graphStore, true);
    const exec = await lifecycle.runQuery("findCustomersNeedingFollowUp", reqCtx("c4", SUBJECT));
    expect(exec.ok).toBe(true);
    if (exec.ok) expect(exec.outcome.result.code).toBe("OK");

    // the read-only facade mutated nothing: the same ACTIVE snapshot id is served.
    const after = await h.graphStore.getActiveSnapshot(ORG);
    expect(after?.snapshotId).toBe(before!.snapshotId);
    expect(after?.checksum).toBe(before!.checksum);
  });
});
