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

// --- store (Phase 4 — DERIVED index: persistence + deterministic full rebuild) ---
export {
  GRAPH_INDEX_SCHEMA_VERSION,
  GRAPH_INDEX_DERIVATION_VERSION,
  SUPPORTED_GRAPH_INDEX_SCHEMA_VERSIONS,
  SUPPORTED_GRAPH_REGISTRY_VERSIONS,
  GRAPH_INDEX_BUILD_STATES,
  GRAPH_INDEX_VALIDATION_STATES,
  GRAPH_INDEX_HEALTH_STATES,
  GRAPH_INDEX_CORE_V1_TYPES,
  graphIndexBuildStateSchema,
  graphIndexValidationStateSchema,
  graphIndexIssueCountsSchema,
  graphDerivationIssueSchema,
  graphUnmappableRecordSchema,
  graphIndexSnapshotSchema,
  graphIndexManifestSchema,
  graphIndexRecoveryPointSchema,
  isServingBuildState,
  countIssues,
  GraphIndexError,
  canonicalJSON,
  sha256Hex,
  hashContent,
  computeChecksum,
  computeSourceHash,
  buildSnapshotId,
  GRAPH_INDEX_CHECKSUM_ALGORITHM,
  GRAPH_INDEX_CHECKSUM_VERSION,
  SAFE_NON_INDEXABLE_ACTIVATION_CODES,
  FORBIDDEN_ACTIVATION_CODES,
  buildIndexSnapshot,
  recomputeChecksum,
  recomputeSourceHash,
  validateSnapshot,
  computeHealth,
  DEFAULT_RETENTION_POLICY,
  isKnownGoodCandidate,
  verifyRecoveryCandidate,
  selectRecoveryCandidate,
  recoverOrganizationIndex,
  selectExpiredSnapshotIds,
  rebuildOrganizationGraph,
  IndexedDBGraphIndexStore,
  GRAPH_INDEX_DB_NAME,
  GRAPH_INDEX_DB_VERSION,
  openGraphIndexDb,
  upgradeGraphIndexDb,
  STORE_EVENT_CHECKPOINTS,
  STORE_INDEXING_RUNS,
  STORE_PROCESSED_EVENTS,
  STORE_FAILED_BATCHES,
  STORE_PENDING_EVENTS,
  STORE_INGEST_SEQUENCES,
  STORE_SOURCE_FINGERPRINTS,
} from "./store";
export type {
  GraphIndexBuildState,
  GraphIndexValidationState,
  GraphIndexIssueCounts,
  GraphIndexSnapshot,
  GraphIndexSnapshotHeader,
  GraphIndexManifest,
  GraphIndexBuild,
  GraphIndexBuildOutcome,
  GraphIndexBuildResult,
  GraphIndexValidationIssue,
  GraphIndexValidationResult,
  GraphIndexRecoveryPoint,
  GraphIndexHealthState,
  GraphIndexHealthFinding,
  GraphIndexHealth,
  GraphIndexErrorCode,
  GraphIndexChecksumAlgorithm,
  GraphIndexStore,
  Canonicalizable,
  GraphChecksumInput,
  GraphSourceHashInput,
  SnapshotBuildOptions,
  SnapshotValidationOptions,
  HealthOptions,
  RetentionPolicy,
  RebuildOptions,
  IndexedDBGraphStoreOptions,
} from "./store";

// --- indexing (Phase 5 — event-driven full-rebuild COORDINATION, flag-gated) ---
export {
  BUSINESS_GRAPH_EVENT_INDEXING_ENABLED,
  resolveIndexingEnabled,
  registryEntryForCollection,
  entityTypeForCollection,
  isSupportedCollection,
  organizationFieldForEntityType,
  normalizeChangeEvent,
  GRAPH_INDEXING_OPERATIONS,
  GRAPH_INDEXING_RESULTS,
  DEFAULT_GRAPH_INDEXING_POLICY,
  graphIndexingOperationSchema,
  graphIndexingEventSchema,
  graphPendingEventRowSchema,
  graphIndexingCheckpointSchema,
  graphIndexingRunResultSchema,
  graphIndexingRunSchema,
  graphIndexingFailureSchema,
  graphProcessedEventRowSchema,
  graphIngestSequenceRowSchema,
  graphSourceFingerprintRowSchema,
  MicrotaskIndexingScheduler,
  GraphIndexingStateStore,
  GraphIndexingCoordinator,
} from "./indexing";
export type {
  GraphIndexingFlagConfig,
  GraphIndexingOperation,
  GraphIndexingEvent,
  NormalizedGraphEvent,
  GraphPendingEventRow,
  GraphIndexingBatch,
  GraphIndexingCheckpoint,
  GraphIndexingRunResult,
  GraphIndexingRun,
  GraphIndexingFailure,
  GraphProcessedEventRow,
  GraphIngestSequenceRow,
  GraphSourceFingerprintRow,
  IngestOutcome,
  GraphIndexingPolicy,
  GraphIndexingScheduler,
  GraphIndexingCoordinatorOptions,
  OrganizationRecordsSnapshot,
  LoadOrganizationRecords,
  OrganizationIndexingStatus,
} from "./indexing";

// --- traversal (Phase 6 — READ-ONLY, permission-gated, deterministic queries) ---
export {
  BusinessGraphTraversalService,
  TRAVERSAL_HARD_MAXIMA,
  DEFAULT_TRAVERSAL_QUERY_LIMITS,
  resolveLimits,
  compareEdges,
  comparePaths,
  comparePathSteps,
  compareStrings,
  clearanceMeets,
  isNodeAccessible,
  classifyEdge,
  isEdgePermitted,
  durationBucket,
  protectSearchText,
  deriveQueryId,
  GRAPH_TRAVERSAL_OPERATIONS,
  graphTraversalOperationSchema,
  graphTraversalQueryLimitsInputSchema,
  graphQueryContextScalarsSchema,
  graphTraversalRequestSchema,
} from "./traversal";
export type {
  TraversalStore,
  TraversalServiceOptions,
  NodeAccessOptions,
  EdgeTraversalClass,
  QueryIdInput,
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
} from "./traversal";
