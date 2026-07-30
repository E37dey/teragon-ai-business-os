// TERAGON Business Graph — Phase 11 OPERATOR-AUTH test helpers.
// Deterministic fakes: a mutable clock, a counter RNG (no Math.random), a
// runtime-constructed operator secret + verifier (NO secret literals in source),
// an in-memory active-user lookup, and config/env builders. Every secret is
// generated at runtime so no key-shaped string ever appears in the source.
import { sha256Hex } from "@/governance/checksum";
import {
  OPERATOR_AUTH_ENV_KEYS,
  type ActiveUserLookup,
  type BusinessGraphClock,
  type OperatorAuthConfig,
  type OperatorCredentialVerifier,
  type OperatorRandomSource,
  type RuntimeUserRecord,
} from "@/graph";

export const OPERATOR_USER = "u-operator";
export const OPERATOR_ORG = "org-teragon";
export const OPERATOR_ROLE = "crole-ceo"; // graph-eligible canonical role

// ---------------------------------------------------------------------------
// mutable clock (drives expiry deterministically)
// ---------------------------------------------------------------------------

export interface MutableClock {
  clock: BusinessGraphClock;
  advance(ms: number): void;
  set(ms: number): void;
  nowMs(): number;
}

export function mutableClock(startMs = 1_000): MutableClock {
  let ms = startMs;
  return {
    clock: { nowMs: () => ms, nowIso: () => new Date(ms).toISOString() },
    advance: (d) => void (ms += d),
    set: (v) => void (ms = v),
    nowMs: () => ms,
  };
}

// ---------------------------------------------------------------------------
// deterministic RNG (distinct-per-call; never Math.random)
// ---------------------------------------------------------------------------

export function counterRandom(prefix = "tok"): OperatorRandomSource {
  let n = 0;
  return { nextToken: () => `${prefix}-${(n += 1)}` };
}

/** A counting RNG wrapper that records how many tokens it minted. */
export function countingRandom(prefix = "tok"): { random: OperatorRandomSource; count: () => number } {
  let n = 0;
  return { random: { nextToken: () => `${prefix}-${(n += 1)}` }, count: () => n };
}

// ---------------------------------------------------------------------------
// runtime-generated secrets + verifier (no secret literal ever in source)
// ---------------------------------------------------------------------------

/** A fresh random secret (32 hex chars), generated at runtime — never a literal. */
export function freshSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** A random salt, generated at runtime. */
export function freshSalt(): string {
  return `s-${freshSecret().slice(0, 8)}`;
}

export function verifierFor(secret: string, salt: string): OperatorCredentialVerifier {
  return { salt, hashHex: sha256Hex(salt + secret) };
}

// ---------------------------------------------------------------------------
// config + env builders
// ---------------------------------------------------------------------------

export function configFor(
  secret: string,
  over: Partial<OperatorAuthConfig> = {},
): OperatorAuthConfig {
  return {
    operatorUserId: OPERATOR_USER,
    organizationId: OPERATOR_ORG,
    roleId: OPERATOR_ROLE,
    verifier: verifierFor(secret, freshSalt()),
    sessionTtlMs: 60_000,
    maxActiveSessions: 3,
    ...over,
  };
}

/** A well-formed injected env record whose hash is computed at runtime. */
export function envFor(
  secret: string,
  over: Readonly<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  const salt = freshSalt();
  return {
    [OPERATOR_AUTH_ENV_KEYS.userId]: OPERATOR_USER,
    [OPERATOR_AUTH_ENV_KEYS.organizationId]: OPERATOR_ORG,
    [OPERATOR_AUTH_ENV_KEYS.roleId]: OPERATOR_ROLE,
    [OPERATOR_AUTH_ENV_KEYS.credentialSalt]: salt,
    [OPERATOR_AUTH_ENV_KEYS.credentialHash]: sha256Hex(salt + secret),
    [OPERATOR_AUTH_ENV_KEYS.sessionTtlMs]: "60000",
    [OPERATOR_AUTH_ENV_KEYS.maxActiveSessions]: "3",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// active-user lookup
// ---------------------------------------------------------------------------

export function usersWith(...users: readonly RuntimeUserRecord[]): ActiveUserLookup {
  const byId = new Map(users.map((u) => [u.id, u]));
  return { findUser: (id) => byId.get(id) ?? null };
}

export function activeOperatorUsers(): ActiveUserLookup {
  return usersWith({ id: OPERATOR_USER, status: "פעיל" });
}

/** A store provider factory that must NEVER be called (proves laziness). */
export function forbiddenStoreProviderFactory(): never {
  throw new Error("store provider factory must not be called");
}
