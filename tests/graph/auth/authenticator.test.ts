// TERAGON Business Graph — Phase 11 OPERATOR-AUTH authenticator tests.
// Flag OFF / config unavailable / wrong secret / inactive user ⇒ deny; a valid
// credential (flag ON) issues an opaque session; no session on any denial.
import { describe, expect, it } from "vitest";
import {
  OperatorAuthenticator,
  OperatorSessionStore,
  createOperatorAuthPolicy,
  isAuthenticated,
  type OperatorAuthResult,
} from "@/graph";
import {
  activeOperatorUsers,
  configFor,
  counterRandom,
  freshSecret,
  mutableClock,
  OPERATOR_USER,
  usersWith,
} from "./helpers";

function build(opts: {
  enabled?: boolean;
  secret?: string;
  configNull?: boolean;
  users?: ReturnType<typeof usersWith>;
}) {
  const secret = opts.secret ?? freshSecret();
  const mc = mutableClock();
  const store = new OperatorSessionStore({
    clock: mc.clock,
    random: counterRandom(),
    ttlMs: 60_000,
    maxActiveSessions: 5,
  });
  const authenticator = new OperatorAuthenticator({
    policy: createOperatorAuthPolicy(opts.enabled ?? true),
    config: opts.configNull === true ? null : configFor(secret),
    userLookup: opts.users ?? activeOperatorUsers(),
    sessionStore: store,
  });
  return { authenticator, store, secret };
}

function denial(result: OperatorAuthResult): string | null {
  return "denied" in result ? result.denied : null;
}

describe("OperatorAuthenticator", () => {
  it("issues an opaque session for a valid credential when the flag is ON", () => {
    const { authenticator, store, secret } = build({ enabled: true });
    const result = authenticator.authenticate(secret);
    expect(isAuthenticated(result)).toBe(true);
    if (!isAuthenticated(result)) return;
    expect(store.verify(result.sessionRef)?.identity.authenticatedUserId).toBe(OPERATOR_USER);
  });

  it("denies when the flag is OFF (issues nothing)", () => {
    const { authenticator, store, secret } = build({ enabled: false });
    const result = authenticator.authenticate(secret);
    expect(denial(result)).toBe("AUTH_DISABLED");
    expect(store.activeCount()).toBe(0);
  });

  it("denies when config is unavailable", () => {
    const { authenticator, store, secret } = build({ enabled: true, configNull: true });
    expect(denial(authenticator.authenticate(secret))).toBe("CONFIG_UNAVAILABLE");
    expect(store.activeCount()).toBe(0);
  });

  it("denies a wrong secret and issues NO session", () => {
    const { authenticator, store } = build({ enabled: true, secret: freshSecret() });
    const result = authenticator.authenticate(freshSecret()); // different secret
    expect(denial(result)).toBe("INVALID_CREDENTIAL");
    expect(store.activeCount()).toBe(0);
  });

  it("denies an unknown operator user (issues nothing)", () => {
    const { authenticator, store, secret } = build({ enabled: true, users: usersWith() });
    expect(denial(authenticator.authenticate(secret))).toBe("OPERATOR_INACTIVE");
    expect(store.activeCount()).toBe(0);
  });

  it("denies an inactive / archived operator user", () => {
    const inactive = build({ enabled: true, users: usersWith({ id: OPERATOR_USER, status: "לא פעיל" }) });
    expect(denial(inactive.authenticator.authenticate(inactive.secret))).toBe("OPERATOR_INACTIVE");

    const archived = build({ enabled: true, users: usersWith({ id: OPERATOR_USER, status: "בארכיון" }) });
    expect(denial(archived.authenticator.authenticate(archived.secret))).toBe("OPERATOR_INACTIVE");
  });

  it("never echoes the presented secret in the denial result", () => {
    const { authenticator } = build({ enabled: true, secret: freshSecret() });
    const wrong = freshSecret();
    const result = authenticator.authenticate(wrong);
    expect(JSON.stringify(result)).not.toContain(wrong);
  });
});
