// TERAGON Business Graph — Phase 6 health-gating tests.
// CORRUPT/MISSING/REBUILD_REQUIRED → refuse; STALE/DEGRADED → deny-by-default
// (authorized caller gets a result MARKED stale); HEALTHY → normal.
import { beforeAll, describe, expect, it } from "vitest";
import { BusinessGraphTraversalService, type GraphIndexSnapshot } from "@/graph";
import {
  ctxFor,
  deriveValidSnapshot,
  healthyStore,
  nid,
  storeWithHealth,
} from "./helpers";

const FIXED_NOW = () => 0;
let snap: GraphIndexSnapshot;
beforeAll(async () => {
  snap = await deriveValidSnapshot();
});

const req = () => ({ operation: "getNode" as const, startNodeId: nid("customer", "cu-1") });

describe("refuse states — no data crosses", () => {
  for (const state of ["CORRUPT", "MISSING", "REBUILD_REQUIRED"] as const) {
    it(`${state} → refusal (ok=false, data=null, GRAPH_UNAVAILABLE)`, async () => {
      const svc = new BusinessGraphTraversalService(storeWithHealth(snap, state), { now: FIXED_NOW });
      const r = await svc.getNode(req(), ctxFor());
      expect(r.ok).toBe(false);
      expect(r.data).toBeNull();
      expect(r.refusalReason).toBe("GRAPH_UNAVAILABLE");
      expect(r.health).toBe(state);
      expect(r.stale).toBe(false);
      expect(r.audit.safeDenialReason).toBe("GRAPH_UNAVAILABLE");
    });
  }
});

describe("deny-by-default staleness", () => {
  for (const state of ["STALE", "DEGRADED"] as const) {
    it(`${state} without allowStale → refusal STALE_NOT_AUTHORIZED`, async () => {
      const svc = new BusinessGraphTraversalService(storeWithHealth(snap, state), { now: FIXED_NOW });
      const r = await svc.getNode(req(), ctxFor());
      expect(r.ok).toBe(false);
      expect(r.data).toBeNull();
      expect(r.refusalReason).toBe("STALE_NOT_AUTHORIZED");
    });

    it(`${state} WITH allowStale → result served but MARKED stale`, async () => {
      const svc = new BusinessGraphTraversalService(storeWithHealth(snap, state), { now: FIXED_NOW });
      const r = await svc.getNode(req(), ctxFor({ allowStale: true }));
      expect(r.ok).toBe(true);
      expect(r.data).not.toBeNull();
      expect(r.stale).toBe(true);
      expect(r.health).toBe(state);
    });
  }
});

describe("HEALTHY", () => {
  it("serves normally, not stale", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(snap), { now: FIXED_NOW });
    const r = await svc.getNode(req(), ctxFor());
    expect(r.ok).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.health).toBe("HEALTHY");
    expect(r.snapshotId).toBe(snap.snapshotId);
  });
});
