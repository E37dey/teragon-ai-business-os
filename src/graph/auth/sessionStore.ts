// TERAGON Business Graph — Phase 11 OPERATOR-AUTH session store + issuance.
// ---------------------------------------------------------------------------
// Mints, verifies, expires, and revokes opaque operator session tokens. Every
// security-relevant behaviour is enforced here:
//   • issuance mints an OPAQUE, high-entropy token from the INJECTED RNG — never
//     derived from the operator identity, so it is not guessable;
//   • the RAW token is NEVER stored: the store is keyed by `sha256Hex(token)`, so
//     nothing at rest can reconstruct a live token;
//   • `issuedAtIso` / expiry come from the INJECTED clock (no hidden Date.now);
//   • `maxActiveSessions` is enforced by evicting the OLDEST live session;
//   • `verify` (SYNCHRONOUS) confirms the hashed token exists, is unexpired, and
//     is not revoked — via a constant-time hashed-token lookup — else returns null;
//   • `revoke` drops a session; expiry drops it lazily on the next verify/prune.
// The store touches NO graph store and holds NO module-level state.
import { sha256Hex } from "@/governance/checksum";
import type { ActorRef } from "../contracts/actor";
import type { BusinessGraphClock } from "../application/types";
import { constantTimeEqual } from "./credential";
import type { OperatorRandomSource } from "./random";

/** The operator identity a session is bound to (all HUMAN in Phase 11). */
export interface OperatorSessionIdentity {
  readonly authenticatedUserId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly actorKind: ActorRef["kind"];
}

/** A live (verified) session — the RAW token echoed back, plus its bound identity. */
export interface LiveOperatorSession {
  readonly identity: OperatorSessionIdentity;
  readonly sessionRef: string;
  readonly issuedAtIso: string;
}

/** The AT-REST record — a token HASH, never the raw token. Safe to inspect/serialize. */
export interface OperatorSessionAtRest {
  readonly tokenHash: string;
  readonly identity: OperatorSessionIdentity;
  readonly issuedAtIso: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export interface OperatorSessionStoreOptions {
  clock: BusinessGraphClock;
  random: OperatorRandomSource;
  ttlMs: number;
  maxActiveSessions: number;
}

/** A short, non-reversible handle safe for an audit/log surface (hash prefix). */
export function safeSessionHandle(sessionRef: string): string {
  return sha256Hex(sessionRef).slice(0, 12);
}

export class OperatorSessionStore {
  private readonly clock: BusinessGraphClock;
  private readonly random: OperatorRandomSource;
  private readonly ttlMs: number;
  private readonly maxActiveSessions: number;
  // keyed by sha256Hex(rawToken) — the raw token is never a key or a value here.
  private readonly sessions = new Map<string, OperatorSessionAtRest>();

  constructor(options: OperatorSessionStoreOptions) {
    this.clock = options.clock;
    this.random = options.random;
    this.ttlMs = options.ttlMs;
    this.maxActiveSessions = options.maxActiveSessions;
  }

  /**
   * Mint a new opaque session token bound to `identity`. The token comes from the
   * injected RNG (fresh + high-entropy, never derived from the identity); only its
   * hash is stored. Enforces `maxActiveSessions` by pruning expired sessions then
   * evicting the oldest live one when the bound is reached. Returns the RAW token
   * (the `sessionRef`) to the caller — the ONLY place it ever exists.
   */
  issue(identity: OperatorSessionIdentity): string {
    const nowMs = this.clock.nowMs();
    this.pruneExpired(nowMs);
    if (this.sessions.size >= this.maxActiveSessions) this.evictOldest();

    const sessionRef = this.random.nextToken();
    const tokenHash = sha256Hex(sessionRef);
    const issuedAtIso = this.clock.nowIso();
    this.sessions.set(tokenHash, {
      tokenHash,
      identity,
      issuedAtIso,
      issuedAtMs: nowMs,
      expiresAtMs: nowMs + this.ttlMs,
    });
    return sessionRef;
  }

  /**
   * Verify a presented session ref (SYNCHRONOUS). Hashes the ref, looks the record
   * up by hash (constant-time compare against the stored key), drops it if expired,
   * and returns the live session or `null` (unknown / expired / revoked). Returns
   * the raw ref back inside the live session for downstream `sessionRef` binding.
   */
  verify(sessionRef: string): LiveOperatorSession | null {
    const record = this.lookupByHash(sha256Hex(sessionRef));
    if (record === null) return null;
    if (this.clock.nowMs() >= record.expiresAtMs) {
      this.sessions.delete(record.tokenHash);
      return null;
    }
    return { identity: record.identity, sessionRef, issuedAtIso: record.issuedAtIso };
  }

  /** Revoke a session by its raw ref. Returns true when a live record was dropped. */
  revoke(sessionRef: string): boolean {
    return this.sessions.delete(sha256Hex(sessionRef));
  }

  /** The number of currently-live (unexpired) sessions. Prunes expired first. */
  activeCount(): number {
    this.pruneExpired(this.clock.nowMs());
    return this.sessions.size;
  }

  /**
   * The AT-REST snapshot (token HASHES only, no raw tokens). For tests / audit to
   * prove the raw token never lands at rest. Never used to reconstruct a token.
   */
  atRestSnapshot(): readonly OperatorSessionAtRest[] {
    return [...this.sessions.values()];
  }

  /** Constant-time hashed-token lookup — never leaks WHICH key almost matched. */
  private lookupByHash(tokenHash: string): OperatorSessionAtRest | null {
    let hit: OperatorSessionAtRest | null = null;
    for (const record of this.sessions.values()) {
      if (constantTimeEqual(record.tokenHash, tokenHash)) hit = record;
    }
    return hit;
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, record] of this.sessions) {
      if (nowMs >= record.expiresAtMs) this.sessions.delete(key);
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestMs = Number.POSITIVE_INFINITY;
    for (const [key, record] of this.sessions) {
      if (record.issuedAtMs < oldestMs) {
        oldestMs = record.issuedAtMs;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) this.sessions.delete(oldestKey);
  }
}
