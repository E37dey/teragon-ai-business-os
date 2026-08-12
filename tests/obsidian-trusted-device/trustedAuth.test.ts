// Trusted-auth client: first-pair registration, single-flight challenge-response re-auth,
// and the canonical-payload crypto contract (the client's signature verifies server-side).
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceIdentity, forgetDevice } from "@/integration/obsidian/deviceIdentity";
import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { registerDevice, reauthenticate } from "@/integration/obsidian/trustedAuth";
import { challengePayload, verifyDeviceSignature } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";

const ORIGIN = () => window.location.origin;

beforeEach(() => sessionStorage.clear());
afterEach(async () => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  await forgetDevice();
});

/** Install a fake bridge over fetch that runs the REAL server-side signature verification. */
function installFakeBridge(opts: { challengeCount: { n: number }; issue?: boolean }) {
  const issued = opts.issue ?? true;
  const live = new Map<string, { deviceId: string; nonce: string; expiresAt: number; bridgeInstanceId: string }>();
  let pubByDevice: JsonWebKey | null = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const path = String(url).replace(/^http:\/\/127\.0\.0\.1:5200/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === "/auth/register") {
      pubByDevice = body.publicKey;
      return new Response(JSON.stringify({ ok: true, sessionToken: "sess-reg", expiresAt: Date.now() + 1000, bridgeInstanceId: "inst-1" }), { status: 200 });
    }
    if (path === "/auth/challenge") {
      opts.challengeCount.n++;
      const challengeId = "chal-" + opts.challengeCount.n;
      const rec = { deviceId: body.deviceId, nonce: "nonce-abc", expiresAt: Date.now() + 60000, bridgeInstanceId: "inst-1" };
      live.set(challengeId, rec);
      return new Response(JSON.stringify({ challengeId, nonce: rec.nonce, expiresAt: rec.expiresAt, bridgeInstanceId: rec.bridgeInstanceId }), { status: 200 });
    }
    if (path === "/auth/verify") {
      const ch = live.get(body.challengeId);
      if (!ch || !pubByDevice) return new Response(JSON.stringify({ error: "challenge_invalid" }), { status: 401 });
      const payload = challengePayload({ deviceId: body.deviceId, challengeId: body.challengeId, nonce: ch.nonce, bridgeInstanceId: ch.bridgeInstanceId, origin: ORIGIN(), expiresAt: ch.expiresAt });
      if (!verifyDeviceSignature(pubByDevice, payload, body.signature)) return new Response(JSON.stringify({ error: "bad_signature" }), { status: 401 });
      if (!issued) return new Response(JSON.stringify({ error: "denied" }), { status: 401 });
      return new Response(JSON.stringify({ ok: true, sessionToken: "sess-reauth", expiresAt: Date.now() + 1000, bridgeInstanceId: "inst-1" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
}

describe("trustedAuth client", () => {
  it("first pair: registers the device (public key only) and stores the session bearer", async () => {
    installFakeBridge({ challengeCount: { n: 0 } });
    const r = await registerDevice("bootstrap-code");
    expect(r.ok).toBe(true);
    expect(getObsidianToken()).toBe("sess-reg");
    // a device identity now exists; the registration sent a PUBLIC key only
    const id = await getDeviceIdentity();
    expect(id?.publicKeyJwk.kty).toBe("EC");
  });

  it("re-auth: challenge-response signature verifies server-side and yields a fresh session", async () => {
    installFakeBridge({ challengeCount: { n: 0 } });
    await registerDevice("bootstrap-code"); // establish the device
    sessionStorage.clear(); // session gone (simulate restart)
    const token = await reauthenticate();
    expect(token).toBe("sess-reauth");
    expect(getObsidianToken()).toBe("sess-reauth");
  });

  it("single-flight: concurrent re-auth triggers exactly ONE challenge", async () => {
    const challengeCount = { n: 0 };
    installFakeBridge({ challengeCount });
    await registerDevice("bootstrap-code");
    sessionStorage.clear();
    const [a, b, c] = await Promise.all([reauthenticate(), reauthenticate(), reauthenticate()]);
    expect(a).toBe("sess-reauth");
    expect(b).toBe("sess-reauth");
    expect(c).toBe("sess-reauth");
    expect(challengeCount.n).toBe(1); // one challenge shared by all waiters
  });

  it("no device → re-auth returns null (manual pairing fallback)", async () => {
    installFakeBridge({ challengeCount: { n: 0 } });
    await forgetDevice();
    expect(await reauthenticate()).toBeNull();
  });

  it("verification denied → re-auth returns null, no session stored", async () => {
    installFakeBridge({ challengeCount: { n: 0 }, issue: false });
    await registerDevice("bootstrap-code");
    sessionStorage.clear();
    expect(await reauthenticate()).toBeNull();
    expect(getObsidianToken()).toBeNull();
  });
});
