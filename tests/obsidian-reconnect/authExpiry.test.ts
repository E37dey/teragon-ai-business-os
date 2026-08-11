// Reconnect fix — the CENTRAL auth-expiry mechanism.
//
// Proves the single narrow behavior that every Obsidian surface relies on:
//  - expireObsidianAuth() clears the stale credential ONCE and notifies listeners
//  - it never fires when nothing was paired ("not paired" ≠ "expired")
//  - the bridge-client chokepoint invokes it on a genuine credentialed 401
//  - a tokenless probe 401 is NOT treated as an auth expiry
//  - no token value is leaked in the returned result
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expireObsidianAuth,
  getObsidianToken,
  hasObsidianWriteKey,
  onObsidianAuthExpiry,
  setObsidianToken,
  setObsidianWriteKey,
} from "@/integration/obsidian/obsidianCredential";
import { getConnectionInfo, probeHealth } from "@/integration/obsidian/vaultBridgeClient";

const BASE = "http://127.0.0.1:5200";

function res(status: number): Response {
  return new Response(status === 200 ? JSON.stringify({ ok: true }) : null, { status });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("expireObsidianAuth — central mechanism", () => {
  it("clears token + write key and notifies subscribers exactly once", () => {
    setObsidianToken("stale-token");
    setObsidianWriteKey("stale-write-key");
    const fired = vi.fn();
    const off = onObsidianAuthExpiry(fired);

    expireObsidianAuth();

    expect(getObsidianToken()).toBeNull();
    expect(hasObsidianWriteKey()).toBe(false);
    expect(fired).toHaveBeenCalledTimes(1);
    off();
  });

  it("is a NO-OP with NO broadcast when nothing was paired (not-paired ≠ expired)", () => {
    const fired = vi.fn();
    const off = onObsidianAuthExpiry(fired);
    expireObsidianAuth();
    expect(fired).not.toHaveBeenCalled();
    off();
  });

  it("does not fire a listener after it unsubscribes", () => {
    setObsidianToken("t");
    const fired = vi.fn();
    const off = onObsidianAuthExpiry(fired);
    off();
    expireObsidianAuth();
    expect(fired).not.toHaveBeenCalled();
  });

  it("isolates a throwing listener so others still receive the expiry", () => {
    setObsidianToken("t");
    const good = vi.fn();
    const offBad = onObsidianAuthExpiry(() => {
      throw new Error("boom");
    });
    const offGood = onObsidianAuthExpiry(good);
    expect(() => expireObsidianAuth()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });
});

describe("bridge-client chokepoint — 401 → central expiry", () => {
  it("a credentialed 401 clears the stale token, broadcasts, and returns UNAUTHORIZED (no token leak)", async () => {
    setObsidianToken("stale-token");
    const fired = vi.fn();
    const off = onObsidianAuthExpiry(fired);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(401));

    const r = await getConnectionInfo("stale-token", BASE);

    expect(r.code).toBe("UNAUTHORIZED");
    expect(r.status).toBe(401);
    expect(getObsidianToken()).toBeNull(); // stale token cleared centrally
    expect(fired).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r)).not.toContain("stale-token"); // no secret in the result
    off();
  });

  it("a TOKENLESS probe 401 is NOT an auth expiry (token preserved, no broadcast)", async () => {
    setObsidianToken("kept-token");
    const fired = vi.fn();
    const off = onObsidianAuthExpiry(fired);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res(401));

    await probeHealth(BASE); // probeHealth sends no Authorization header

    expect(getObsidianToken()).toBe("kept-token");
    expect(fired).not.toHaveBeenCalled();
    off();
  });

  it("TIMEOUT (aborted request) is NOT classified as auth expiry", async () => {
    setObsidianToken("kept-token");
    const fired = vi.fn();
    const off = onObsidianAuthExpiry(fired);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const r = await getConnectionInfo("kept-token", BASE);

    expect(r.code).toBe("TIMEOUT");
    expect(getObsidianToken()).toBe("kept-token"); // not cleared
    expect(fired).not.toHaveBeenCalled();
    off();
  });

  it("UNAVAILABLE (network fault) is NOT classified as auth expiry", async () => {
    setObsidianToken("kept-token");
    const fired = vi.fn();
    const off = onObsidianAuthExpiry(fired);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const r = await getConnectionInfo("kept-token", BASE);

    expect(r.code).toBe("UNAVAILABLE");
    expect(getObsidianToken()).toBe("kept-token"); // not cleared
    expect(fired).not.toHaveBeenCalled();
    off();
  });
});
