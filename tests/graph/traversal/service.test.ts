// TERAGON Business Graph — Phase 6 traversal service functional tests.
// Proves the security + determinism + boundedness + query-behavior contracts
// against the valid fixture snapshot and small synthetic snapshots.
import { beforeAll, describe, expect, it } from "vitest";
import {
  BusinessGraphTraversalService,
  type GraphIndexSnapshot,
} from "@/graph";
import {
  ALLOW_ALL,
  FIXED_EXEC,
  FIXED_NOW,
  ctxFor,
  denyNodeIds,
  deriveValidSnapshot,
  healthyStore,
  nid,
  synthEdge,
  synthNode,
  synthSnapshot,
} from "./helpers";

let snap: GraphIndexSnapshot;
beforeAll(async () => {
  snap = await deriveValidSnapshot();
});

function svcFor(s: GraphIndexSnapshot) {
  return new BusinessGraphTraversalService(healthyStore(s), {
    now: FIXED_NOW,
    executionIdProvider: FIXED_EXEC,
  });
}

// ---------------------------------------------------------------------------
// cross-organization isolation
// ---------------------------------------------------------------------------

describe("cross-organization traversal is impossible", () => {
  it("querying another org yields a refusal with no data (org-scoped snapshot)", async () => {
    const svc = svcFor(snap);
    const ctx = ctxFor({
      organizationId: "org-other",
      viewer: { organizationId: "org-other", actor: { kind: "HUMAN", userId: "u-x" } },
    });
    const r = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1", "org-other") }, ctx);
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
  });

  it("a context whose org disagrees with its viewer org is refused", async () => {
    const svc = svcFor(snap);
    const ctx = ctxFor({ organizationId: "org-canonical", viewer: { organizationId: "org-other", actor: { kind: "SYSTEM" } } });
    const r = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctx);
    expect(r.ok).toBe(false);
    expect(r.refusalReason).toBe("ORG_CONTEXT_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// unauthorized start === absent (indistinguishable)
// ---------------------------------------------------------------------------

describe("unauthorized start node is indistinguishable from an absent one", () => {
  it("forbidden start and absent start produce a BYTE-IDENTICAL result", async () => {
    const forbiddenId = nid("customer", "cu-1");
    // present but forbidden
    const svcForbidden = new BusinessGraphTraversalService(
      healthyStore(snap),
      { now: FIXED_NOW, executionIdProvider: FIXED_EXEC },
    );
    const forbidden = await svcForbidden.getNode(
      { operation: "getNode", startNodeId: forbiddenId },
      ctxFor({ permissions: denyNodeIds(new Set([forbiddenId])) }),
    );
    // absent: same id, but a snapshot that does not contain it
    const empty = synthSnapshot([synthNode("customer", "other")], []);
    // rebind the absent snapshot's org + id so only node presence differs
    const absentSnap: GraphIndexSnapshot = { ...empty, snapshotId: snap.snapshotId, registryVersion: snap.registryVersion };
    const svcAbsent = new BusinessGraphTraversalService(healthyStore(absentSnap), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const absent = await svcAbsent.getNode(
      { operation: "getNode", startNodeId: forbiddenId },
      ctxFor(),
    );

    expect(forbidden.ok).toBe(false);
    expect(absent.ok).toBe(false);
    expect(forbidden.refusalReason).toBe("NODE_NOT_FOUND");
    expect(absent.refusalReason).toBe("NODE_NOT_FOUND");
    expect(JSON.stringify(forbidden)).toBe(JSON.stringify(absent));
  });
});

// ---------------------------------------------------------------------------
// hidden intermediates do not leak
// ---------------------------------------------------------------------------

describe("hidden intermediate nodes do not leak (shape/title/count)", () => {
  const a = synthNode("customer", "a");
  const b = synthNode("product", "b");
  const h = synthNode("memoryRecord", "hidden");
  const z = synthNode("task", "z");
  const withHidden = synthSnapshot([a, b, h, z], [
    synthEdge("USES", a, b),
    synthEdge("MENTIONED_IN", a, h),
    synthEdge("RELATED_TO", h, z),
  ]);
  const withoutHidden = synthSnapshot([a, b, z], [synthEdge("USES", a, b)]);

  it("neighbors of A are identical whether the hidden branch is forbidden or simply absent", async () => {
    const hiddenForbidden = new BusinessGraphTraversalService(healthyStore(withHidden), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r1 = await hiddenForbidden.getNeighbors(
      { operation: "getNeighbors", startNodeId: a.id },
      ctxFor({ permissions: denyNodeIds(new Set([h.id])) }),
    );
    const noHidden = new BusinessGraphTraversalService(healthyStore(withoutHidden), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r2 = await noHidden.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor());

    expect(r1.data?.neighbors.map((n) => n.node.id)).toEqual([b.id]);
    expect(r1.data?.neighbors).toEqual(r2.data?.neighbors);
  });

  it("no path is returned when the only route runs THROUGH a hidden node", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(withHidden), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.findPath(
      { operation: "findPath", startNodeId: a.id, targetNodeId: z.id },
      ctxFor({ permissions: denyNodeIds(new Set([h.id])) }),
    );
    expect(r.ok).toBe(true);
    expect(r.data?.paths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sensitivity enforced at every hop
// ---------------------------------------------------------------------------

describe("sensitivity enforced at every hop", () => {
  const a = synthNode("customer", "a", { sensitivity: "פנימי" });
  const secret = synthNode("memoryRecord", "s", { sensitivity: "מוגבל" });
  const s = synthSnapshot([a, secret], [synthEdge("MENTIONED_IN", a, secret)]);

  it("a below-clearance neighbor is omitted; sufficient clearance reveals it", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const low = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ viewerClearance: "פנימי" }));
    expect(low.data?.neighbors).toEqual([]);
    const high = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ viewerClearance: "מוגבל" }));
    expect(high.data?.neighbors.map((n) => n.node.id)).toEqual([secret.id]);
  });

  it("a below-clearance START node is refused (indistinguishable)", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.getNode({ operation: "getNode", startNodeId: secret.id }, ctxFor({ viewerClearance: "פנימי" }));
    expect(r.ok).toBe(false);
    expect(r.refusalReason).toBe("NODE_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// cycles terminate
// ---------------------------------------------------------------------------

describe("cycles terminate (visited-set)", () => {
  it("a 2-cycle does not loop forever and yields each node once", async () => {
    const a = synthNode("memoryRecord", "a");
    const b = synthNode("memoryRecord", "b");
    const s = synthSnapshot([a, b], [synthEdge("RELATED_TO", a, b), synthEdge("RELATED_TO", b, a)]);
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.calculateImpact({ operation: "calculateImpact", startNodeId: a.id }, ctxFor());
    expect(r.ok).toBe(true);
    const ids = [...r.data!.direct, ...r.data!.indirect].map((n) => n.node.id);
    expect(ids).toEqual([b.id]);
  });
});

// ---------------------------------------------------------------------------
// hard limits cannot be exceeded
// ---------------------------------------------------------------------------

describe("limit enforcement + truncation", () => {
  // chain a0 -> a1 -> a2 -> a3 -> a4
  const chain = Array.from({ length: 5 }, (_, i) => synthNode("task", `a${i}`));
  const edges = chain.slice(1).map((n, i) => synthEdge("GENERATED_TASK", chain[i]!, n));
  const s = synthSnapshot(chain, edges);

  it("maxDepth reduces reachable depth and marks truncated.byDepth", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.calculateImpact(
      { operation: "calculateImpact", startNodeId: chain[0]!.id, limits: { maxDepth: 2 } },
      ctxFor(),
    );
    const ids = [...r.data!.direct, ...r.data!.indirect].map((n) => n.node.id).sort();
    expect(ids).toEqual([chain[1]!.id, chain[2]!.id].sort());
    expect(r.truncated.byDepth).toBe(true);
    expect(r.truncated.truncated).toBe(true);
  });

  it("maxNodes reduces the number of neighbors and marks truncated.byNodes", async () => {
    const star = synthNode("customer", "hub");
    const leaves = Array.from({ length: 4 }, (_, i) => synthNode("product", `p${i}`));
    const s2 = synthSnapshot([star, ...leaves], leaves.map((l) => synthEdge("USES", star, l)));
    const svc = new BusinessGraphTraversalService(healthyStore(s2), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.getNeighbors(
      { operation: "getNeighbors", startNodeId: star.id, limits: { maxNodes: 1 } },
      ctxFor(),
    );
    expect(r.data?.neighbors.length).toBe(1);
    expect(r.truncated.byNodes).toBe(true);
  });

  it("a caller cannot raise maxDepth above the internal cap (applied is clamped)", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.calculateImpact(
      { operation: "calculateImpact", startNodeId: chain[0]!.id, limits: { maxDepth: 9999 } },
      ctxFor(),
    );
    expect(r.limitsApplied.maxDepth).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// shortest path + determinism
// ---------------------------------------------------------------------------

describe("findPath — shortest permitted paths, deterministic", () => {
  // two length-2 routes A->B->D and A->C->D, plus a length-3 decoy A->B->E->D
  const a = synthNode("customer", "a");
  const b = synthNode("opportunity", "b");
  const c = synthNode("opportunity", "c");
  const d = synthNode("quotation", "d");
  const e = synthNode("quotation", "e");
  const s = synthSnapshot([a, b, c, d, e], [
    synthEdge("RELATED_TO", a, b),
    synthEdge("RELATED_TO", a, c),
    synthEdge("QUOTED_FOR", b, d),
    synthEdge("QUOTED_FOR", c, d),
    synthEdge("USES", b, e),
    synthEdge("USES", e, d),
  ]);

  it("returns only the shortest (length-2) paths, not the length-3 decoy", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.findPath({ operation: "findPath", startNodeId: a.id, targetNodeId: d.id }, ctxFor());
    expect(r.data!.paths.length).toBe(2);
    for (const p of r.data!.paths) expect(p.length).toBe(2);
  });

  it("is byte-reproducible across repeated queries", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r1 = await svc.findPath({ operation: "findPath", startNodeId: a.id, targetNodeId: d.id }, ctxFor());
    const r2 = await svc.findPath({ operation: "findPath", startNodeId: a.id, targetNodeId: d.id }, ctxFor());
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ---------------------------------------------------------------------------
// authoritative-only default + inferred/proposed/rejected handling
// ---------------------------------------------------------------------------

describe("authoritative-only default; inferred/unverified require an explicit mode", () => {
  const a = synthNode("customer", "a");
  const bAuth = synthNode("product", "auth");
  const cInf = synthNode("knowledgeArticle", "inf");
  const dProp = synthNode("product", "prop");
  const eRej = synthNode("approval", "rej");
  const s = synthSnapshot([a, bAuth, cInf, dProp, eRej], [
    synthEdge("USES", a, bAuth), // CANONICAL
    synthEdge("SUPPORTED_BY", a, cInf, { provenance: "INFERRED", authority: "DERIVED" }),
    synthEdge("PURCHASED", a, dProp, { provenance: "PROPOSED", authority: "UNVERIFIED", approvalState: "pending" }),
    synthEdge("REJECTED_BY", a, eRej, { authority: "REJECTED" }),
  ]);

  const ids = (r: { data: { neighbors: { node: { id: string } }[] } | null }) =>
    (r.data?.neighbors ?? []).map((n) => n.node.id).sort();

  it("default returns only the authoritative neighbor", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor());
    expect(ids(r)).toEqual([bAuth.id]);
  });

  it("includeInferred adds the inferred neighbor — kept labelled as INFERRED", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: a.id }, ctxFor({ includeInferred: true }));
    expect(ids(r)).toEqual([bAuth.id, cInf.id].sort());
    const inf = r.data!.neighbors.find((n) => n.node.id === cInf.id)!;
    expect(inf.via.provenance).toBe("INFERRED");
  });

  it("includeUnverified adds the proposed neighbor but NEVER the rejected one", async () => {
    const svc = new BusinessGraphTraversalService(healthyStore(s), { now: FIXED_NOW, executionIdProvider: FIXED_EXEC });
    const r = await svc.getNeighbors(
      { operation: "getNeighbors", startNodeId: a.id },
      ctxFor({ includeInferred: true, includeUnverified: true }),
    );
    expect(ids(r)).toEqual([bAuth.id, cInf.id, dProp.id].sort());
    expect(ids(r)).not.toContain(eRej.id);
  });
});

// ---------------------------------------------------------------------------
// evidence
// ---------------------------------------------------------------------------

describe("findRelatedEvidence (valid fixture)", () => {
  it("default excludes the INFERRED SUPPORTED_BY evidence; includeInferred reveals it, labelled", async () => {
    const svc = svcFor(snap);
    const recId = nid("aiRecommendation", "rec-1");
    const base = await svc.findRelatedEvidence({ operation: "findRelatedEvidence", startNodeId: recId }, ctxFor());
    expect(base.data?.evidence.map((e) => e.node.id)).toEqual([]);
    const withInf = await svc.findRelatedEvidence(
      { operation: "findRelatedEvidence", startNodeId: recId },
      ctxFor({ includeInferred: true }),
    );
    const kaId = nid("knowledgeArticle", "ka-1");
    expect(withInf.data?.evidence.map((e) => e.node.id)).toContain(kaId);
    const item = withInf.data!.evidence.find((e) => e.node.id === kaId)!;
    expect(item.provenance).toBe("INFERRED");
    expect(item.authority).toBe("DERIVED");
  });
});

// ---------------------------------------------------------------------------
// impact direct vs indirect (valid fixture)
// ---------------------------------------------------------------------------

describe("calculateImpact distinguishes DIRECT from INDIRECT (valid fixture)", () => {
  it("agentRun run-1 → direct {rec-1, t-1}; indirect at distance 2", async () => {
    const svc = svcFor(snap);
    const r = await svc.calculateImpact(
      { operation: "calculateImpact", startNodeId: nid("agentRun", "run-1") },
      ctxFor(),
    );
    const direct = r.data!.direct.map((n) => n.node.id).sort();
    expect(direct).toEqual([nid("aiRecommendation", "rec-1"), nid("task", "t-1")].sort());
    for (const n of r.data!.direct) {
      expect(n.impact).toBe("DIRECT");
      expect(n.distance).toBe(1);
    }
    const indirect = r.data!.indirect.map((n) => n.node.id);
    expect(indirect).toContain(nid("approval", "ap-1"));
    expect(indirect).toContain(nid("agent", "ag-1"));
    for (const n of r.data!.indirect) {
      expect(n.impact).toBe("INDIRECT");
      expect(n.distance).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// conflicts — registered relationships only
// ---------------------------------------------------------------------------

describe("findConflicts uses registered CONTRADICTS/SUPERSEDES only", () => {
  it("mem-0 surfaces the SUPERSEDES lineage; a node with no such edge returns none", async () => {
    const svc = svcFor(snap);
    const conflict = await svc.findConflicts({ operation: "findConflicts", startNodeId: nid("memoryRecord", "mem-0") }, ctxFor());
    expect(conflict.data?.conflicts.length).toBe(1);
    expect(conflict.data?.conflicts[0]!.kind).toBe("SUPERSEDES");
    expect(conflict.data?.conflicts[0]!.otherNode.id).toBe(nid("memoryRecord", "mem-1"));

    // cu-1 has many edges but none is CONTRADICTS/SUPERSEDES → no invented conflict.
    const none = await svc.findConflicts({ operation: "findConflicts", startNodeId: nid("customer", "cu-1") }, ctxFor());
    expect(none.data?.conflicts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// search — envelope metadata only + protected search text
// ---------------------------------------------------------------------------

describe("searchGraph — envelope metadata only, deterministic, safe audit", () => {
  it("matches safe envelope fields and never logs raw search text", async () => {
    const svc = svcFor(snap);
    const raw = "קנוני";
    const r = await svc.searchGraph({ operation: "searchGraph", searchText: raw }, ctxFor());
    expect(r.ok).toBe(true);
    expect(r.data!.hits.length).toBeGreaterThan(0);
    for (const hit of r.data!.hits) expect(hit.matchedField).toBe("title");
    // the raw text is nowhere in the AUDIT record — only a hash + class.
    expect(JSON.stringify(r.audit)).not.toContain(raw);
    expect(r.audit.searchTextHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(r.audit.searchTextClass).not.toBeNull();
  });

  it("ranking is deterministic (byte-equal on repeat)", async () => {
    const svc = svcFor(snap);
    const a = await svc.searchGraph({ operation: "searchGraph", searchText: "מאושר" }, ctxFor());
    const b = await svc.searchGraph({ operation: "searchGraph", searchText: "מאושר" }, ctxFor());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// timeline
// ---------------------------------------------------------------------------

describe("getTimeline — graph-visible lifecycle + relationship events", () => {
  it("returns created/edge events for an accessible node, time-ordered", async () => {
    const svc = svcFor(snap);
    const r = await svc.getTimeline({ operation: "getTimeline", startNodeId: nid("serviceTicket", "st-1") }, ctxFor());
    expect(r.ok).toBe(true);
    expect(r.data!.events.length).toBeGreaterThan(0);
    expect(r.data!.events.some((e) => e.kind === "NODE_CREATED")).toBe(true);
    const sorted = [...r.data!.events].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
    expect(r.data!.events.map((e) => e.at)).toEqual(sorted.map((e) => e.at));
  });
});

// ---------------------------------------------------------------------------
// audit record safety + determinism
// ---------------------------------------------------------------------------

describe("every query emits a safe, deterministic audit record", () => {
  it("carries safe metadata, a deterministic requestFingerprint, and the applied limits", async () => {
    const svc = svcFor(snap);
    const r1 = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    const r2 = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    expect(r1.audit.requestFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(r1.audit.requestFingerprint).toBe(r2.audit.requestFingerprint); // deterministic (no clock/random)
    expect(r1.audit.executionId).toBe("exec-fixed"); // injected provider (default is a random UUID)
    expect(r1.audit.operation).toBe("getNode");
    expect(r1.audit.organizationId).toBe("org-canonical");
    expect(r1.audit.appliedLimits.maxDepth).toBe(6);
    expect(r1.audit.searchTextHash).toBeNull();
    expect(r1.audit.staleAccessAuthorized).toBe(false);
  });

  it("a full result is byte-reproducible with a fixed clock", async () => {
    const svc = svcFor(snap);
    const a = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: nid("customer", "cu-1") }, ctxFor());
    const b = await svc.getNeighbors({ operation: "getNeighbors", startNodeId: nid("customer", "cu-1") }, ctxFor());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// read-only — no snapshot mutation
// ---------------------------------------------------------------------------

describe("read-only: no active snapshot is mutated", () => {
  it("the snapshot is byte-identical after many queries", async () => {
    const svc = svcFor(snap);
    const before = JSON.stringify(snap);
    const ctx = ctxFor({ includeInferred: true, includeUnverified: true });
    await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctx);
    await svc.getNeighbors({ operation: "getNeighbors", startNodeId: nid("aiRecommendation", "rec-1") }, ctx);
    await svc.findPath({ operation: "findPath", startNodeId: nid("agentRun", "run-1"), targetNodeId: nid("approval", "ap-1") }, ctx);
    await svc.calculateImpact({ operation: "calculateImpact", startNodeId: nid("agentRun", "run-1") }, ctx);
    await svc.findRelatedEvidence({ operation: "findRelatedEvidence", startNodeId: nid("aiRecommendation", "rec-1") }, ctx);
    await svc.findConflicts({ operation: "findConflicts", startNodeId: nid("memoryRecord", "mem-0") }, ctx);
    await svc.searchGraph({ operation: "searchGraph", searchText: "קנוני" }, ctx);
    await svc.getTimeline({ operation: "getTimeline", startNodeId: nid("serviceTicket", "st-1") }, ctx);
    expect(JSON.stringify(snap)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// getNode happy path (envelope-only)
// ---------------------------------------------------------------------------

describe("getNode returns the envelope only", () => {
  it("returns the node with no body fields present", async () => {
    const svc = svcFor(snap);
    const r = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor());
    expect(r.ok).toBe(true);
    expect(r.data!.id).toBe(nid("customer", "cu-1"));
    for (const forbidden of ["body", "content", "prompt", "notes", "markdown", "plainText"]) {
      expect(forbidden in r.data!).toBe(false);
      expect(forbidden in r.data!.metadataSummary).toBe(false);
    }
  });

  it("uses ALLOW_ALL vs a denying oracle to prove connection ≠ visibility", async () => {
    const svc = svcFor(snap);
    const allow = await svc.getNode({ operation: "getNode", startNodeId: nid("customer", "cu-1") }, ctxFor({ permissions: ALLOW_ALL }));
    expect(allow.ok).toBe(true);
    const deny = await svc.getNode(
      { operation: "getNode", startNodeId: nid("customer", "cu-1") },
      ctxFor({ permissions: denyNodeIds(new Set([nid("customer", "cu-1")])) }),
    );
    expect(deny.ok).toBe(false);
  });
});
