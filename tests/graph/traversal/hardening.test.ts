// TERAGON Business Graph — Phase 6.1 traversal-hardening regression tests.
// Proves the centralized edge gate (sensitivity / lifecycle / approval), the
// no-leak-via-counts guarantee, and the split audit identity (unique executionId
// + deterministic requestFingerprint). All deterministic (fixed clock + injected
// execution-id provider), synthetic snapshots only.
import { beforeAll, describe, expect, it } from "vitest";
import { BusinessGraphTraversalService, type GraphIndexSnapshot } from "@/graph";
import {
  FIXED_NOW,
  counterExec,
  ctxFor,
  detService,
  deriveValidSnapshot,
  healthyStore,
  nid,
  synthEdge,
  synthNode,
  synthSnapshot,
} from "./helpers";

// An "as of" instant used for lifecycle tests (between the future/expired bounds).
const AS_OF = "2026-07-15T00:00:00.000Z";
const PAST = "2026-06-01T00:00:00.000Z";
const EXPIRED = "2026-07-10T00:00:00.000Z";
const FUTURE = "2026-08-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// (1) a sensitive edge between two OTHERWISE-VISIBLE nodes is blocked
// ---------------------------------------------------------------------------

describe("edge sensitivity is enforced independently of node visibility", () => {
  const a = synthNode("customer", "a", { sensitivity: "פנימי" });
  const b = synthNode("product", "b", { sensitivity: "פנימי" });
  // both endpoints are visible at 'פנימי'; only the EDGE is 'מוגבל'.
  const sensitiveEdge = synthSnapshot([a, b], [synthEdge("USES", a, b, { sensitivity: "מוגבל" })]);
  const plainEdge = synthSnapshot([a, b], [synthEdge("USES", a, b, { sensitivity: "פנימי" })]);

  it("a below-clearance EDGE hides the neighbor even though BOTH nodes are visible", async () => {
    const svc = detService(sensitiveEdge);
    const r = await svc.getNeighbors(
      { operation: "getNeighbors", startNodeId: a.id },
      ctxFor({ viewerClearance: "פנימי" }),
    );
    expect(r.ok).toBe(true);
    expect(r.data?.neighbors).toEqual([]);
    // the nodes themselves ARE independently visible — proving the block is edge-level.
    const nodeA = await svc.getNode({ operation: "getNode", startNodeId: a.id }, ctxFor({ viewerClearance: "פנימי" }));
    const nodeB = await svc.getNode({ operation: "getNode", startNodeId: b.id }, ctxFor({ viewerClearance: "פנימי" }));
    expect(nodeA.ok).toBe(true);
    expect(nodeB.ok).toBe(true);
  });

  it("sufficient clearance reveals the same edge", async () => {
    const svc = detService(sensitiveEdge);
    const r = await svc.getNeighbors(
      { operation: "getNeighbors", startNodeId: a.id },
      ctxFor({ viewerClearance: "מוגבל" }),
    );
    expect(r.data?.neighbors.map((n) => n.node.id)).toEqual([b.id]);
  });

  it("the hidden edge does not leak via neighbor COUNT (identical to a no-such-edge graph)", async () => {
    const hidden = detService(sensitiveEdge);
    const absent = detService(synthSnapshot([a, b], []));
    const rHidden = await hidden.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ viewerClearance: "פנימי" }));
    const rAbsent = await absent.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ viewerClearance: "פנימי" }));
    // same shape AND same count — a forbidden edge is indistinguishable from an absent one.
    expect(rHidden.data?.neighbors.length).toBe(rAbsent.data?.neighbors.length);
    expect(rHidden.data?.neighbors).toEqual(rAbsent.data?.neighbors);
    // plainEdge (visible) proves the neighbor WOULD appear absent the sensitivity block.
    const visible = detService(plainEdge);
    const rVisible = await visible.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ viewerClearance: "פנימי" }));
    expect(rVisible.data?.neighbors.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (2) lifecycle validity at asOf — expired + future-valid edges blocked
// ---------------------------------------------------------------------------

describe("edge lifecycle validity is enforced against the injected asOf", () => {
  const a = synthNode("customer", "a");
  const b = synthNode("product", "b");

  const neighborIds = (r: { data: { neighbors: { node: { id: string } }[] } | null }) =>
    (r.data?.neighbors ?? []).map((n) => n.node.id);

  it("an EXPIRED edge (validUntil <= asOf) is blocked", async () => {
    const s = synthSnapshot([a, b], [synthEdge("USES", a, b, { validFrom: PAST, validUntil: EXPIRED })]);
    const svc = detService(s);
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ asOf: AS_OF }));
    expect(neighborIds(r)).toEqual([]);
  });

  it("a FUTURE-VALID edge (validFrom > asOf) is blocked", async () => {
    const s = synthSnapshot([a, b], [synthEdge("USES", a, b, { validFrom: FUTURE, validUntil: null })]);
    const svc = detService(s);
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ asOf: AS_OF }));
    expect(neighborIds(r)).toEqual([]);
  });

  it("an in-window edge (validFrom <= asOf < validUntil) is permitted", async () => {
    const s = synthSnapshot([a, b], [synthEdge("USES", a, b, { validFrom: PAST, validUntil: FUTURE })]);
    const svc = detService(s);
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ asOf: AS_OF }));
    expect(neighborIds(r)).toEqual([b.id]);
  });
});

// ---------------------------------------------------------------------------
// (3) approval eligibility — an unapproved approval-required edge is blocked
// ---------------------------------------------------------------------------

describe("an approval-required edge must be approved to traverse", () => {
  const rec = synthNode("aiRecommendation", "rec");
  const appr = synthNode("approval", "ap");

  const neighborIds = (r: { data: { neighbors: { node: { id: string } }[] } | null }) =>
    (r.data?.neighbors ?? []).map((n) => n.node.id);

  it("APPROVED_BY with approvalState 'pending' is blocked by default", async () => {
    const s = synthSnapshot([rec, appr], [synthEdge("APPROVED_BY", rec, appr, { approvalState: "pending" })]);
    const svc = detService(s);
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: rec.id }, ctxFor());
    expect(neighborIds(r)).toEqual([]);
  });

  it("APPROVED_BY with approvalState 'none' is blocked by default", async () => {
    const s = synthSnapshot([rec, appr], [synthEdge("APPROVED_BY", rec, appr, { approvalState: "none" })]);
    const svc = detService(s);
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: rec.id }, ctxFor());
    expect(neighborIds(r)).toEqual([]);
  });

  it("APPROVED_BY with approvalState 'approved' is permitted", async () => {
    const s = synthSnapshot([rec, appr], [synthEdge("APPROVED_BY", rec, appr, { approvalState: "approved" })]);
    const svc = detService(s);
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: rec.id }, ctxFor());
    expect(neighborIds(r)).toEqual([appr.id]);
  });
});

// ---------------------------------------------------------------------------
// (4) audit identity — unique executionId, deterministic requestFingerprint
// ---------------------------------------------------------------------------

describe("audit identity separates execution from request", () => {
  let snap: GraphIndexSnapshot;
  beforeAll(async () => {
    snap = await deriveValidSnapshot();
  });

  it("identical requests receive DISTINCT executionId values", async () => {
    // an injected counter provider stands in for the default random UUID.
    const svc = new BusinessGraphTraversalService(healthyStore(snap), {
      now: FIXED_NOW,
      executionIdProvider: counterExec(),
    });
    const r1 = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    const r2 = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    expect(r1.audit.executionId).not.toBe(r2.audit.executionId);
    expect(r1.audit.executionId).toBe("exec-1");
    expect(r2.audit.executionId).toBe("exec-2");
  });

  it("identical requests receive EQUAL requestFingerprint values", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(snap), {
      now: FIXED_NOW,
      executionIdProvider: counterExec(),
    });
    const r1 = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    const r2 = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    expect(r1.audit.requestFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(r1.audit.requestFingerprint).toBe(r2.audit.requestFingerprint);
    // distinct executions still produce SEPARATE audit records.
    expect(r1.audit).not.toBe(r2.audit);
  });

  it("a DIFFERENT request (different start node) yields a different fingerprint", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(snap), {
      now: FIXED_NOW,
      executionIdProvider: counterExec(),
    });
    const r1 = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    const r2 = await svc.getNode({ operation: "getNode", startNodeId: nid("agentRun", "run-1") }, ctxFor());
    expect(r1.audit.requestFingerprint).not.toBe(r2.audit.requestFingerprint);
  });

  it("no raw sensitive search text enters either identity field", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(snap), {
      now: FIXED_NOW,
      executionIdProvider: counterExec(),
    });
    const raw = "קנוני";
    const r = await svc.searchGraph({ operation: "searchGraph", searchText: raw }, ctxFor());
    expect(r.audit.executionId).not.toContain(raw);
    expect(r.audit.requestFingerprint).not.toContain(raw);
  });
});
