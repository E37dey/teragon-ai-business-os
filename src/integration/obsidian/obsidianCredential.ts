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

/** Remove the local credential (called on disconnect). */
export function clearObsidianToken(): void {
  const s = safeSession();
  if (!s) return;
  try {
    s.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** True when a token is currently paired locally. */
export function hasObsidianToken(): boolean {
  return getObsidianToken() !== null;
}
