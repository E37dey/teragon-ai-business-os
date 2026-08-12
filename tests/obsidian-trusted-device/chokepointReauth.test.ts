// The bridge-client 401 chokepoint: a stale session transparently re-authenticates via the
// registered trusted-device handler and retries ONCE; if recovery is impossible it expires
// to the manual reconnect fallback. This is the single re-auth path every consumer shares.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getObsidianToken, setObsidianToken, setTrustedReauthHandler } from "@/integration/obsidian/obsidianCredential";
import { getConnectionInfo } from "@/integration/obsidian/vaultBridgeClient";

const OK = { connected: true, vaultName: "TERAGON OS", version: "v", readonly: false, writeEnabled: true };

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  setTrustedReauthHandler(null);
  sessionStorage.clear();
});

function fetchByBearer(map: Record<string, { status: number; body?: unknown }>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const auth = ((init?.headers as Record<string, string>) ?? {}).Authorization ?? "";
    const r = map[auth.replace("Bearer ", "")] ?? { status: 401 };
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : JSON.stringify({ error: "unauthorized" }), { status: r.status });
  });
}

describe("chokepoint trusted re-auth", () => {
  it("401 → trusted re-auth → retry ONCE with the fresh session → success", async () => {
    setObsidianToken("stale");
    const handler = vi.fn(async () => {
      setObsidianToken("fresh");
      return "fresh";
    });
    setTrustedReauthHandler(handler);
    fetchByBearer({ stale: { status: 401 }, fresh: { status: 200, body: OK } });
    const r = await getConnectionInfo("stale");
    expect(r.ok).toBe(true);
    expect(r.data?.vaultName).toBe("TERAGON OS");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(getObsidianToken()).toBe("fresh");
  });

  it("401 with no trusted recovery → expire (token cleared, result stays UNAUTHORIZED)", async () => {
    setObsidianToken("stale");
    const handler = vi.fn(async () => null);
    setTrustedReauthHandler(handler);
    fetchByBearer({ stale: { status: 401 } });
    const r = await getConnectionInfo("stale");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("UNAUTHORIZED");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(getObsidianToken()).toBeNull(); // fell back to the manual reconnect state
  });

  it("a first-try success never invokes re-auth", async () => {
    const handler = vi.fn(async () => "x");
    setTrustedReauthHandler(handler);
    fetchByBearer({ good: { status: 200, body: OK } });
    const r = await getConnectionInfo("good");
    expect(r.ok).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });
});
