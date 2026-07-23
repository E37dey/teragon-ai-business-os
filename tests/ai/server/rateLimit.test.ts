// W5-B rateLimit.ts — sliding window per-session + per-user, prune, gate.
import { describe, expect, it } from "vitest";
import { ConcurrencyGate, rateKeys, SlidingWindowRateLimiter } from "@/server/rateLimit";

describe("SlidingWindowRateLimiter", () => {
  it("allows up to the limit inside one minute, then blocks", () => {
    const limiter = new SlidingWindowRateLimiter(3);
    const keys = rateKeys("org", "u1", "s1");
    expect(limiter.check(keys, 1_000).allowed).toBe(true);
    expect(limiter.check(keys, 2_000).allowed).toBe(true);
    expect(limiter.check(keys, 3_000).allowed).toBe(true);
    const blocked = limiter.check(keys, 4_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitedBy).toBeTruthy();
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("window slides — old hits stop counting after 60s", () => {
    const limiter = new SlidingWindowRateLimiter(1);
    const keys = rateKeys("org", "u1", "s1");
    expect(limiter.check(keys, 0).allowed).toBe(true);
    expect(limiter.check(keys, 30_000).allowed).toBe(false);
    expect(limiter.check(keys, 61_000).allowed).toBe(true);
  });

  it("per-user limit trips even across DIFFERENT sessions", () => {
    const limiter = new SlidingWindowRateLimiter(1);
    expect(limiter.check(rateKeys("org", "u1", "s1"), 0).allowed).toBe(true);
    const blocked = limiter.check(rateKeys("org", "u1", "s2"), 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitedBy).toBe("user:org:u1");
  });

  it("prunes stale keys so the map does not grow unbounded", () => {
    const limiter = new SlidingWindowRateLimiter(5);
    for (let i = 0; i < 70; i += 1) {
      limiter.check([`session:s${i}`], i);
    }
    // after prune cycles at t≫60s all old keys are gone
    limiter.check(["session:fresh"], 500_000);
    for (let i = 0; i < 70; i += 1) limiter.check(["session:fresh2"], 500_001 + i);
    expect(limiter.size()).toBeLessThan(70);
  });
});

describe("ConcurrencyGate", () => {
  it("caps concurrent slots and releases", () => {
    const gate = new ConcurrencyGate(2);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });
});
