// TERAGON Business Graph — public contract barrel (Phase 2).
// Re-exports the DERIVED, READ-ONLY contract layer: stable identity, node/edge
// envelopes, reference-safety, security contracts, and the entity/edge/spine
// registries. No storage, indexing, traversal, service, API or UI lives here.

// --- identity ---
export {
  GRAPH_ENTITY_TYPES,
  graphEntityTypeSchema,
  isGraphEntityType,
  toGraphEdgeId,
  isArrayPositionId,
  classifyOrganization,
  graphIsoDateSchema,
  graphEntityRefSchema,
  graphNodeIdSchema,
  buildNodeId,
  parseNodeId,
  GraphIdentityError,
} from "./contracts/identity";
export type {
  GraphEntityType,
  GraphNodeId,
  GraphEdgeId,
  GraphEntityRef,
  GraphIdentityErrorCode,
  OrgClassification,
  OrgUnmappableReason,
} from "./contracts/identity";

// --- node ---
export {
  GRAPH_SENSITIVITIES,
  GRAPH_HIDDEN_SENSITIVITIES,
  graphSensitivitySchema,
  businessGraphNodeSchema,
  protectedPayloadReferenceSchema,
} from "./contracts/node";
export type {
  GraphSensitivity,
  GraphMetadataValue,
  BusinessGraphNode,
  ProtectedPayloadReference,
} from "./contracts/node";

// --- edge ---
export {
  GRAPH_RELATIONSHIP_TYPES,
  graphRelationshipTypeSchema,
  GRAPH_PROVENANCES,
  graphProvenanceSchema,
  GRAPH_AUTHORITIES,
  graphAuthoritySchema,
  GRAPH_EDGE_STALE_STATES,
  graphEdgeStaleStateSchema,
  GRAPH_EDGE_DIRECTIONS,
  graphEdgeDirectionSchema,
  GRAPH_EDGE_APPROVAL_STATES,
  graphEdgeApprovalStateSchema,
  edgeIsAuthoritative,
  businessGraphEdgeSchema,
} from "./contracts/edge";
export type {
  GraphRelationshipType,
  GraphProvenance,
  GraphAuthority,
  GraphEdgeStaleState,
  GraphEdgeDirection,
  GraphEdgeApprovalState,
  BusinessGraphEdge,
} from "./contracts/edge";

// --- edge-authority policy (centralized) ---
export { resolveEdgeAuthority } from "./contracts/authority";
export type { EdgeAuthorityInput, EdgeAuthorityDecision } from "./contracts/authority";

// --- actor ---
export { actorRefSchema } from "./contracts/actor";
export type { ActorRef } from "./contracts/actor";

// --- references ---
export {
  LEGACY_REFERENCE_KINDS,
  legacyReferenceKindSchema,
  REFERENCE_RESOLUTION_STATUSES,
  referenceResolutionStatusSchema,
  referenceResolutionSchema,
  parseKindIdRef,
  classifyReference,
  referenceMayBeAuthoritative,
} from "./contracts/references";
export type {
  LegacyReferenceKind,
  ReferenceResolutionStatus,
  ReferenceResolution,
  ParsedKindIdRef,
  ClassifyReferenceInput,
} from "./contracts/references";

// --- security ---
export {
  GraphSecurityError,
  graphViewerContextSchema,
  graphPermissionDecisionSchema,
  denyByDefault,
  mayRevealBody,
  DEFAULT_GRAPH_SENSITIVITY_POLICY,
  DEFAULT_GRAPH_TRAVERSAL_LIMITS,
  graphTraversalLimitsSchema,
  graphAuditContextSchema,
  assertHumanApprover,
} from "./contracts/security";
export type {
  GraphSecurityErrorCode,
  GraphViewerContext,
  GraphPermissionDecision,
  GraphSensitivityPolicy,
  GraphTraversalLimits,
  GraphAuditContext,
  HumanApproverEligibility,
  HumanApproverContext,
} from "./contracts/security";

// --- registries ---
export {
  ENTITY_REGISTRY,
  ENTITY_REGISTRY_ENTRIES,
  entityRegistryEntrySchema,
  assertEntityRegistryExhaustive,
} from "./registry/entityRegistry";
export type {
  EntityRegistryEntry,
  SensitivityStrategy,
  AuthoritativeStrategy,
  PayloadExposure,
} from "./registry/entityRegistry";

export {
  EDGE_REGISTRY,
  EDGE_CARDINALITIES,
  edgeCardinalitySchema,
  edgeRegistryEntrySchema,
} from "./registry/edgeRegistry";
export type { EdgeRegistryEntry, EdgeCardinality } from "./registry/edgeRegistry";

export { CORE_V1_ENTITY_SPINE, CORE_V1_PRIORITY_RELATIONSHIPS } from "./registry/coreV1Spine";

// --- derivation (Phase 3 — PURE, deterministic derivation functions) ---
export {
  deriveGraphNode,
  deriveGraphEdges,
  deriveEntityGraph,
  deriveOrganizationGraphSnapshot,
  validateDerivedGraph,
  buildEdgeId,
  DERIVATION_STATUS,
  DERIVATION_STATUSES,
  DERIVATION_ISSUE_CODES,
} from "./derivation";
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
} from "./derivation";
