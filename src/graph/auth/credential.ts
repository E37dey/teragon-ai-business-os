// TERAGON Business Graph — Phase 11 OPERATOR-AUTH credential verification.
// ---------------------------------------------------------------------------
// Verifies a presented operator secret against a stored VERIFIER (salt + hash)
// using the synchronous, dependency-free SHA-256 (`sha256Hex`) — computing
// `sha256Hex(salt + presentedSecret)` and comparing it to the stored digest in
// CONSTANT TIME. There is NO early exit on the first mismatched character; the
// comparison runs over a fixed digest length so a wrong secret denies with the
// same timing profile as any other denial. The raw secret is NEVER stored,
// logged, audited, or echoed — only the recomputed digest is compared, then
// discarded.
import { sha256Hex } from "@/governance/checksum";
import type { OperatorCredentialVerifier } from "./config";

/**
 * Constant-time string equality. Runs over the MAXIMUM of the two lengths and
 * accumulates a difference bitmask (length mismatch folded in first), so it never
 * short-circuits on the first differing character and reveals nothing about WHERE
 * two digests diverge. Intended for comparing equal-length hex digests.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  // fold the length difference in first so unequal lengths can never be equal,
  // yet the loop still runs a fixed number of iterations.
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i += 1) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/**
 * Verify a presented secret against the stored verifier. Recomputes
 * `sha256Hex(salt + presentedSecret)` and compares it to `verifier.hashHex` in
 * constant time. Returns true ONLY on an exact digest match. The presented secret
 * and the recomputed digest are local and discarded on return — never persisted.
 */
export function verifyOperatorSecret(
  presentedSecret: string,
  verifier: OperatorCredentialVerifier,
): boolean {
  const presentedHashHex = sha256Hex(verifier.salt + presentedSecret);
  return constantTimeEqual(presentedHashHex, verifier.hashHex);
}
