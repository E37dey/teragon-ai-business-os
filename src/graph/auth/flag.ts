// TERAGON Business Graph — Phase 11 OPERATOR-AUTH feature flag.
// ---------------------------------------------------------------------------
// A single INTERNAL constant that gates the whole headless internal-operator
// authentication boundary. It defaults to FALSE: with the flag off the
// authenticator issues NOTHING and the operator trusted-session source behaves
// exactly like `UnavailableTrustedSessionSource` (every lookup returns null), so
// the Phase-10 runtime stays IDENTITY_UNAVAILABLE and graph access is closed.
//
// This mirrors `indexing/flag.ts` and `application/flag.ts` EXACTLY. It is NOT a
// user-, agent-, or network-facing setting: it is never read from UI, from an
// agent, from an environment variable, or from network input, and there is
// deliberately no environment / query-string / agent input path — the override
// is a direct in-process argument only. It is independent of every other flag
// (facade, indexing, rollout, AI_REMOTE_ENABLED) — enabling operator auth does
// NOT enable graph access.

/** Default (compile-time) state of the internal-operator auth boundary: OFF. */
export const BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED = false as const;

/**
 * Resolve the effective flag. Tests pass an explicit override to exercise the
 * enabled path; production code passes nothing and gets the default-OFF
 * constant. There is deliberately no environment / query-string / agent input
 * path — the override is a direct in-process argument only.
 */
export function resolveOperatorAuthEnabled(override?: boolean): boolean {
  return override ?? BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED;
}

/**
 * The tiny auth policy the authenticator and the trusted-session source consult.
 * A plain object (not a service locator, not a global) built once from the
 * resolved flag. `isEnabled()` is pure and side-effect-free.
 */
export interface OperatorAuthPolicy {
  isEnabled(): boolean;
}

/** Build an operator-auth policy from an optional test override (default OFF). */
export function createOperatorAuthPolicy(override?: boolean): OperatorAuthPolicy {
  const enabled = resolveOperatorAuthEnabled(override);
  return { isEnabled: () => enabled };
}
