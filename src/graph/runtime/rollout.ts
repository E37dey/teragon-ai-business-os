// TERAGON Business Graph — Phase 10 RUNTIME rollout gate.
// ---------------------------------------------------------------------------
// A SECOND, independent internal gate beyond the Phase-8 facade feature flag.
// Even when the facade flag is ON and a trusted identity resolves, runtime graph
// access ALSO requires an explicit internal-rollout approval. It defaults to
// NOT-APPROVED and, exactly like the two feature flags, is NEVER read from UI,
// an agent, an environment variable, a query string, or any network input — the
// only way to flip it is a direct in-process override argument (tests only).
//
// This exists so that "the facade compiles ON" can never by itself enable graph
// access in production: a human must additionally approve the internal rollout,
// which has not happened. Development mode does NOT approve it.

/** Default (compile-time) state of the runtime rollout: NOT approved. */
export const BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED = false as const;

/**
 * Resolve the effective rollout approval. Tests pass an explicit override to
 * exercise the approved path; production code passes nothing and gets the
 * default NOT-approved constant. There is deliberately no environment /
 * query-string / agent / dev-mode input path — the override is a direct
 * in-process argument only.
 */
export function resolveRolloutApproved(override?: boolean): boolean {
  return override ?? BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED;
}

/** The tiny rollout policy the access policy consults. Pure, side-effect-free. */
export interface BusinessGraphRuntimeRolloutPolicy {
  isApproved(): boolean;
}

/** Build a rollout policy from an optional test override (default NOT approved). */
export function createRolloutPolicy(override?: boolean): BusinessGraphRuntimeRolloutPolicy {
  const approved = resolveRolloutApproved(override);
  return { isApproved: () => approved };
}
