// TERAGON Business Graph — event-driven indexing feature flag (Phase 5).
// ---------------------------------------------------------------------------
// A single INTERNAL constant that gates the whole event-driven rebuild
// coordinator. It defaults to FALSE: with the flag off the coordinator registers
// NO repository subscriptions, runs NO background rebuild, and the product
// runtime is entirely unchanged. The manual Phase-4 `rebuildOrganizationGraph`
// remains available to tests and internal code regardless of this flag.
//
// This is NOT a user- or agent-facing setting. It is not read from UI, from an
// agent, or from network input. It is unrelated to `AI_REMOTE_ENABLED` (which
// stays false on its own axis).

/** Default (compile-time) state of the event-driven indexer: OFF. */
export const BUSINESS_GRAPH_EVENT_INDEXING_ENABLED = false as const;

/** Resolved indexing config. `enabled` defaults to the constant above. */
export interface GraphIndexingFlagConfig {
  enabled: boolean;
}

/**
 * Resolve the effective flag. Tests pass an explicit override to exercise the
 * enabled path; production code passes nothing and gets the default-OFF constant.
 * There is deliberately no environment / query-string / agent input path.
 */
export function resolveIndexingEnabled(override?: boolean): boolean {
  return override ?? BUSINESS_GRAPH_EVENT_INDEXING_ENABLED;
}
