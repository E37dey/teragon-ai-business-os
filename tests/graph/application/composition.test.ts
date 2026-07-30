// TERAGON Business Graph — Phase 8 REAL composition integration test.
// Drives the facade over a REAL IndexedDB-backed index store (fake-indexeddb),
// with injected identity / clock / execution-id / audit sink. Proves the full
// path store → traversal → business query → safe mapping works end-to-end, and
// that the DEFAULT flag constant (OFF) keeps the real wiring inert.
import { beforeEach, describe, expect, it } from "vitest";
import {
  BusinessGraphFacadeFactory,
  IndexedDBGraphIndexStore,
  createStoreProvider,
  rebuildOrganizationGraph,
  type GraphIndexStore,
} from "@/graph";
import { VALID_CONTEXT } from "../fixtures/validFixture";
import { buildAugmentedRecords } from "../query/helpers";
import { makeClock, resetIndexedDB } from "../store/helpers";
import {
  allowAllAdapter,
  ceoIdentity,
  CLOCK,
  counterExec,
  fixedResolver,
  nid,
  recordingSink,
  recordingStoreProvider,
  reqCtx,
} from "./helpers";

async function realActiveStore(): Promise<GraphIndexStore> {
  resetIndexedDB();
  const store = new IndexedDBGraphIndexStore({ now: makeClock() });
  await rebuildOrganizationGraph(buildAugmentedRecords(), VALID_CONTEXT, store, { now: makeClock() });
  return store;
}

describe("real composition (fake-indexeddb)", () => {
  beforeEach(() => resetIndexedDB());

  it("runs a supported query end-to-end through the real store", async () => {
    const store = await realActiveStore();
    const active = await store.getActiveSnapshot(VALID_CONTEXT.organizationId);
    expect(active).not.toBeNull();

    const { sink, records } = recordingSink();
    const facade = BusinessGraphFacadeFactory.create({
      identityResolver: fixedResolver(ceoIdentity()),
      permissionAdapter: allowAllAdapter(),
      storeProvider: createStoreProvider(store),
      auditSink: sink,
      clock: CLOCK,
      executionIdProvider: counterExec("e"),
      featureOverride: true,
    });

    const r = await facade.findCustomersNeedingFollowUp(reqCtx("c-int", { subjects: [nid("customer", "cu-1")] }));
    expect(r.code).toBe("OK");
    expect(r.view?.readiness).toBe("SUPPORTED");
    expect(r.view?.findings.length).toBeGreaterThan(0);
    // the real ACTIVE snapshot id flowed through unchanged.
    expect(r.view?.snapshotId).toBe(active!.snapshotId);
    // correlated + distinct across the three layers.
    const a = r.audit!;
    const all = [a.facadeExecutionId, a.queryExecutionId, ...a.traversalExecutionIds];
    expect(all.every((x) => typeof x === "string" && x.length > 0)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(records).toHaveLength(1);
  });

  it("keeps the real wiring INERT under the DEFAULT (OFF) flag constant", async () => {
    const store = await realActiveStore();
    const rp = recordingStoreProvider(store);
    const { sink, records } = recordingSink();
    // NO featureOverride ⇒ the compile-time OFF constant governs.
    const facade = BusinessGraphFacadeFactory.create({
      identityResolver: fixedResolver(ceoIdentity()),
      permissionAdapter: allowAllAdapter(),
      storeProvider: rp.provider,
      auditSink: sink,
      clock: CLOCK,
      executionIdProvider: counterExec("e"),
    });
    const r = await facade.findCustomersNeedingFollowUp(reqCtx("c", { subjects: [nid("customer", "cu-1")] }));
    expect(r.code).toBe("DISABLED");
    expect(rp.getStoreCalls()).toBe(0);
    expect(records).toHaveLength(0);
  });
});
