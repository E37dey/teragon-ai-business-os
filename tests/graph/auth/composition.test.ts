// TERAGON Business Graph — Phase 11 OPERATOR-AUTH runtime-binding tests.
// The crux: authentication makes a TRUSTED session obtainable, and the Phase-10
// resolver ACCEPTS it — yet the access policy STILL denies graph access while the
// facade/rollout gates are OFF. Auth availability ≠ graph access.
import { describe, expect, it } from "vitest";
import {
  createOperatorRuntimeComposition,
  isAuthenticated,
  type OperatorRuntimeCompositionOptions,
} from "@/graph";
import {
  activeOperatorUsers,
  configFor,
  counterRandom,
  forbiddenStoreProviderFactory,
  freshSecret,
  mutableClock,
} from "./helpers";

function buildOperator(
  over: Partial<OperatorRuntimeCompositionOptions> & { secret?: string } = {},
) {
  const secret = over.secret ?? freshSecret();
  const mc = mutableClock(1_000);
  const built = createOperatorRuntimeComposition({
    config: over.config === undefined ? configFor(secret) : over.config,
    userLookup: over.userLookup ?? activeOperatorUsers(),
    storeProviderFactory: over.storeProviderFactory ?? forbiddenStoreProviderFactory,
    clock: over.clock ?? mc.clock,
    random: over.random ?? counterRandom(),
    ...(over.authOverride !== undefined ? { authOverride: over.authOverride } : {}),
    ...(over.featureOverride !== undefined ? { featureOverride: over.featureOverride } : {}),
    ...(over.rolloutOverride !== undefined ? { rolloutOverride: over.rolloutOverride } : {}),
  });
  return { ...built, secret };
}

describe("operator runtime binding — auth ≠ graph access", () => {
  it("authenticates, the resolver ACCEPTS the session, yet the policy returns FEATURE_DISABLED", () => {
    // auth ON; facade + rollout left at their OFF / NOT-approved production defaults.
    const { authenticator, composition, secret } = buildOperator({ authOverride: true });
    const result = authenticator.authenticate(secret);
    expect(isAuthenticated(result)).toBe(true);
    if (!isAuthenticated(result)) return;
    const sessionIdentity = { sessionRef: result.sessionRef };

    // (1) the Phase-10 resolver ACCEPTS the trusted session — a real identity resolves.
    const detailed = composition.identityResolver.resolveDetailed(sessionIdentity);
    expect(detailed.ok).toBe(true);
    if (detailed.ok) {
      expect(detailed.identity.actor).toEqual({ kind: "HUMAN", userId: "u-operator" });
      expect(detailed.identity.organizationId).toBe("org-teragon");
      expect(detailed.identity.role).toBe("crole-ceo");
    }

    // (2) yet access is DENIED — the facade flag is OFF. Authentication is NOT access.
    const evaluation = composition.accessPolicy.evaluate({ sessionIdentity });
    expect(evaluation.decision).toBe("FEATURE_DISABLED");
    expect(evaluation.identity).toBeNull();
  });

  it("with the facade ON but rollout NOT approved, an authenticated operator gets ROLLOUT_NOT_APPROVED", () => {
    const { authenticator, composition, secret } = buildOperator({
      authOverride: true,
      featureOverride: true, // facade forced ON …
      // … rollout deliberately omitted ⇒ NOT approved.
    });
    const result = authenticator.authenticate(secret);
    if (!isAuthenticated(result)) throw new Error("expected auth");
    const sessionIdentity = { sessionRef: result.sessionRef };

    expect(composition.identityResolver.resolveDetailed(sessionIdentity).ok).toBe(true);
    const evaluation = composition.accessPolicy.evaluate({ sessionIdentity });
    expect(evaluation.decision).toBe("ROLLOUT_NOT_APPROVED");
    expect(evaluation.identity).toBeNull();
  });

  it("POSITIVE CONTROL: with facade + rollout forced ON, the trusted session ENABLES access", () => {
    const { authenticator, composition, secret } = buildOperator({
      authOverride: true,
      featureOverride: true,
      rolloutOverride: true,
    });
    const result = authenticator.authenticate(secret);
    if (!isAuthenticated(result)) throw new Error("expected auth");
    const evaluation = composition.accessPolicy.evaluate({
      sessionIdentity: { sessionRef: result.sessionRef },
    });
    expect(evaluation.decision).toBe("ENABLED");
    expect(evaluation.identity?.organizationId).toBe("org-teragon");
    expect(evaluation.identity?.role).toBe("crole-ceo");
  });

  it("flag OFF ⇒ authenticate denied AND the bound runtime stays IDENTITY_UNAVAILABLE", () => {
    // auth OFF, but facade + rollout forced ON so the decision reflects IDENTITY only.
    const { authenticator, composition, secret } = buildOperator({
      authOverride: false,
      featureOverride: true,
      rolloutOverride: true,
    });
    expect("denied" in authenticator.authenticate(secret)).toBe(true);
    const evaluation = composition.accessPolicy.evaluate({ sessionIdentity: { sessionRef: "anything" } });
    expect(evaluation.decision).toBe("IDENTITY_UNAVAILABLE");
    expect(evaluation.identity).toBeNull();
  });

  it("unavailable config ⇒ authenticate denied AND runtime IDENTITY_UNAVAILABLE", () => {
    const { authenticator, composition, secret } = buildOperator({
      authOverride: true,
      config: null,
      featureOverride: true,
      rolloutOverride: true,
    });
    expect("denied" in authenticator.authenticate(secret)).toBe(true);
    expect(
      composition.accessPolicy.evaluate({ sessionIdentity: { sessionRef: "x" } }).decision,
    ).toBe("IDENTITY_UNAVAILABLE");
  });

  it("does NOT touch the graph store during authenticate / resolve / deny (lazy; store factory unused)", () => {
    // storeProviderFactory THROWS if called — a denied evaluation never builds a facade.
    const { authenticator, composition, secret } = buildOperator({ authOverride: true });
    const result = authenticator.authenticate(secret);
    if (!isAuthenticated(result)) throw new Error("expected auth");
    expect(() =>
      composition.accessPolicy.evaluate({ sessionIdentity: { sessionRef: result.sessionRef } }),
    ).not.toThrow();
  });
});
