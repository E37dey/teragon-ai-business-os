// TERAGON Obsidian — browser trusted-device identity.
//
// The persistent trust credential is an ASYMMETRIC DEVICE IDENTITY, not a bearer:
//  - a NON-EXPORTABLE ECDSA P-256 private CryptoKey (generated extractable:false),
//  - persisted in IndexedDB as a structured-clone CryptoKey object (never serialized
//    to raw/JWK, never logged, never sent to the plugin),
//  - alongside the PUBLIC key JWK (public, safe to share) and a random deviceId.
//
// This is deliberately different from "store the pairing token in IndexedDB": no secret
// bearer is persisted here — only a private key the browser can USE but never EXPORT,
// plus public material. A plugin restart is survived by proving possession of this key
// (challenge-response), never by replaying a stored bearer.

const DB_NAME = "teragon-obsidian-trust";
const DB_VERSION = 1;
const STORE = "device";
const RECORD_KEY = "identity";

export interface DeviceIdentityPublic {
  readonly deviceId: string;
  readonly publicKeyJwk: JsonWebKey;
}
interface DeviceRecord extends DeviceIdentityPublic {
  readonly privateKey: CryptoKey; // non-exportable; structured-cloned into IndexedDB
}

function webcrypto(): SubtleCrypto | null {
  try {
    return typeof globalThis.crypto?.subtle !== "undefined" ? globalThis.crypto.subtle : null;
  } catch {
    return null;
  }
}
function idbFactory(): IDBFactory | null {
  try {
    return typeof indexedDB !== "undefined" ? indexedDB : null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  const factory = idbFactory();
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    let request: IDBRequest<T>;
    try {
      const t = db.transaction(STORE, mode);
      request = run(t.objectStore(STORE));
    } catch {
      resolve(null);
      return;
    }
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

async function readRecord(): Promise<DeviceRecord | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const rec = await tx<DeviceRecord>(db, "readonly", (s) => s.get(RECORD_KEY) as IDBRequest<DeviceRecord>);
    if (!rec || typeof rec.deviceId !== "string" || !rec.privateKey) return null;
    return rec;
  } finally {
    db.close();
  }
}

function randomDeviceId(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  // URL-safe, no padding — a stable opaque id, NOT a secret.
  return "dev-" + btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The public identity (deviceId + public JWK) if this browser is already a device, else null. */
export async function getDeviceIdentity(): Promise<DeviceIdentityPublic | null> {
  const rec = await readRecord();
  return rec ? { deviceId: rec.deviceId, publicKeyJwk: rec.publicKeyJwk } : null;
}

export async function hasDeviceIdentity(): Promise<boolean> {
  return (await readRecord()) !== null;
}

/**
 * Return this browser's device identity, generating + persisting a NEW non-exportable
 * ECDSA P-256 key pair on first use. The private key never leaves IndexedDB as a value —
 * it is stored as a live non-exportable CryptoKey.
 */
export async function ensureDeviceIdentity(): Promise<DeviceIdentityPublic | null> {
  const existing = await readRecord();
  if (existing) return { deviceId: existing.deviceId, publicKeyJwk: existing.publicKeyJwk };
  const subtle = webcrypto();
  const db = await openDb();
  if (!subtle || !db) return null;
  try {
    // extractable:false → the PRIVATE key can never be exported; the PUBLIC key of an
    // asymmetric pair remains exportable regardless (WebCrypto spec), so we can register it.
    const pair = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const publicKeyJwk = await subtle.exportKey("jwk", pair.publicKey);
    delete (publicKeyJwk as Record<string, unknown>).key_ops;
    delete (publicKeyJwk as Record<string, unknown>).ext;
    const deviceId = randomDeviceId();
    const record: DeviceRecord = { deviceId, publicKeyJwk, privateKey: pair.privateKey };
    const ok = await tx(db, "readwrite", (s) => s.put(record, RECORD_KEY) as IDBRequest<IDBValidKey>);
    if (ok === null) return null;
    return { deviceId, publicKeyJwk };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** Sign a canonical challenge payload with the non-exportable private key. Null if no device. */
export async function signChallenge(payload: string): Promise<string | null> {
  const subtle = webcrypto();
  const rec = await readRecord();
  if (!subtle || !rec) return null;
  try {
    const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, rec.privateKey, new TextEncoder().encode(payload));
    // base64url, no padding — matches the plugin's base64url signature decoding.
    let bin = "";
    const bytes = new Uint8Array(sig);
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return null;
  }
}

/** Forget this device: delete the private key + identity from IndexedDB (irreversible). */
export async function forgetDevice(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, "readwrite", (s) => s.delete(RECORD_KEY) as IDBRequest<undefined>);
  } finally {
    db.close();
  }
}
