// Trusted Device Pairing — bridge-server protocol (register / challenge / verify).
//
// A Node client plays the browser: it generates a REAL ECDSA P-256 key, registers the
// PUBLIC key with the one-time bootstrap token, and — critically — after a simulated
// plugin restart (a fresh bridge instance that shares only the persisted public key)
// re-authenticates purely by signing a challenge, receiving a NEW session bearer with
// NO re-pairing. Plus the security negatives: replay, wrong instance/device/origin,
// revoked, unknown. Backward compatibility (no trustStore) is preserved.
import { afterEach, describe, expect, it } from "vitest";
import { challengePayload, createBridge } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";
import { mockVault } from "../../obsidian-plugin/teragon-vault-bridge/mockVault.mjs";

const ORIGIN = "http://localhost:4173";
const OTHER_ORIGIN = "http://127.0.0.1:4173";
const BOOTSTRAP = "bootstrap-pairing-token-xyz";
const subtle = globalThis.crypto.subtle;

function makeTrustStore() {
  const m = new Map();
  return {
    _m: m,
    list: () => [...m.values()],
    get: (id: string) => m.get(id) ?? null,
    put: (rec: Record<string, unknown>) => m.set(rec.deviceId, rec),
    touch: (id: string, t: number) => {
      const r = m.get(id);
      if (r) r.lastSeenAt = t;
    },
    revoke: (id: string) => {
      const r = m.get(id);
      if (r) r.revoked = true;
    },
  };
}

async function makeDevice() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = await subtle.exportKey("jwk", pair.publicKey);
  delete (publicKey as Record<string, unknown>).key_ops;
  delete (publicKey as Record<string, unknown>).ext;
  const deviceId = "dev-" + Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url");
  const sign = async (payload: string): Promise<string> => {
    const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(payload));
    return Buffer.from(new Uint8Array(sig)).toString("base64url");
  };
  return { deviceId, publicKey, sign };
}

async function startBridge(trustStore: ReturnType<typeof makeTrustStore> | null) {
  const bridge = createBridge({ token: BOOTSTRAP, allowedOrigins: [ORIGIN, OTHER_ORIGIN], vault: mockVault(3), trustStore });
  const addr = await bridge.start(0);
  return { bridge, base: `http://127.0.0.1:${(addr as { port: number }).port}` };
}

function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}, origin = ORIGIN) {
  return fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body: JSON.stringify(body) });
}
function get(base: string, path: string, bearer: string | null, origin = ORIGIN) {
  return fetch(base + path, { headers: { Origin: origin, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) } });
}

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});
async function bridgeWith(ts: ReturnType<typeof makeTrustStore> | null) {
  const b = await startBridge(ts);
  open.push(b.bridge);
  return b;
}

/** Full challenge→sign→verify round against a running bridge; returns the session bearer. */
async function reauth(base: string, dev: Awaited<ReturnType<typeof makeDevice>>, origin = ORIGIN): Promise<Response> {
  const ch = await (await post(base, "/auth/challenge", { deviceId: dev.deviceId }, {}, origin)).json();
  const payload = challengePayload({ deviceId: dev.deviceId, challengeId: ch.challengeId, nonce: ch.nonce, bridgeInstanceId: ch.bridgeInstanceId, origin, expiresAt: ch.expiresAt });
  const signature = await dev.sign(payload);
  return post(base, "/auth/verify", { deviceId: dev.deviceId, challengeId: ch.challengeId, signature }, {}, origin);
}

describe("Trusted Device Pairing — bridge protocol", () => {
  it("registers a device with the bootstrap token and issues a session that authenticates reads", async () => {
    const ts = makeTrustStore();
    const { base } = await bridgeWith(ts);
    const dev = await makeDevice();
    const reg = await post(base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey, label: "Chrome" }, { Authorization: `Bearer ${BOOTSTRAP}` });
    expect(reg.status).toBe(200);
    const body = await reg.json();
    expect(body.sessionToken).toBeTruthy();
    expect(ts.get(dev.deviceId)?.revoked).toBe(false);
    // the issued session authenticates a read
    expect((await get(base, "/connection", body.sessionToken)).status).toBe(200);
    // the trust registry stores PUBLIC info only — never a private key
    expect(JSON.stringify(ts.get(dev.deviceId))).not.toMatch(/"d":/);
  });

  it("register requires the bootstrap token (a session bearer cannot register)", async () => {
    const ts = makeTrustStore();
    const { base } = await bridgeWith(ts);
    const dev = await makeDevice();
    const reg = await post(base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey }, { Authorization: "Bearer not-the-bootstrap" });
    expect(reg.status).toBe(401);
    expect(ts.get(dev.deviceId)).toBeNull();
  });

  it("THE FIX: after a plugin restart, the device re-authenticates by signature with NO re-pairing", async () => {
    const ts = makeTrustStore();
    const dev = await makeDevice();
    // first pair on instance #1
    const b1 = await bridgeWith(ts);
    const s1 = (await (await post(b1.base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` })).json()).sessionToken;
    expect((await get(b1.base, "/connection", s1)).status).toBe(200);

    // simulate restart: a NEW bridge instance sharing ONLY the persisted public key
    const b2 = await bridgeWith(ts);
    // the old session is not valid on the new instance
    expect((await get(b2.base, "/connection", s1)).status).toBe(401);
    // re-auth by challenge/signature only → new session, no bootstrap token used
    const verify = await reauth(b2.base, dev);
    expect(verify.status).toBe(200);
    const s2 = (await verify.json()).sessionToken;
    expect(s2).not.toBe(s1);
    expect((await get(b2.base, "/connection", s2)).status).toBe(200);
  });

  it("a challenge is one-time: replaying the same challengeId fails", async () => {
    const ts = makeTrustStore();
    const dev = await makeDevice();
    const { base } = await bridgeWith(ts);
    await post(base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` });
    const ch = await (await post(base, "/auth/challenge", { deviceId: dev.deviceId })).json();
    const payload = challengePayload({ deviceId: dev.deviceId, challengeId: ch.challengeId, nonce: ch.nonce, bridgeInstanceId: ch.bridgeInstanceId, origin: ORIGIN, expiresAt: ch.expiresAt });
    const signature = await dev.sign(payload);
    expect((await post(base, "/auth/verify", { deviceId: dev.deviceId, challengeId: ch.challengeId, signature })).status).toBe(200);
    // replay the very same challenge+signature
    expect((await post(base, "/auth/verify", { deviceId: dev.deviceId, challengeId: ch.challengeId, signature })).status).toBe(401);
  });

  it("a signature bound to a DIFFERENT bridge instance fails (no cross-runtime replay)", async () => {
    const ts = makeTrustStore();
    const dev = await makeDevice();
    const { base } = await bridgeWith(ts);
    await post(base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` });
    const ch = await (await post(base, "/auth/challenge", { deviceId: dev.deviceId })).json();
    // sign with a forged (different) bridgeInstanceId
    const payload = challengePayload({ deviceId: dev.deviceId, challengeId: ch.challengeId, nonce: ch.nonce, bridgeInstanceId: "00000000-forged", origin: ORIGIN, expiresAt: ch.expiresAt });
    const signature = await dev.sign(payload);
    expect((await post(base, "/auth/verify", { deviceId: dev.deviceId, challengeId: ch.challengeId, signature })).status).toBe(401);
  });

  it("another device cannot sign for a registered device (wrong key)", async () => {
    const ts = makeTrustStore();
    const dev = await makeDevice();
    const attacker = await makeDevice();
    const { base } = await bridgeWith(ts);
    await post(base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` });
    const ch = await (await post(base, "/auth/challenge", { deviceId: dev.deviceId })).json();
    const payload = challengePayload({ deviceId: dev.deviceId, challengeId: ch.challengeId, nonce: ch.nonce, bridgeInstanceId: ch.bridgeInstanceId, origin: ORIGIN, expiresAt: ch.expiresAt });
    const signature = await attacker.sign(payload); // wrong private key
    expect((await post(base, "/auth/verify", { deviceId: dev.deviceId, challengeId: ch.challengeId, signature })).status).toBe(401);
  });

  it("a revoked device is denied re-authentication", async () => {
    const ts = makeTrustStore();
    const dev = await makeDevice();
    const { base } = await bridgeWith(ts);
    await post(base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` });
    ts.revoke(dev.deviceId);
    expect((await post(base, "/auth/challenge", { deviceId: dev.deviceId })).status).toBe(401);
  });

  it("an unknown device gets no challenge", async () => {
    const { base } = await bridgeWith(makeTrustStore());
    expect((await post(base, "/auth/challenge", { deviceId: "dev-does-not-exist-000" })).status).toBe(401);
  });

  it("origin is bound: a challenge from a different allowed origin than registration is rejected", async () => {
    const ts = makeTrustStore();
    const dev = await makeDevice();
    const { base } = await bridgeWith(ts);
    await post(base, "/auth/register", { deviceId: dev.deviceId, publicKey: dev.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` }, ORIGIN);
    // both origins are allowlisted, but the device is bound to ORIGIN
    expect((await post(base, "/auth/challenge", { deviceId: dev.deviceId }, {}, OTHER_ORIGIN)).status).toBe(403);
  });

  it("the pairing token is one-time: a used code cannot enrol a SECOND device (re-pair of the same device is idempotent)", async () => {
    const ts = makeTrustStore();
    const { base } = await bridgeWith(ts);
    const a = await makeDevice();
    const b = await makeDevice();
    expect((await post(base, "/auth/register", { deviceId: a.deviceId, publicKey: a.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` })).status).toBe(200);
    // same code, DIFFERENT device → rejected
    expect((await post(base, "/auth/register", { deviceId: b.deviceId, publicKey: b.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` })).status).toBe(403);
    // same device re-pairs (idempotent) → still allowed
    expect((await post(base, "/auth/register", { deviceId: a.deviceId, publicKey: a.publicKey }, { Authorization: `Bearer ${BOOTSTRAP}` })).status).toBe(200);
    expect(ts.list().length).toBe(1);
  });

  it("backward compatible: without a trustStore the auth endpoints are inert and the fixed token still works", async () => {
    const { base } = await bridgeWith(null);
    expect((await post(base, "/auth/challenge", { deviceId: "x" })).status).toBe(404);
    expect((await get(base, "/connection", BOOTSTRAP)).status).toBe(200);
    expect((await get(base, "/connection", "wrong")).status).toBe(401);
  });
});
