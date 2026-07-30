// TERAGON Business Graph — Phase 8 APPLICATION-FACADE behavior tests.
// Deterministic fakes prove the security envelope: default-OFF inertness, identity
// resolution + deny cases, no caller-supplied org/viewer/permission, delegation
// ONLY through the query service, honest readiness, stale/health gating, hidden-
// entity totals, no protected bodies, correlated-but-distinct audit ids, safe
// idempotent disposal, and read-only (byte-identical) snapshot behavior.
import { describe, expect, it, vi } from "vitest";
import type { BusinessGraphRequestContext } from "@/graph";
import {
  buildFacade,
  ceoIdentity,
  contradictSnapshot,
  counterExec,
  denyNodeAdapter,
  denyResolver,
  emptyStore,
  FIXED_ISO,
  healthyStore,
  makeHealth,
  nid,
  recordingSink,
  recordingStoreProvider,
  reqCtx,
  resolverFrom,
  spyQueryService,
  storeWithHealth,
  StubStore,
  synthEdge,
  synthSnapshot,
  synthNode,
  VALID_ORG,
} from "./helpers";

const REC_A = nid("aiRecommendation", "rec-a");

// ---------------------------------------------------------------------------
// feature flag — OFF path proof
// ---------------------------------------------------------------------------

describe("feature OFF", () => {
  it("builds NOTHING and returns DISABLED without touching the store", async () => {
    const rp = recordingStoreProvider(emptyStore());
    const { sink, records } = recordingSink();
    const facade = buildFacade({ enabled: false, storeProvider: rp.provider, sink });

    const r = await facade.findRecommendationConflicts(reqCtx("c1", { subjects: [REC_A] }));
    expect(r.code).toBe("DISABLED");
    expect(r.ok).toBe(false);
    expect(r.view).toBeNull();
    expect(r.facadeExecutionId).toBeNull();
    expect(r.audit).toBeNull();
    // NO graph construction / IndexedDB read, NO audit emitted.
    expect(rp.getStoreCalls()).toBe(0);
    expect(records).toHaveLength(0);
    expect(facade.getStatus()).toMatchObject({ enabled: false, constructed: false, storeOpened: false });
  });

  it("every method (capabilities/readiness) also returns DISABLED", () => {
    const facade = buildFacade({ enabled: false });
    expect(facade.getCapabilities({ sessionIdentity: { sessionRef: "s" }, correlationId: "c" }).code).toBe("DISABLED");
    expect(facade.getQueryReadiness({ sessionIdentity: { sessionRef: "s" }, correlationId: "c" }).code).toBe("DISABLED");
  });
});

// ---------------------------------------------------------------------------
// construction / import causes no background work
// ---------------------------------------------------------------------------

describe("construction", () => {
  it("does no store open / audit / background work until the first query", () => {
    const rp = recordingStoreProvider(emptyStore());
    const { sink, records } = recordingSink();
    const facade = buildFacade({ enabled: true, storeProvider: rp.provider, sink });
    expect(rp.getStoreCalls()).toBe(0);
    expect(records).toHaveLength(0);
    expect(facade.getStatus()).toMatchObject({ enabled: true, constructed: false, storeOpened: false, disposed: false });
  });
});

// ---------------------------------------------------------------------------
// identity resolution + deny cases
// ---------------------------------------------------------------------------

describe("identity resolution", () => {
  it("denies missing identity (UNAUTHENTICATED) and never opens the store", async () => {
    const rp = recordingStoreProvider(emptyStore());
    const facade = buildFacade({ resolver: denyResolver("UNAUTHENTICATED"), storeProvider: rp.provider });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [REC_A] }));
    expect(r.code).toBe("UNAUTHENTICATED");
    expect(rp.getStoreCalls()).toBe(0);
  });

  it("denies ambiguous identity (IDENTITY_AMBIGUOUS)", async () => {
    const facade = buildFacade({ resolver: denyResolver("IDENTITY_AMBIGUOUS") });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [REC_A] }));
    expect(r.code).toBe("IDENTITY_AMBIGUOUS");
  });

  it("takes actor KIND from the resolver, never from the session-ref shape", async () => {
    const { snap, recA } = contradictSnapshot();
    // session ref LOOKS like an agent id, but the resolver authoritatively says HUMAN.
    const facade = buildFacade({
      resolver: resolverFrom(() => ({ ok: true, identity: ceoIdentity() })),
      store: healthyStore(snap),
    });
    const r = await facade.findRecommendationConflicts(
      { sessionIdentity: { sessionRef: "ag-looks-like-agent" }, correlationId: "c", args: { subjects: [recA.id] } },
    );
    expect(r.ok).toBe(true);
    expect(r.audit?.actorRef).toEqual({ kind: "HUMAN", userId: "u-tzachi" });
  });

  it("resolves AGENT/SYSTEM explicitly (kind carried through to the audit)", async () => {
    const { snap, recA } = contradictSnapshot();
    const facade = buildFacade({
      identity: ceoIdentity({ actor: { kind: "AGENT", agentId: "ag-7" }, allowedEntityDomains: null }),
      store: healthyStore(snap),
    });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(r.audit?.actorRef).toEqual({ kind: "AGENT", agentId: "ag-7" });
  });
});

// ---------------------------------------------------------------------------
// no caller-supplied organization / viewer / permission context
// ---------------------------------------------------------------------------

describe("no caller override", () => {
  it("rejects an organizationId override in the args payload", async () => {
    const facade = buildFacade();
    const r = await facade.findRecommendationConflicts(
      { sessionIdentity: { sessionRef: "s" }, correlationId: "c", args: { organizationId: "org-evil" } } as unknown as BusinessGraphRequestContext,
    );
    expect(r.code).toBe("ORGANIZATION_MISMATCH");
  });

  it("rejects an organizationId override at the context top level", async () => {
    const facade = buildFacade();
    const r = await facade.findRecommendationConflicts(
      { sessionIdentity: { sessionRef: "s" }, correlationId: "c", args: {}, organizationId: "org-evil" } as unknown as BusinessGraphRequestContext,
    );
    expect(r.code).toBe("ORGANIZATION_MISMATCH");
  });

  it("rejects a caller-supplied viewer / permission context", async () => {
    const facade = buildFacade();
    const viewerInjected = await facade.findRecommendationConflicts(
      { sessionIdentity: { sessionRef: "s" }, correlationId: "c", args: { viewer: {} } } as unknown as BusinessGraphRequestContext,
    );
    const permsInjected = await facade.findRecommendationConflicts(
      { sessionIdentity: { sessionRef: "s" }, correlationId: "c", args: { permissions: {} } } as unknown as BusinessGraphRequestContext,
    );
    expect(viewerInjected.code).toBe("ORGANIZATION_MISMATCH");
    expect(permsInjected.code).toBe("ORGANIZATION_MISMATCH");
  });

  it("rejects a subject node id from another organization", async () => {
    const facade = buildFacade({ identity: ceoIdentity() });
    const foreign = nid("aiRecommendation", "rec-a", "org-other");
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [foreign] }));
    expect(r.code).toBe("ORGANIZATION_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// delegation ONLY through the query service (no store/traversal bypass)
// ---------------------------------------------------------------------------

describe("delegation", () => {
  it("routes all 9 queries through the query service and never reads the store itself", async () => {
    const store = {
      getActiveSnapshot: vi.fn(() => Promise.resolve(null)),
      getHealth: vi.fn((o: string) => Promise.resolve(makeHealth("HEALTHY", "snap-x", o))),
    };
    const rp = recordingStoreProvider(store);
    const spy = spyQueryService();
    const facade = buildFacade({ spy, storeProvider: rp.provider });

    const ids = { subjects: [REC_A], startNodeId: REC_A, targetNodeId: nid("aiRecommendation", "rec-b") };
    const names = [
      "findCustomersNeedingFollowUp",
      "findUnansweredQuotations",
      "findRecurringServiceIssues",
      "findDelayedEnrollments",
      "assessPrinterModelSupportImpact",
      "findSupersededEvidence",
      "findRecommendationConflicts",
      "findTasksFromApprovedRecommendations",
      "buildFullEvidencePath",
    ] as const;
    for (const name of names) {
      const r = await facade[name](reqCtx("c", ids));
      expect(r.code).toBe("OK");
      expect(r.query).toBe(name);
    }
    // each query-service method invoked exactly once …
    const calls = spy.calls();
    for (const name of names) expect(calls[name]).toBe(1);
    // … the store was composed ONCE (cached) and NEVER read directly by the facade.
    expect(rp.getStoreCalls()).toBe(1);
    expect(store.getActiveSnapshot).not.toHaveBeenCalled();
    expect(store.getHealth).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// honest readiness
// ---------------------------------------------------------------------------

describe("honest readiness", () => {
  it("getQueryReadiness reports all 9 structural baselines (all SUPPORTED after Phase 9)", () => {
    const rp = recordingStoreProvider(emptyStore());
    const facade = buildFacade({ storeProvider: rp.provider });
    const r = facade.getQueryReadiness({ sessionIdentity: { sessionRef: "s" }, correlationId: "c" });
    expect(r.ok).toBe(true);
    expect(r.readiness).toHaveLength(9);
    const byName = Object.fromEntries(r.readiness.map((x) => [x.query, x]));
    expect(byName["findCustomersNeedingFollowUp"]!.baselineReadiness).toBe("SUPPORTED");
    // the formerly-blocked query is now structurally SUPPORTED at the contract level.
    expect(byName["findRecurringServiceIssues"]!.baselineReadiness).toBe("SUPPORTED");
    // capability/readiness never touch the store.
    expect(rp.getStoreCalls()).toBe(0);
  });

  it("a live INSTANCE-level INSUFFICIENT_GRAPH_DATA query stays honest (OK result, missing facts)", async () => {
    // relevant ticket exists for the model's customer but is not linked to a
    // specific printer / has no fault category → INSTANCE-level INSUFFICIENT.
    const pm = synthNode("printerModel", "pm-inc");
    const cp = synthNode("customerPrinter", "cp-inc");
    const cu = synthNode("customer", "cu-inc");
    const st = synthNode("serviceTicket", "st-inc", { status: "בבדיקה" });
    const snap = synthSnapshot([pm, cp, cu, st], [
      synthEdge("USES", cp, pm),
      synthEdge("OWNS", cp, cu),
      synthEdge("SERVICED", st, cu),
    ]);
    const facade = buildFacade({ store: healthyStore(snap) });
    const r = await facade.findRecurringServiceIssues(reqCtx("c", { subjects: [pm.id] }));
    expect(r.code).toBe("OK");
    expect(r.view?.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
    expect(r.view?.missingFacts.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// health + stale gating
// ---------------------------------------------------------------------------

describe("health gating", () => {
  it("maps a MISSING graph to GRAPH_MISSING", async () => {
    const facade = buildFacade({ store: new StubStore(null, makeHealth("MISSING", null)) });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [REC_A] }));
    expect(r.code).toBe("GRAPH_MISSING");
    expect(r.view).toBeNull();
  });

  it("maps a CORRUPT graph to GRAPH_UNHEALTHY", async () => {
    const { snap, recA } = contradictSnapshot();
    const facade = buildFacade({ store: storeWithHealth(snap, "CORRUPT") });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(r.code).toBe("GRAPH_UNHEALTHY");
  });

  it("denies a stale graph without a resolved stale-graph permission", async () => {
    const { snap, recA } = contradictSnapshot();
    const facade = buildFacade({ identity: ceoIdentity({ allowStaleGraph: false }), store: storeWithHealth(snap, "STALE") });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(r.code).toBe("STALE_NOT_AUTHORIZED");
  });

  it("serves a stale graph when the resolved identity grants it", async () => {
    const { snap, recA } = contradictSnapshot();
    const facade = buildFacade({ identity: ceoIdentity({ allowStaleGraph: true }), store: storeWithHealth(snap, "STALE") });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(r.code).toBe("OK");
    expect(r.view?.stale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// security-filtered results — hidden entities + no protected bodies
// ---------------------------------------------------------------------------

describe("security-filtered results", () => {
  it("hidden entities do not affect facade totals", async () => {
    const { snap, recA, recB } = contradictSnapshot();
    const visible = buildFacade({ store: healthyStore(snap) });
    const vr = await visible.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(vr.view?.counts.findings).toBe(1);

    // hide the conflicting other node — the finding (and its total) must disappear.
    const hidden = buildFacade({ store: healthyStore(snap), permissionAdapter: denyNodeAdapter(new Set([recB.id])) });
    const hr = await hidden.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(hr.view?.counts.findings).toBe(0);
  });

  it("never exposes a protected body in the mapped result", async () => {
    const { snap, recA } = contradictSnapshot();
    const facade = buildFacade({ store: healthyStore(snap) });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    const bodies = (r.view?.findings ?? []).flatMap((f) => f.evidence).map((e) => e.bodyOpened);
    expect(bodies.every((b) => b === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// audit correlation
// ---------------------------------------------------------------------------

describe("audit correlation", () => {
  it("joins facade/query/traversal executions with DISTINCT ids", async () => {
    const { snap, recA } = contradictSnapshot();
    const { sink, records } = recordingSink();
    const facade = buildFacade({ store: healthyStore(snap), sink, exec: counterExec("e") });
    const r = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(r.code).toBe("OK");
    const a = r.audit!;
    expect(a.facadeExecutionId).toBeTruthy();
    expect(a.queryExecutionId).toBeTruthy();
    expect(a.traversalExecutionIds.length).toBeGreaterThan(0);
    // three DISTINCT layer ids — never merged.
    const all = [a.facadeExecutionId, a.queryExecutionId, ...a.traversalExecutionIds];
    expect(new Set(all).size).toBe(all.length);
    expect(a.traversalExecutionIds).not.toContain(a.facadeExecutionId);
    expect(a.traversalExecutionIds).not.toContain(a.queryExecutionId);
    // the emitted record is the result's record.
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(a);
  });

  it("repeated requests get separate execution ids", async () => {
    const { snap, recA } = contradictSnapshot();
    const facade = buildFacade({ store: healthyStore(snap), exec: counterExec("e") });
    const r1 = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    const r2 = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(r1.facadeExecutionId).not.toBe(r2.facadeExecutionId);
    expect(r1.audit?.queryExecutionId).not.toBe(r2.audit?.queryExecutionId);
  });
});

// ---------------------------------------------------------------------------
// lifecycle — disposal + read-only snapshot
// ---------------------------------------------------------------------------

describe("lifecycle", () => {
  it("disposal is safe + idempotent and releases the store once", async () => {
    const { snap, recA } = contradictSnapshot();
    const rp = recordingStoreProvider(healthyStore(snap));
    const facade = buildFacade({ store: undefined, storeProvider: rp.provider });
    await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(rp.getStoreCalls()).toBe(1);
    expect(facade.getStatus()).toMatchObject({ constructed: true, storeOpened: true });

    await facade.dispose();
    await facade.dispose(); // idempotent — no throw, no second release
    expect(rp.disposeCalls()).toBe(1);
    expect(facade.getStatus().disposed).toBe(true);

    // a query after disposal fails safely (no throw, no OK).
    const after = await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(after.ok).toBe(false);
  });

  it("leaves the ACTIVE snapshot byte-identical after running queries", async () => {
    const { snap, recA, recB } = contradictSnapshot();
    const before = JSON.parse(JSON.stringify(snap)) as unknown;
    const facade = buildFacade({ store: healthyStore(snap) });
    await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    await facade.buildFullEvidencePath(reqCtx("c", { startNodeId: recA.id, targetNodeId: recB.id }));
    expect(JSON.parse(JSON.stringify(snap))).toEqual(before);
  });

  it("getStatus reflects lazy construction after the first query", async () => {
    const { snap, recA } = contradictSnapshot();
    const facade = buildFacade({ store: healthyStore(snap) });
    expect(facade.getStatus().constructed).toBe(false);
    await facade.findRecommendationConflicts(reqCtx("c", { subjects: [recA.id] }));
    expect(facade.getStatus()).toMatchObject({ constructed: true, storeOpened: true });
  });
});

// ---------------------------------------------------------------------------
// capabilities (honest, audited)
// ---------------------------------------------------------------------------

describe("capabilities", () => {
  it("reports all 9 capabilities and audits the access (no store read)", () => {
    const rp = recordingStoreProvider(emptyStore());
    const { sink, records } = recordingSink();
    const facade = buildFacade({ storeProvider: rp.provider, sink });
    const r = facade.getCapabilities({ sessionIdentity: { sessionRef: "s" }, correlationId: "cap-1" });
    expect(r.ok).toBe(true);
    expect(r.capabilities).toHaveLength(9);
    expect(rp.getStoreCalls()).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ operation: "getCapabilities", resultCode: "OK", organizationId: VALID_ORG });
  });
});

// keep FIXED_ISO referenced (deterministic clock anchor)
void FIXED_ISO;
