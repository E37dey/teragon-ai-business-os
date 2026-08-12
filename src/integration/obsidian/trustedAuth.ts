// TERAGON Obsidian — trusted-device authentication client.
//
// Bootstraps device trust with the one-time pairing token, then re-authenticates
// automatically after a plugin restart via challenge-response — never by replaying a
// stored bearer. The only persistent credential is the non-exportable device key
// (deviceIdentity.ts); the bridge SESSION bearer is short-lived and held in
// sessionStorage only. This grants bridge authentication ONLY — never write authority.
import { ensureDeviceIdentity, getDeviceIdentity, signChallenge } from "./deviceIdentity";
import { getObsidianToken, setObsidianToken, setTrustedReauthHandler } from "./obsidianCredential";
import { OBSIDIAN_BRIDGE_URL } from "./vaultBridgeClient";

// MUST match the plugin's TDP_VERSION + challengePayload() byte-for-byte.
const TDP_VERSION = "tdp-1";
const AUTH_TIMEOUT_MS = 4000;

function currentOrigin(): string {
  try {
    return typeof window !== "undefined" && window.location ? window.location.origin : "";
  } catch {
    return "";
  }
}

/** Canonical challenge payload — identical join order/format to the plugin. */
function challengePayload(deviceId: string, challengeId: string, nonce: string, bridgeInstanceId: string, origin: string, expiresAt: number): string {
  return [TDP_VERSION, deviceId, challengeId, nonce, bridgeInstanceId, origin, String(expiresAt)].join("\n");
}

async function postJson(path: string, body: unknown, bearer?: string): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const res = await fetch(OBSIDIAN_BRIDGE_URL + path, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
    });
    let json: Record<string, unknown> | null = null;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

export type TrustAuthCode = "ok" | "no_device" | "unavailable" | "denied" | "error";
export interface TrustAuthResult {
  readonly ok: boolean;
  readonly code: TrustAuthCode;
}

/**
 * FIRST PAIR: register THIS browser as a trusted device using the one-time pairing token.
 * Generates the device key if needed, registers only the PUBLIC key, and stores the issued
 * short-lived session bearer. The pairing token is used once here and is not persisted.
 */
export async function registerDevice(bootstrapToken: string, label?: string): Promise<TrustAuthResult> {
  const identity = await ensureDeviceIdentity();
  if (!identity) return { ok: false, code: "error" };
  const { status, json } = await postJson("/auth/register", { deviceId: identity.deviceId, publicKey: identity.publicKeyJwk, label: label ?? "TERAGON browser" }, bootstrapToken);
  if (status === 200 && json && typeof json.sessionToken === "string") {
    setObsidianToken(json.sessionToken);
    return { ok: true, code: "ok" };
  }
  if (status === 0) return { ok: false, code: "unavailable" };
  if (status === 401 || status === 403) return { ok: false, code: "denied" };
  return { ok: false, code: "error" };
}

// Single-flight guard: concurrent 401s trigger exactly ONE challenge-response, and all
// waiters reuse its result (no challenge storm).
let inFlight: Promise<string | null> | null = null;

async function performReauth(): Promise<string | null> {
  const identity = await getDeviceIdentity();
  if (!identity) return null; // not a trusted device → manual pairing fallback
  const origin = currentOrigin();
  const ch = await postJson("/auth/challenge", { deviceId: identity.deviceId });
  if (ch.status !== 200 || !ch.json || typeof ch.json.challengeId !== "string" || typeof ch.json.nonce !== "string" || typeof ch.json.bridgeInstanceId !== "string" || typeof ch.json.expiresAt !== "number") {
    return null;
  }
  const payload = challengePayload(identity.deviceId, ch.json.challengeId, ch.json.nonce, ch.json.bridgeInstanceId, origin, ch.json.expiresAt);
  const signature = await signChallenge(payload);
  if (!signature) return null;
  const vr = await postJson("/auth/verify", { deviceId: identity.deviceId, challengeId: ch.json.challengeId, signature });
  if (vr.status === 200 && vr.json && typeof vr.json.sessionToken === "string") {
    setObsidianToken(vr.json.sessionToken);
    return vr.json.sessionToken;
  }
  return null;
}

/**
 * Automatic trusted-device re-authentication (single-flight). Returns a fresh session
 * bearer on success, or null if this browser is not trusted / the bridge is unavailable /
 * verification is denied. Never throws.
 */
export function reauthenticate(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = performReauth().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** True when this browser currently holds a bridge session bearer. */
export function hasSession(): boolean {
  return getObsidianToken() !== null;
}

// Register trusted re-auth as the bridge client's central 401-recovery handler. Importing
// this module (the app does, via useObsidianVault) wires automatic re-auth everywhere the
// chokepoint runs — Memory, Knowledge Graph, Agent reads, workflows, packs — one path.
setTrustedReauthHandler(reauthenticate);
