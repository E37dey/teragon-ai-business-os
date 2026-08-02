// TERAGON Business Graph — Phase 11 OPERATOR-AUTH barrel.
// A headless, OFF-by-default, internal-operator authentication foundation that
// produces a REAL `TrustedAuthenticatedSession` for the Phase-10 runtime resolver.
// No UI, no route, no nav, no window global; every flag defaults OFF. Enabling
// auth does NOT enable graph access — the facade/rollout gates stay closed.

// --- feature flag (default OFF) ---
export {
  BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED,
  resolveOperatorAuthEnabled,
  createOperatorAuthPolicy,
} from "./flag";
export type { OperatorAuthPolicy } from "./flag";

// --- injected config (degrade-to-unavailable; verifier only, never the raw secret) ---
export {
  OPERATOR_AUTH_DEFAULTS,
  OPERATOR_AUTH_ENV_KEYS,
  parseOperatorAuthConfig,
} from "./config";
export type { OperatorAuthConfig, OperatorCredentialVerifier } from "./config";

// --- credential verification (constant-time, salted SHA-256) ---
export { constantTimeEqual, verifyOperatorSecret } from "./credential";

// --- randomness seam (injected; default Web Crypto) ---
export { createWebCryptoRandomSource } from "./random";
export type { OperatorRandomSource } from "./random";

// --- session store + issuance (opaque token, hashed at rest, TTL, revoke, bound) ---
export { OperatorSessionStore, safeSessionHandle } from "./sessionStore";
export type {
  OperatorSessionIdentity,
  LiveOperatorSession,
  OperatorSessionAtRest,
  OperatorSessionStoreOptions,
} from "./sessionStore";

// --- authenticator (the only surface that mints a trusted session) ---
export { OperatorAuthenticator, isAuthenticated } from "./authenticator";
export type {
  OperatorAuthDenialReason,
  OperatorAuthResult,
  OperatorAuthenticatorDeps,
} from "./authenticator";

// --- trusted-session source (drop-in for UnavailableTrustedSessionSource) ---
export { OperatorTrustedSessionSource } from "./trustedSessionSource";
export type { OperatorTrustedSessionSourceDeps } from "./trustedSessionSource";

// --- active-user adapter ---
export { createOperatorActiveUserLookup } from "./users";
export type { OperatorUserRecordSource } from "./users";

// --- runtime binding (composes Phase 10; auth ≠ graph access) ---
export { createOperatorRuntimeComposition } from "./composition";
export type {
  OperatorRuntimeComposition,
  OperatorRuntimeCompositionOptions,
} from "./composition";
