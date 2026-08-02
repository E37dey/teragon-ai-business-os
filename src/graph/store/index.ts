// TERAGON Business Graph — index-store barrel (Phase 4).
// The DERIVED, read-only, rebuildable graph index: contracts, deterministic
// hashing, snapshot assembly, atomic full rebuild, validation, health, recovery,
// and the Local-Demo IndexedDB adapter. Nothing here is the canonical source of
// truth — the index is replaceable and always rebuildable from product modules.

// --- contracts ---
export {
  GRAPH_INDEX_SCHEMA_VERSION,
  GRAPH_INDEX_DERIVATION_VERSION,
  GRAPH_INDEX_CHECKSUM_ALGORITHM,
  GRAPH_INDEX_CHECKSUM_VERSION,
  SAFE_NON_INDEXABLE_ACTIVATION_CODES,
  FORBIDDEN_ACTIVATION_CODES,
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
} from "./contracts";
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
} from "./contracts";

// --- deterministic hashing ---
export {
  canonicalJSON,
  sha256Hex,
  hashContent,
  computeChecksum,
  computeSourceHash,
  buildSnapshotId,
} from "./hash";
export type { Canonicalizable, GraphChecksumInput, GraphSourceHashInput } from "./hash";

// --- snapshot assembly ---
export {
  buildIndexSnapshot,
  recomputeChecksum,
  recomputeSourceHash,
} from "./snapshot";
export type { SnapshotBuildOptions } from "./snapshot";

// --- validation ---
export { validateSnapshot } from "./validation";
export type { SnapshotValidationOptions } from "./validation";

// --- health ---
export { computeHealth } from "./health";
export type { HealthOptions } from "./health";

// --- recovery + retention ---
export {
  DEFAULT_RETENTION_POLICY,
  isKnownGoodCandidate,
  verifyRecoveryCandidate,
  selectRecoveryCandidate,
  recoverOrganizationIndex,
  selectExpiredSnapshotIds,
} from "./recovery";
export type { RetentionPolicy } from "./recovery";

// --- atomic full rebuild ---
export { rebuildOrganizationGraph } from "./rebuild";
export type { RebuildOptions } from "./rebuild";

// --- Local-Demo IndexedDB adapter ---
export {
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
} from "./indexeddbStore";
export type { IndexedDBGraphStoreOptions } from "./indexeddbStore";
