// TERAGON Business Graph — Phase 11 OPERATOR-AUTH trusted-session-source tests.
// The drop-in for UnavailableTrustedSessionSource: flag OFF ⇒ null; live session
// ⇒ a TrustedAuthenticatedSession; expired/revoked ⇒ null.
import { describe, expect, it } from "vitest";
import {
  OperatorSessionStore,
  OperatorTrustedSessionSource,
  createOperatorAuthPolicy,
  type OperatorSessionIdentity,
} from "@/graph";
import { counterRandom, mutableClock } from "./helpers";

const IDENTITY: OperatorSessionIdentity = {
  authenticatedUserId: "u-operator",
  organizationId: "org-teragon",
  roleId: "crole-ceo",
  actorKind: "HUMAN",
};

function build(enabled: boolean, ttlMs = 60_000) {
  const mc = mutableClock(1_000);
  const store = new OperatorSessionStore({
    clock: mc.clock,
    random: counterRandom(),
    ttlMs,
    maxActiveSessions: 5,
  });
  const source = new OperatorTrustedSessionSource({
    policy: createOperatorAuthPolicy(enabled),
    sessionStore: store,
  });
  return { store, source, mc };
}

describe("OperatorTrustedSessionSource", () => {
  it("flag OFF ⇒ lookup returns null (mirrors UnavailableTrustedSessionSource)", () => {
    const { store, source } = build(false);
    const ref = store.issue(IDENTITY); // even a stored session is invisible while OFF
    expect(source.lookup(ref)).toBeNull();
  });

  it("flag ON + live session ⇒ a TrustedAuthenticatedSession with the operator facts", () => {
    const { store, source, mc } = build(true);
    const ref = store.issue(IDENTITY);
    const trusted = source.lookup(ref);
    expect(trusted).toEqual({
      authenticatedUserId: "u-operator",
      organizationId: "org-teragon",
      roleId: "crole-ceo",
      actorKind: "HUMAN",
      sessionRef: ref,
      issuedAtIso: new Date(mc.nowMs()).toISOString(),
    });
  });

  it("unknown / expired / revoked ⇒ null", () => {
    const { store, source, mc } = build(true, 5_000);
    expect(source.lookup("never")).toBeNull();

    const ref = store.issue(IDENTITY);
    mc.advance(5_000);
    expect(source.lookup(ref)).toBeNull(); // expired

    const ref2 = store.issue(IDENTITY);
    store.revoke(ref2);
    expect(source.lookup(ref2)).toBeNull(); // revoked
  });
});
