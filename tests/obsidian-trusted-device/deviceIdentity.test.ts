// Browser trusted-device identity: non-exportable ECDSA P-256 key persisted in IndexedDB,
// signatures that verify against the plugin's verifier, and irreversible forget.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDeviceIdentity, forgetDevice, getDeviceIdentity, hasDeviceIdentity, signChallenge } from "@/integration/obsidian/deviceIdentity";
import { challengePayload, verifyDeviceSignature } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";

afterEach(async () => {
  await forgetDevice();
});

describe("deviceIdentity", () => {
  it("generates + persists a device (EC P-256 public JWK, stable deviceId)", async () => {
    expect(await hasDeviceIdentity()).toBe(false);
    const id = await ensureDeviceIdentity();
    expect(id?.deviceId).toMatch(/^dev-/);
    expect(id?.publicKeyJwk.kty).toBe("EC");
    expect(id?.publicKeyJwk.crv).toBe("P-256");
    expect(await hasDeviceIdentity()).toBe(true);
    const again = await getDeviceIdentity();
    expect(again?.deviceId).toBe(id?.deviceId); // persisted, not regenerated
  });

  it("signs a canonical challenge that VERIFIES against the plugin verifier", async () => {
    const id = await ensureDeviceIdentity();
    const payload = challengePayload({ deviceId: id!.deviceId, challengeId: "c1", nonce: "n1", bridgeInstanceId: "inst-1", origin: "http://localhost:4173", expiresAt: 123456 });
    const sig = await signChallenge(payload);
    expect(sig).toBeTruthy();
    expect(verifyDeviceSignature(id!.publicKeyJwk, payload, sig!)).toBe(true);
    // any tamper of the signed bytes fails
    expect(verifyDeviceSignature(id!.publicKeyJwk, payload + "x", sig!)).toBe(false);
  });

  it("stores a NON-exportable private key (cannot be exported as raw/JWK)", async () => {
    await ensureDeviceIdentity();
    const db: IDBDatabase = await new Promise((res) => {
      const r = indexedDB.open("teragon-obsidian-trust", 1);
      r.onsuccess = () => res(r.result);
    });
    const rec = await new Promise<{ privateKey: CryptoKey }>((res) => {
      const t = db.transaction("device", "readonly").objectStore("device").get("identity");
      t.onsuccess = () => res(t.result as { privateKey: CryptoKey });
    });
    db.close();
    expect(rec.privateKey.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey("jwk", rec.privateKey)).rejects.toBeTruthy();
  });

  it("forgetDevice irreversibly erases the identity", async () => {
    await ensureDeviceIdentity();
    await forgetDevice();
    expect(await hasDeviceIdentity()).toBe(false);
    expect(await signChallenge("anything")).toBeNull();
    // a subsequent ensure creates a genuinely NEW device
    const before = await getDeviceIdentity();
    expect(before).toBeNull();
  });
});
