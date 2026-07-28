// TERAGON Business Graph — derivation barrel (Phase 3, PURE derivation only).
// Re-exports the pure, deterministic derivation surface: the five functions,
// the deterministic id builder, the coverage map, and all derivation types.
// No persistence, index, traversal, service, API or UI lives here.
export { deriveGraphNode } from "./node";
export { deriveGraphEdges } from "./edges";
export {
  deriveEntityGraph,
  deriveOrganizationGraphSnapshot,
  validateDerivedGraph,
} from "./graph";
export { buildEdgeId } from "./internal";

export {
  DERIVATION_STATUS,
  DERIVATION_STATUSES,
  DERIVATION_ISSUE_CODES,
} from "./types";
export type {
  DerivationStatus,
  DerivationIssueCode,
  DerivationSeverity,
  GraphDerivationContext,
  GraphDerivationIssue,
  GraphUnmappableRecord,
  GraphDerivationStats,
  GraphDerivationResult,
  GraphDerivationLookup,
  GraphLookupTarget,
  CanonicalRecord,
  DeriveNodeOutcome,
  DeriveEdgesOutcome,
} from "./types";
