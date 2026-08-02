// TERAGON Business Graph — Phase 8 APPLICATION-FACADE feature flag.
// ---------------------------------------------------------------------------
// A single INTERNAL constant that gates the whole read-only business-graph
// application facade. It defaults to FALSE: with the flag off the facade
// composition root builds NOTHING — no query service, no traversal service, no
// store, no IndexedDB open, no subscriptions, no reconciliation — and every
// facade method returns a typed DISABLED result. Existing app behavior is
// entirely unchanged.
//
// This mirrors `indexing/flag.ts` EXACTLY. It is NOT a user- or agent-facing
// setting: it is never read from UI, from an agent, or from network input, and
// there is deliberately no environment / query-string / agent input path. It is
// independent of `BUSINESS_GRAPH_EVENT_INDEXING_ENABLED` (that flag stays OFF on
// its own axis) and of `AI_REMOTE_ENABLED`.

/** Default (compile-time) state of the business-graph application facade: OFF. */
export const BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED = false as const;

/** Resolved facade feature config. `enabled` defaults to the constant above. */
export interface BusinessGraphFacadeFlagConfig {
  enabled: boolean;
}

/**
 * Resolve the effective flag. Tests pass an explicit override to exercise the
 * enabled path; production code passes nothing and gets the default-OFF
 * constant. There is deliberately no environment / query-string / agent input
 * path — the override is a direct in-process argument only.
 */
export function resolveFacadeEnabled(override?: boolean): boolean {
  return override ?? BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED;
}

/**
 * The feature policy the facade consults on EVERY method. It is a tiny object
 * (not a service locator, not a global) built once by the factory from the
 * resolved flag. `isEnabled()` is pure and side-effect-free.
 */
export interface BusinessGraphFeaturePolicy {
  isEnabled(): boolean;
}

/** Build a feature policy from an optional test override (default OFF). */
export function createFeaturePolicy(override?: boolean): BusinessGraphFeaturePolicy {
  const enabled = resolveFacadeEnabled(override);
  return { isEnabled: () => enabled };
}
