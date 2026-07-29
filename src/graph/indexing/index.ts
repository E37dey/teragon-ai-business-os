// TERAGON Business Graph — event-driven indexing barrel (Phase 5).
// The event→full-rebuild COORDINATION layer: a feature-flagged coordinator that
// consumes committed Repository ChangeEvents, normalizes them, orders/dedups/
// coalesces them, and drives at most one COMPLETE org rebuild per change window.
// Default OFF: nothing here runs unless explicitly enabled behind the flag.

// --- feature flag ---
export {
  BUSINESS_GRAPH_EVENT_INDEXING_ENABLED,
  resolveIndexingEnabled,
} from "./flag";
export type { GraphIndexingFlagConfig } from "./flag";

// --- collection → entity-type resolution ---
export {
  registryEntryForCollection,
  entityTypeForCollection,
  isSupportedCollection,
  organizationFieldForEntityType,
} from "./collectionMap";

// --- event adapter ---
export { normalizeChangeEvent } from "./eventAdapter";

// --- contracts + zod schemas ---
export {
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
} from "./types";
export type {
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
  GraphIndexingPolicy,
} from "./types";

// --- scheduler ---
export { MicrotaskIndexingScheduler } from "./scheduler";
export type { GraphIndexingScheduler } from "./scheduler";

// --- durable state store ---
export { GraphIndexingStateStore } from "./stateStore";
export type { IngestOutcome } from "./stateStore";

// --- the coordinator ---
export { GraphIndexingCoordinator } from "./coordinator";
export type {
  GraphIndexingCoordinatorOptions,
  OrganizationRecordsSnapshot,
  LoadOrganizationRecords,
  OrganizationIndexingStatus,
} from "./coordinator";
