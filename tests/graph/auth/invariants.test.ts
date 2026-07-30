// TERAGON Business Graph — Phase 11 OPERATOR-AUTH security-invariant tests.
// No import-time work; no module singleton; no window global; injected RNG/clock;
// raw secret + raw token never on any audit/log surface.
import { describe, expect, it } from "vitest";
import {
  createOperatorRuntimeComposition,
  isAuthenticated,
  safeSessionHandle,
} from "@/graph";
import {
  activeOperatorUsers,
  configFor,
  countingRandom,
  forbiddenStoreProviderFactory,
  freshSecret,
  mutableClock,
} from "./helpers";

describe("operator-auth security invariants", () => {
  it("constructing the composition does NO work — no token minted, no store opened", () => {
    const { random, count } = countingRandom();
    const mc = mutableClock();
    // forbiddenStoreProviderFactory throws if invoked; construction must not invoke it.
    expect(() =>
      createOperatorRuntimeComposition({
        config: configFor(freshSecret()),
        userLookup: activeOperatorUsers(),
        storeProviderFactory: forbiddenStoreProviderFactory,
        clock: mc.clock,
        random,
        authOverride: true,
      }),
    ).not.toThrow();
    expect(count()).toBe(0); // no session minted at construction time
  });

  it("has no module-level singleton — two compositions hold independent session state", () => {
    const secret = freshSecret();
    const mk = () =>
      createOperatorRuntimeComposition({
        config: configFor(secret),
        userLookup: activeOperatorUsers(),
        storeProviderFactory: forbiddenStoreProviderFactory,
        clock: mutableClock().clock,
        random: countingRandom().random,
        authOverride: true,
      });
    // NOTE: distinct verifiers per config (random salt) — authenticate with each own secret.
    const a = createOperatorRuntimeComposition({
      config: configFor(secret),
      userLookup: activeOperatorUsers(),
      storeProviderFactory: forbiddenStoreProviderFactory,
      clock: mutableClock().clock,
      random: countingRandom().random,
      authOverride: true,
    });
    const b = mk();
    const ra = a.authenticator.authenticate(secret);
    if (!isAuthenticated(ra)) throw new Error("expected auth");
    // a's live token is unknown to b's store (independent state).
    expect(a.sessionStore.verify(ra.sessionRef)).not.toBeNull();
    expect(b.sessionStore.verify(ra.sessionRef)).toBeNull();
  });

  it("does not expose a window/global mutable auth singleton", () => {
    const g = globalThis as Record<string, unknown>;
    expect(g["__operatorAuth"]).toBeUndefined();
    expect(g["operatorSessionStore"]).toBeUndefined();
  });

  it("the raw secret and raw token never appear on the at-rest or audit surface", () => {
    const secret = freshSecret();
    const built = createOperatorRuntimeComposition({
      config: configFor(secret),
      userLookup: activeOperatorUsers(),
      storeProviderFactory: forbiddenStoreProviderFactory,
      clock: mutableClock().clock,
      random: countingRandom().random,
      authOverride: true,
    });
    const result = built.authenticator.authenticate(secret);
    if (!isAuthenticated(result)) throw new Error("expected auth");
    const ref = result.sessionRef;

    // at-rest surface: only hashes.
    const atRest = JSON.stringify(built.sessionStore.atRestSnapshot());
    expect(atRest).not.toContain(secret);
    expect(atRest).not.toContain(ref);

    // a safe audit handle reveals only a short hash prefix — not the token.
    const handle = safeSessionHandle(ref);
    expect(handle.length).toBe(12);
    expect(handle).not.toContain(ref);
    expect(handle).not.toContain(secret);
    expect(ref).not.toContain(handle);
  });
});
