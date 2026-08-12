// S14.2 Phase 1 — local pairing credential for the Obsidian Vault Bridge.
//
// WHERE THE TOKEN LIVES: browser `sessionStorage` under a single key, on the
// TERAGON origin only. This is the MINIMUM persistence that survives a page
// refresh within the same tab session. It is NOT written to IndexedDB, NOT to
// localStorage, NOT to the repository, NOT to any URL/query, and NOT logged.
//
// WHEN IT IS CLEARED: automatically when the browser tab/session closes
// (sessionStorage semantics), and explicitly on "נתק" (disconnect) via
// clearObsidianToken(). The bridge token also rotates on every Obsidian plugin
// reload, so a stale token simply fails closed (401) and prompts reconnect.
//
// The token is ephemeral pairing material: treated as write-only from the UI's
// perspective (entered once, read only to build the Authorization header).

const TOKEN_KEY = "teragon.obsidian.pairingToken";
// SEPARATE write-authorization secret. Session-scoped, cleared on disconnect. The
// pairing token grants read/prepare; this key is additionally required to authorize
// (via an HMAC capability) any Vault mutation — so a read-paired caller cannot write.
const WRITE_KEY = "teragon.obsidian.writeKey";

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** Read the paired token (in-memory-only from the caller's view). */
export function getObsidianToken(): string | null {
  const s = safeSession();
  if (!s) return null;
  try {
    const v = s.getItem(TOKEN_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Persist the paired token with minimum persistence (session-scoped). */
export function setObsidianToken(token: string): void {
  const s = safeSession();
  if (!s) return;
  try {
    s.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — pairing simply won't persist across refresh */
  }
}

/** Remove BOTH local credentials (called on disconnect). */
export function clearObsidianToken(): void {
  const s = safeSession();
  if (!s) return;
  try {
    s.removeItem(TOKEN_KEY);
    s.removeItem(WRITE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** True when a token is currently paired locally. */
export function hasObsidianToken(): boolean {
  return getObsidianToken() !== null;
}

/** Read the paired write key (authorizes approved writes; separate from the token). */
export function getObsidianWriteKey(): string | null {
  const s = safeSession();
  if (!s) return null;
  try {
    const v = s.getItem(WRITE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Persist the write key (session-scoped). */
export function setObsidianWriteKey(key: string): void {
  const s = safeSession();
  if (!s) return;
  try {
    s.setItem(WRITE_KEY, key);
  } catch {
    /* storage unavailable */
  }
}

/** Remove only the write key (revoke write authorization, keep the connection). */
export function clearObsidianWriteKey(): void {
  const s = safeSession();
  if (!s) return;
  try {
    s.removeItem(WRITE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** True when a write key is currently paired locally. */
export function hasObsidianWriteKey(): boolean {
  return getObsidianWriteKey() !== null;
}

// ---------------------------------------------------------------------------
// Centralized auth-expiry mechanism.
//
// The Vault Bridge rotates its pairing token on every Obsidian/plugin restart.
// After a restart the browser still holds the OLD token in sessionStorage, so
// the next authenticated request fails closed with a genuine 401. That is an
// AUTH-EXPIRY, distinct from "never paired" and from "bridge unavailable".
//
// This is the single, narrow place that reacts to it: any surface (or the
// bridge client chokepoint) that observes a real 401 calls expireObsidianAuth(),
// which clears the stale credential ONCE and notifies every connection surface
// so they all transition to "reconnect required" together — one behavior,
// everywhere. It intentionally does NOT auto re-pair: recovery requires an
// explicit human pairing with a fresh token.
type AuthExpiryListener = () => void;
const authExpiryListeners = new Set<AuthExpiryListener>();

/** Subscribe to stale-token expiry. Returns an unsubscribe function. */
export function onObsidianAuthExpiry(listener: AuthExpiryListener): () => void {
  authExpiryListeners.add(listener);
  return () => {
    authExpiryListeners.delete(listener);
  };
}

/**
 * A genuine 401 was observed on a credentialed request: the paired token is
 * stale. Clear it (token + write key) and tell every surface to require a fresh
 * reconnect. No-op — and NO broadcast — when nothing was paired, so "not paired"
 * is never mistaken for "expired" and the notification never fires twice.
 */
export function expireObsidianAuth(): void {
  if (!hasObsidianToken()) return;
  clearObsidianToken();
  for (const fn of authExpiryListeners) {
    try {
      fn();
    } catch {
      /* isolate a faulty listener — expiry must still reach the others */
    }
  }
}

// ---------------------------------------------------------------------------
// Trusted-device re-auth handler registry.
//
// The bridge client's 401 chokepoint asks this registry to recover the session
// via trusted-device challenge-response BEFORE falling back to the manual
// reconnect UI. trustedAuth.ts registers its (single-flight) handler on import;
// when unregistered (e.g. bridge-only tests) recovery is a no-op and behavior
// falls back to expiry exactly as before.
type ReauthHandler = () => Promise<string | null>;
let reauthHandler: ReauthHandler | null = null;

/** Register (or clear with null) the trusted-device re-auth handler. */
export function setTrustedReauthHandler(handler: ReauthHandler | null): void {
  reauthHandler = handler;
}

/** Run trusted re-auth if a handler is registered; resolves to a fresh bearer or null. */
export function runTrustedReauth(): Promise<string | null> {
  return reauthHandler ? reauthHandler() : Promise.resolve(null);
}
