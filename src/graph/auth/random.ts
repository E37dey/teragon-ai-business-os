// TERAGON Business Graph — Phase 11 OPERATOR-AUTH randomness seam.
// ---------------------------------------------------------------------------
// The injected entropy source for minting opaque session tokens. The default
// draws from Web Crypto (`crypto.getRandomValues`) — cryptographically strong,
// ≥256-bit per token — but the seam lets tests inject a DETERMINISTIC generator
// so the session store never reaches for a hidden `Math.random`. A token is a
// fresh random value, NEVER derived from the operator identity, so it is not
// guessable from any known fact about the session.

/** The randomness seam: produce a fresh, opaque, high-entropy token string. */
export interface OperatorRandomSource {
  /** A fresh ≥128-bit opaque token (lowercase hex). Distinct on every call. */
  nextToken(): string;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * The production randomness source: 32 bytes (256-bit) from Web Crypto per token.
 * Uses the global `crypto.getRandomValues` — never a `Math.random` fallback.
 */
export function createWebCryptoRandomSource(): OperatorRandomSource {
  return {
    nextToken: () => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return bytesToHex(bytes);
    },
  };
}
