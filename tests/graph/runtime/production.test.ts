// TERAGON Business Graph — Phase 10 RUNTIME production-path tests.
// Proves the honest production outcome: no trusted authenticated identity exists,
// so the resolver yields IDENTITY_UNAVAILABLE and runtime graph access stays
// closed. Also: the flags/rollout default closed, no admin is fabricated, and
// constructing the composition does NO graph/background work.
import { describe, expect, it } from "vitest";
import {
  BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED,
  BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED,
  RuntimeBusinessGraphComposition,
  UnavailableTrustedSessionSource,
  EmptyActiveUserLookup,
  createFeaturePolicy,
  createRolloutPolicy,
  createProductionRuntimeComposition,
  BusinessGraphRuntimeAccessPolicy,
  RuntimeBusinessGraphIdentityResolver,
  createStoreProvider,
  type BusinessGraphStoreProvider,
} from "@/graph";
import { CLOCK, emptyStore } from "./helpers";

const REF = { sessionRef: "sess-anything" };

describe("runtime production path", () => {
  it("the flags and rollout default CLOSED", () => {
    expect(BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED).toBe(false);
    expect(BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED).toBe(false);
  });

  it("the production composition denies access (triply closed) and fabricates no admin", async () => {
    const composition = createProductionRuntimeComposition();
    const lifecycle = composition.createLifecycle();
    const acq = await lifecycle.acquire(REF);
    expect(acq.ok).toBe(false);
    if (!acq.ok) expect(acq.decision).toBe("FEATURE_DISABLED"); // flag OFF wins first

    // the resolver itself has NO trusted identity — never an admin.
    expect(composition.identityResolver.resolve(REF)).toEqual({ ok: false, reason: "UNAUTHENTICATED" });
    expect(composition.identityResolver.resolveDetailed(REF)).toEqual({
      ok: false,
      reason: "NO_TRUSTED_SESSION",
    });
  });

  it("even with the flags FORCED ON, production yields IDENTITY_UNAVAILABLE (the honest forcing function)", () => {
    const policy = new BusinessGraphRuntimeAccessPolicy({
      featurePolicy: createFeaturePolicy(true),
      rolloutPolicy: createRolloutPolicy(true),
      identityResolver: new RuntimeBusinessGraphIdentityResolver({
        sessionSource: new UnavailableTrustedSessionSource(),
        userLookup: new EmptyActiveUserLookup(),
      }),
    });
    const evaluation = policy.evaluate({ sessionIdentity: REF, graphHealth: "HEALTHY" });
    expect(evaluation.decision).toBe("IDENTITY_UNAVAILABLE");
    expect(evaluation.identity).toBeNull();
  });

  it("constructing the composition + lifecycle does NO store/background work (lazy)", async () => {
    let factoryCalls = 0;
    const factory = (): BusinessGraphStoreProvider => {
      factoryCalls += 1;
      return createStoreProvider(emptyStore());
    };
    const composition = new RuntimeBusinessGraphComposition({
      sessionSource: new UnavailableTrustedSessionSource(),
      userLookup: new EmptyActiveUserLookup(),
      storeProviderFactory: factory,
      clock: CLOCK,
      featureOverride: true,
      rolloutOverride: true,
    });
    const lifecycle = composition.createLifecycle();
    // no facade built yet ⇒ the store provider factory was never invoked.
    expect(factoryCalls).toBe(0);
    // a denied acquire (no identity) still builds nothing.
    const acq = await lifecycle.acquire(REF);
    expect(acq.ok).toBe(false);
    expect(factoryCalls).toBe(0);
  });
});
