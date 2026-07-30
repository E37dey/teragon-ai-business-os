// TERAGON Business Graph — traversal barrel (Phase 6).
// The READ-ONLY, permission-gated, deterministic graph traversal layer:
// deny-by-default per-hop security, bounded/cycle-safe traversal, authoritative-
// only-by-default edges, and a safe query-audit record. Nothing here mutates a
// snapshot, is exposed through product UI/HTTP/agents, or is wired into runtime.

// --- service ---
export {
  BusinessGraphTraversalService,
} from "./service";
export type { TraversalStore, TraversalServiceOptions } from "./service";

// --- limits ---
export {
  TRAVERSAL_HARD_MAXIMA,
  DEFAULT_TRAVERSAL_QUERY_LIMITS,
  resolveLimits,
} from "./limits";

// --- ordering ---
export { compareEdges, comparePaths, comparePathSteps, compareStrings } from "./ordering";

// --- security ---
export {
  clearanceMeets,
  isNodeAccessible,
  classifyEdge,
  isEdgePermitted,
  isEdgeAccessible,
  relationshipRequiresApproval,
  APPROVAL_REQUIRED_RELATIONSHIPS,
} from "./security";
export type { NodeAccessOptions, EdgeTraversalClass, EdgeAccessOptions } from "./security";

// --- audit ---
export {
  durationBucket,
  protectSearchText,
  deriveRequestFingerprint,
  newExecutionId,
} from "./audit";
export type { RequestFingerprintInput } from "./audit";

// --- types ---
export {
  GRAPH_TRAVERSAL_OPERATIONS,
  graphTraversalOperationSchema,
  graphTraversalQueryLimitsInputSchema,
  graphQueryContextScalarsSchema,
  graphTraversalRequestSchema,
} from "./types";
export type {
  GraphTraversalOperation,
  GraphTraversalQueryLimits,
  GraphTraversalQueryLimitsInput,
  GraphTruncationState,
  GraphPathStep,
  GraphPath,
  GraphNeighborView,
  GraphNeighborResult,
  GraphEvidenceItem,
  GraphEvidenceResult,
  GraphImpactKind,
  GraphImpactedNode,
  GraphImpactResult,
  GraphConflictKind,
  GraphConflict,
  GraphConflictResult,
  GraphTimelineEventKind,
  GraphTimelineEvent,
  GraphTimelineResult,
  GraphSearchHit,
  GraphSearchResult,
  GraphTraversalData,
  GraphQueryFilters,
  GraphQueryResultCounts,
  GraphQueryAuditRecord,
  GraphPermissionOracle,
  GraphQueryContext,
  GraphTraversalRequest,
  GraphTraversalResult,
} from "./types";
