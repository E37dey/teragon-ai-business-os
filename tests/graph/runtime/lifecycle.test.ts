// TERAGON Business Graph — Phase 10 RUNTIME composition/lifecycle tests.
// Proves: lazy construction (no store open on import/acquire); one facade per
// authenticated context; identity/org/role change disposes the previous facade;
// org switch cannot reuse a prior org's store/data; logout disposes; user switch
// cannot reuse permissions; role change forces fresh resolution; no window global;
// and the fail-closed audit gate suppresses data end-to-end on a failed write.
import { describe, expect, it } from "vitest";
import {
  RuntimeBusinessGraphAuditAdapter,
  RuntimeBusinessGraphComposition,
  createStoreProvider,
  type BusinessGraphStoreProvider,
  type TrustedAuthenticatedSession,
  type TrustedSessionSource,
} from "@/graph";
import {
  activeUser,
  CLOCK,
  counterExec,
  deriveAugmentedSnapshot,
  emptyStore,
  healthyStore,
  nid,
  recordingStoreProvider,
  reqCtx,
  throwingAuditWriter,
  trustedSession,
  userLookupFrom,
  VALID_ORG,
  type RecordingStoreProvider,
} from "./helpers";

/** A session source whose current session can be swapped (same ref). */
function mutableSource(initial: TrustedAuthenticatedSession): {
  source: TrustedSessionSource;
  set: (s: TrustedAuthenticatedSession) => void;
} {
  let current = initial;
  return {
    source: { lookup: (ref) => (ref === current.sessionRef ? current : null) },
    set: (s) => {
      current = s;
    },
  };
}

/** A composition whose store providers are recorded for dispose/getStore assertions. */
function trackedComposition(sessions: TrustedSessionSource, users = userLookupFrom([activeUser("u-tzachi")])) {
  const providers: RecordingStoreProvider[] = [];
  const factory = (): BusinessGraphStoreProvider => {
    const rp = recordingStoreProvider(emptyStore());
    providers.push(rp);
    return rp.provider;
  };
  const composition = new RuntimeBusinessGraphComposition({
    sessionSource: sessions,
    userLookup: users,
    storeProviderFactory: factory,
    clock: CLOCK,
    executionIdProvider: counterExec(),
    featureOverride: true,
    rolloutOverride: true,
  });
  return { composition, providers };
}

describe("runtime lifecycle", () => {
  it("builds NOTHING on acquire until the first query actually runs (lazy)", async () => {
    const { composition, providers } = trackedComposition({ lookup: () => trustedSession() });
    const lifecycle = composition.createLifecycle();
    const acq = await lifecycle.acquire({ sessionRef: "sess-1" });
    expect(acq.ok).toBe(true);
    // a facade exists but has opened NO store yet.
    expect(providers).toHaveLength(1);
    expect(providers[0]!.getStoreCalls()).toBe(0);

    await lifecycle.runQuery("findCustomersNeedingFollowUp", reqCtx("c-1", { subjects: [nid("customer", "cu-1")] }));
    expect(providers[0]!.getStoreCalls()).toBe(1);
  });

  it("reuses ONE facade for the same authenticated context", async () => {
    const { composition } = trackedComposition({ lookup: () => trustedSession() });
    const lifecycle = composition.createLifecycle();
    const a = await lifecycle.acquire({ sessionRef: "sess-1" });
    const b = await lifecycle.acquire({ sessionRef: "sess-1" });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.reused).toBe(true);
      expect(a.facade).toBe(b.facade);
      expect(a.contextKey).toBe(b.contextKey);
    }
  });

  it("a role change forces fresh resolution and disposes the previous facade", async () => {
    const mut = mutableSource(trustedSession({ roleId: "crole-ceo" }));
    const { composition, providers } = trackedComposition(mut.source);
    const lifecycle = composition.createLifecycle();
    const first = await lifecycle.acquire({ sessionRef: "sess-1" });
    expect(first.ok).toBe(true);

    // same session ref, but the trusted role changed ⇒ different context ⇒ rebuild.
    mut.set(trustedSession({ roleId: "crole-service" }));
    const second = await lifecycle.acquire({ sessionRef: "sess-1" });
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.facade).not.toBe(first.facade);
      expect(second.reused).toBe(false);
      expect(first.facade.getStatus().disposed).toBe(true); // previous facade disposed
    }
    expect(providers).toHaveLength(2);
  });

  it("permission revocation (role loses all graph access) disposes the facade + denies", async () => {
    const mut = mutableSource(trustedSession({ roleId: "crole-ceo" }));
    const { composition } = trackedComposition(mut.source);
    const lifecycle = composition.createLifecycle();
    const first = await lifecycle.acquire({ sessionRef: "sess-1" });
    // revoked to a role with NO graph capability (viewer).
    mut.set(trustedSession({ roleId: "crole-viewer" }));
    const denied = await lifecycle.acquire({ sessionRef: "sess-1" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.decision).toBe("CAPABILITY_DENIED");
    if (first.ok) expect(first.facade.getStatus().disposed).toBe(true);
    expect(lifecycle.currentContextKey).toBeNull();
  });

  it("a user switch cannot reuse the prior user's facade", async () => {
    const source: TrustedSessionSource = {
      lookup: (ref) =>
        ref === "sess-a"
          ? trustedSession({ sessionRef: "sess-a", authenticatedUserId: "u-a" })
          : ref === "sess-b"
            ? trustedSession({ sessionRef: "sess-b", authenticatedUserId: "u-b" })
            : null,
    };
    const { composition, providers } = trackedComposition(
      source,
      userLookupFrom([activeUser("u-a"), activeUser("u-b")]),
    );
    const lifecycle = composition.createLifecycle();
    const a = await lifecycle.acquire({ sessionRef: "sess-a" });
    const b = await lifecycle.acquire({ sessionRef: "sess-b" });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.facade).not.toBe(a.facade);
      expect(b.contextKey).not.toBe(a.contextKey);
      expect(a.facade.getStatus().disposed).toBe(true);
    }
    expect(providers).toHaveLength(2);
  });

  it("an organization switch cannot leak the prior org's data", async () => {
    const source: TrustedSessionSource = {
      lookup: (ref) =>
        ref === "sess-a"
          ? trustedSession({ sessionRef: "sess-a", authenticatedUserId: "u-a", organizationId: VALID_ORG })
          : ref === "sess-b"
            ? trustedSession({ sessionRef: "sess-b", authenticatedUserId: "u-b", organizationId: "org-other" })
            : null,
    };
    const { composition, providers } = trackedComposition(
      source,
      userLookupFrom([activeUser("u-a"), activeUser("u-b")]),
    );
    const lifecycle = composition.createLifecycle();
    const a = await lifecycle.acquire({ sessionRef: "sess-a" });
    await lifecycle.acquire({ sessionRef: "sess-b" });
    // org A's facade was disposed; org B is a fresh store context.
    if (a.ok) expect(a.facade.getStatus().disposed).toBe(true);
    expect(providers).toHaveLength(2);
    // running a query for org B with an org-A subject id is refused (no cross-org).
    const exec = await lifecycle.runQuery(
      "findCustomersNeedingFollowUp",
      reqCtx("c-x", { subjects: [nid("customer", "cu-1", VALID_ORG)] }, "sess-b"),
    );
    expect(exec.ok).toBe(true);
    if (exec.ok) expect(exec.outcome.result.code).toBe("ORGANIZATION_MISMATCH");
  });

  it("logout disposes the facade; a later login rebuilds fresh", async () => {
    const { composition, providers } = trackedComposition({ lookup: () => trustedSession() });
    const lifecycle = composition.createLifecycle();
    const first = await lifecycle.acquire({ sessionRef: "sess-1" });
    await lifecycle.logout();
    if (first.ok) expect(first.facade.getStatus().disposed).toBe(true);
    expect(lifecycle.currentContextKey).toBeNull();
    // re-login works (lifecycle is not permanently dead after logout).
    const again = await lifecycle.acquire({ sessionRef: "sess-1" });
    expect(again.ok).toBe(true);
    expect(providers).toHaveLength(2);
  });

  it("dispose() is terminal — a subsequent acquire is denied", async () => {
    const { composition } = trackedComposition({ lookup: () => trustedSession() });
    const lifecycle = composition.createLifecycle();
    await lifecycle.acquire({ sessionRef: "sess-1" });
    await lifecycle.dispose();
    expect(lifecycle.isDisposed).toBe(true);
    const denied = await lifecycle.acquire({ sessionRef: "sess-1" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.decision).toBe("GRAPH_UNAVAILABLE");
    await lifecycle.dispose(); // idempotent
  });

  it("exposes NO facade via a window / global", () => {
    const { composition } = trackedComposition({ lookup: () => trustedSession() });
    composition.createLifecycle();
    const g = globalThis as Record<string, unknown>;
    expect(g.businessGraphFacade).toBeUndefined();
    expect(g.__teragonBusinessGraph).toBeUndefined();
  });

  it("fail-CLOSED end-to-end: a supported query is suppressed when the durable audit write fails", async () => {
    const snap = await deriveAugmentedSnapshot();
    const audit = new RuntimeBusinessGraphAuditAdapter({ writer: throwingAuditWriter() });
    const composition = new RuntimeBusinessGraphComposition({
      sessionSource: { lookup: () => trustedSession() },
      userLookup: userLookupFrom([activeUser("u-tzachi")]),
      storeProviderFactory: () => createStoreProvider(healthyStore(snap)),
      clock: CLOCK,
      auditAdapter: audit,
      executionIdProvider: counterExec("e"),
      featureOverride: true,
      rolloutOverride: true,
    });
    const lifecycle = composition.createLifecycle();
    const exec = await lifecycle.runQuery(
      "findCustomersNeedingFollowUp",
      reqCtx("c-fc", { subjects: [nid("customer", "cu-1")] }),
    );
    expect(exec.ok).toBe(true);
    if (exec.ok) {
      expect(exec.outcome.auditState).toBe("FAILED");
      expect(exec.outcome.released).toBe(false);
      expect(exec.outcome.result.view).toBeNull();
      expect(exec.outcome.result.code).toBe("INTERNAL_FAILURE");
    }
  });
});
