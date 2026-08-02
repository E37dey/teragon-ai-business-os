// TERAGON Business Graph — Phase 11 OPERATOR-AUTH session-store tests.
// Opaque high-entropy token from injected RNG; hashed at rest (raw token never
// stored); TTL/expiry from injected clock; revocation; bounded sessions.
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/governance/checksum";
import {
  OperatorSessionStore,
  safeSessionHandle,
  type OperatorSessionIdentity,
} from "@/graph";
import { countingRandom, counterRandom, mutableClock } from "./helpers";

const IDENTITY: OperatorSessionIdentity = {
  authenticatedUserId: "u-operator",
  organizationId: "org-teragon",
  roleId: "crole-ceo",
  actorKind: "HUMAN",
};

function store(over: { ttlMs?: number; max?: number } = {}) {
  const mc = mutableClock(1_000);
  const s = new OperatorSessionStore({
    clock: mc.clock,
    random: counterRandom(),
    ttlMs: over.ttlMs ?? 60_000,
    maxActiveSessions: over.max ?? 3,
  });
  return { s, mc };
}

describe("OperatorSessionStore", () => {
  it("issues an opaque token that verifies back to the bound identity", () => {
    const { s } = store();
    const ref = s.issue(IDENTITY);
    const live = s.verify(ref);
    expect(live).not.toBeNull();
    expect(live?.identity).toEqual(IDENTITY);
    expect(live?.sessionRef).toBe(ref);
  });

  it("stores tokens HASHED at rest — the raw token never appears in the store", () => {
    const { s } = store();
    const ref = s.issue(IDENTITY);
    const dump = JSON.stringify(s.atRestSnapshot());
    expect(dump).not.toContain(ref);
    expect(dump).toContain(sha256Hex(ref));
    // exactly one at-rest record, and it carries a tokenHash (not the token).
    const [rest] = s.atRestSnapshot();
    expect(rest?.tokenHash).toBe(sha256Hex(ref));
    expect(JSON.stringify(rest)).not.toContain(ref);
  });

  it("mints DISTINCT tokens on repeated issues (injected RNG)", () => {
    const { s } = store({ max: 10 });
    const refs = new Set([s.issue(IDENTITY), s.issue(IDENTITY), s.issue(IDENTITY)]);
    expect(refs.size).toBe(3);
  });

  it("does not derive the token from the identity", () => {
    const { s } = store();
    const ref = s.issue(IDENTITY);
    expect(ref).not.toContain(IDENTITY.authenticatedUserId);
    expect(ref).not.toContain(IDENTITY.roleId);
    expect(ref).not.toContain(IDENTITY.organizationId);
  });

  it("expires a session when the clock passes the TTL (lookup ⇒ null)", () => {
    const { s, mc } = store({ ttlMs: 5_000 });
    const ref = s.issue(IDENTITY);
    mc.advance(4_999);
    expect(s.verify(ref)).not.toBeNull();
    mc.advance(1); // now == expiresAt ⇒ expired
    expect(s.verify(ref)).toBeNull();
  });

  it("revokes a session (verify ⇒ null afterward)", () => {
    const { s } = store();
    const ref = s.issue(IDENTITY);
    expect(s.revoke(ref)).toBe(true);
    expect(s.verify(ref)).toBeNull();
    expect(s.revoke(ref)).toBe(false); // already gone
  });

  it("returns null for an unknown token", () => {
    const { s } = store();
    expect(s.verify("never-issued")).toBeNull();
  });

  it("enforces maxActiveSessions by evicting the oldest live session", () => {
    const { s } = store({ max: 2 });
    const r1 = s.issue(IDENTITY);
    const r2 = s.issue(IDENTITY);
    const r3 = s.issue(IDENTITY); // exceeds bound ⇒ oldest (r1) evicted
    expect(s.activeCount()).toBe(2);
    expect(s.verify(r1)).toBeNull();
    expect(s.verify(r2)).not.toBeNull();
    expect(s.verify(r3)).not.toBeNull();
  });

  it("prunes expired sessions out of activeCount", () => {
    const { s, mc } = store({ ttlMs: 1_000, max: 5 });
    s.issue(IDENTITY);
    s.issue(IDENTITY);
    expect(s.activeCount()).toBe(2);
    mc.advance(1_000);
    expect(s.activeCount()).toBe(0);
  });

  it("draws exactly one token from the RNG per issue", () => {
    const mc = mutableClock();
    const { random, count } = countingRandom();
    const s = new OperatorSessionStore({ clock: mc.clock, random, ttlMs: 60_000, maxActiveSessions: 5 });
    s.issue(IDENTITY);
    s.issue(IDENTITY);
    expect(count()).toBe(2);
  });

  it("safeSessionHandle is a short non-reversible hash prefix", () => {
    const { s } = store();
    const ref = s.issue(IDENTITY);
    const handle = safeSessionHandle(ref);
    expect(handle).toBe(sha256Hex(ref).slice(0, 12));
    expect(handle).not.toContain(ref);
    expect(handle.length).toBe(12);
  });
});
