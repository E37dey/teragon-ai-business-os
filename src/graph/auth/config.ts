// TERAGON Business Graph — Phase 11 OPERATOR-AUTH config (injected, pure).
// ---------------------------------------------------------------------------
// Parses the internal-operator auth config from an INJECTED config/env record.
// It follows `src/server/config.ts` EXACTLY: it takes an injected env record,
// NEVER reads `process.env` / `import.meta.env` itself, and NEVER throws at parse
// time. When the config is absent / invalid / incomplete it degrades to an
// UNAVAILABLE posture — `parseOperatorAuthConfig` returns `null`, and the
// authenticator that receives `null` refuses to authenticate. It NEVER invents
// an operator.
//
// CRITICAL: the RAW operator secret is NEVER stored or configured. The config
// carries ONLY a credential VERIFIER — a random salt plus the lowercase-hex
// SHA-256 hash of `salt + rawSecret`, computed OUT OF BAND (offline). The raw
// secret never enters this module, this process, or any at-rest surface.

/**
 * A credential verifier: a random salt + the SHA-256 hash (64 lowercase hex) of
 * `salt + rawSecret`. This is the ONLY credential material ever stored. The raw
 * secret is never present. Verification recomputes the hash from a presented
 * secret and compares in constant time (see `credential.ts`).
 */
export interface OperatorCredentialVerifier {
  readonly salt: string;
  readonly hashHex: string;
}

/**
 * The resolved internal-operator auth config. Present ONLY when every required
 * field parsed cleanly; otherwise `parseOperatorAuthConfig` returns `null`
 * (unavailable). The config holds the verifier, NEVER the raw secret.
 */
export interface OperatorAuthConfig {
  readonly operatorUserId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly verifier: OperatorCredentialVerifier;
  readonly sessionTtlMs: number;
  readonly maxActiveSessions: number;
}

/** Defaults for the OPTIONAL numeric fields (required fields never default). */
export const OPERATOR_AUTH_DEFAULTS = {
  /** 15 minutes — short-lived by default. */
  sessionTtlMs: 15 * 60_000,
  /** a small bound on concurrently-live operator sessions. */
  maxActiveSessions: 8,
} as const;

/** Injected env-record key names (values, never the raw secret, live under these). */
export const OPERATOR_AUTH_ENV_KEYS = {
  userId: "BUSINESS_GRAPH_OPERATOR_USER_ID",
  organizationId: "BUSINESS_GRAPH_OPERATOR_ORG_ID",
  roleId: "BUSINESS_GRAPH_OPERATOR_ROLE_ID",
  credentialSalt: "BUSINESS_GRAPH_OPERATOR_CREDENTIAL_SALT",
  credentialHash: "BUSINESS_GRAPH_OPERATOR_CREDENTIAL_HASH",
  sessionTtlMs: "BUSINESS_GRAPH_OPERATOR_SESSION_TTL_MS",
  maxActiveSessions: "BUSINESS_GRAPH_OPERATOR_MAX_ACTIVE_SESSIONS",
} as const;

/** A 64-char lowercase-hex SHA-256 digest. */
const HEX_SHA256 = /^[0-9a-f]{64}$/;

function trimmedOrNull(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

/** A non-blank id with no internal whitespace (a canonical-shaped identifier). */
function idOrNull(raw: string | undefined): string | null {
  const t = trimmedOrNull(raw);
  if (t === null) return null;
  return /\s/u.test(t) ? null : t;
}

function positiveIntOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Parse the injected record into an operator-auth config, or `null` when it is
 * absent / invalid / incomplete. NEVER throws. Required fields (operator user id,
 * organization id, role id, salt, and a well-formed 64-hex hash) must all be
 * present and valid; any missing or malformed required field degrades the WHOLE
 * config to `null` (unavailable) rather than inventing a partial operator. The
 * optional numeric fields degrade to `OPERATOR_AUTH_DEFAULTS`.
 */
export function parseOperatorAuthConfig(
  env: Readonly<Record<string, string | undefined>>,
): OperatorAuthConfig | null {
  const operatorUserId = idOrNull(env[OPERATOR_AUTH_ENV_KEYS.userId]);
  const organizationId = trimmedOrNull(env[OPERATOR_AUTH_ENV_KEYS.organizationId]);
  const roleId = idOrNull(env[OPERATOR_AUTH_ENV_KEYS.roleId]);
  const salt = trimmedOrNull(env[OPERATOR_AUTH_ENV_KEYS.credentialSalt]);
  const hashRaw = trimmedOrNull(env[OPERATOR_AUTH_ENV_KEYS.credentialHash]);
  const hashHex = hashRaw !== null && HEX_SHA256.test(hashRaw.toLowerCase())
    ? hashRaw.toLowerCase()
    : null;

  // Deny-by-default: any missing / malformed required field ⇒ unavailable.
  if (
    operatorUserId === null ||
    organizationId === null ||
    roleId === null ||
    salt === null ||
    hashHex === null
  ) {
    return null;
  }

  return {
    operatorUserId,
    organizationId,
    roleId,
    verifier: { salt, hashHex },
    sessionTtlMs: positiveIntOr(
      env[OPERATOR_AUTH_ENV_KEYS.sessionTtlMs],
      OPERATOR_AUTH_DEFAULTS.sessionTtlMs,
    ),
    maxActiveSessions: positiveIntOr(
      env[OPERATOR_AUTH_ENV_KEYS.maxActiveSessions],
      OPERATOR_AUTH_DEFAULTS.maxActiveSessions,
    ),
  };
}
