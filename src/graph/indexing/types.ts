// TERAGON Business Graph — event-driven indexing contracts (Phase 5).
// ---------------------------------------------------------------------------
// The vocabulary for the event→full-rebuild COORDINATION layer. A canonical
// mutation (observed via `Repository.subscribe`) is normalized into a
// `GraphIndexingEvent` — a compact rebuild SIGNAL + audit reference that carries
// NO entity body, notes, prompts, secrets, or protected content. Events are
// ordered, deduplicated, coalesced into a `GraphIndexingBatch`, and drive at most
// one full org rebuild. Checkpoints/runs/failures are SAFE metadata only.
//
// Zod schemas are provided for every value that crosses the persistence boundary
// (pending queue, checkpoints, runs, processed-event ledger, failed batches).
import { z } from "zod";
import { graphEntityTypeSchema, type GraphEntityType } from "../contracts/identity";

// ---------------------------------------------------------------------------
// operation vocabulary
// ---------------------------------------------------------------------------

/**
 * The normalized operation. `ChangeEvent.type` (create/update/remove) is mapped
 * directly; ARCHIVE/RESTORE/APPROVE/REJECT/SUPERSEDE are INFERRED from item field
 * values (archivedAt, approvalState, supersedesId). Because a full rebuild is the
 * authority, the operation is only a signal — an imprecise inference never changes
 * the rebuilt graph, it only labels the audit trail.
 */
export const GRAPH_INDEXING_OPERATIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "ARCHIVE",
  "RESTORE",
  "APPROVE",
  "REJECT",
  "SUPERSEDE",
  "UNSUPPORTED",
] as const;
export type GraphIndexingOperation = (typeof GRAPH_INDEXING_OPERATIONS)[number];
export const graphIndexingOperationSchema = z.enum(GRAPH_INDEXING_OPERATIONS);

// ---------------------------------------------------------------------------
// normalized event
// ---------------------------------------------------------------------------

/**
 * A normalized mutation signal. NEVER contains an entity body.
 *
 * DELIVERY MODEL (why identity is a durable sequence, not the source tuple):
 * `Repository.subscribe` is best-effort in-process notification, NOT a durable
 * transactional outbox — an event can be lost between the canonical commit and
 * this queue's durable write. So the DURABLE identity is a per-organization
 * monotonic ingest sequence allocated in IndexedDB at ingest time — always unique,
 * never derived from wall-clock or entity display values. The SOURCE tuple
 * (`sourceFingerprint`) is kept ONLY for duplicate-source-event detection (a
 * re-delivered VERSIONED source event) and for ordering — never as the identity.
 */
export interface GraphIndexingEvent {
  /** durable identity `gidxevt:{organizationId}:{ingestSequence}` — always unique */
  eventId: string;
  /** durable per-org monotonic order (allocated in IndexedDB; never wall-clock) */
  ingestSequence: number;
  /**
   * Safe source fingerprint `${collection}:${id}:${aggregateVersion}:${operation}`
   * for duplicate-source-event detection — present ONLY when `aggregateVersion` is
   * non-null (a versionless update is never fingerprint-deduped). NO entity body,
   * NO display values. Null when versionless / unsupported.
   */
  sourceFingerprint: string | null;
  /** derived org, or null when the record has no resolvable organization */
  organizationId: string | null;
  /** collection → GraphEntityType, or null for an unsupported collection */
  aggregateType: GraphEntityType | null;
  /** the record id, or null (e.g. a `clear` event) */
  aggregateId: string | null;
  operation: GraphIndexingOperation;
  /** the item's version field where present, else null */
  aggregateVersion: number | null;
  /** item.updatedAt where present, else null (metadata only) */
  occurredAt: string | null;
  /** the source collection key */
  sourceRepository: string;
  /** none available on this channel */
  transactionId: null;
  /** none available on this channel */
  correlationId: null;
  /** ChangeEvent carries no diff — always empty */
  changedFields: readonly string[];
  /** the record's approval-state literal where relevant, else null */
  approvalState: string | null;
  /** false when the collection is unknown or the event is otherwise not indexable */
  supported: boolean;
  /** why the org is null / event unsupported (safe reason code), else null */
  unmappableReason: string | null;
}

/**
 * The adapter output before durable ingest. The adapter is PURE and has no access
 * to the durable sequence, so it assigns NEITHER `eventId` NOR `ingestSequence` —
 * both are allocated atomically in IndexedDB by the state store on ingest.
 */
export type NormalizedGraphEvent = Omit<GraphIndexingEvent, "ingestSequence" | "eventId">;

export const graphIndexingEventSchema = z.object({
  eventId: z.string().min(1),
  ingestSequence: z.number().int().min(0),
  sourceFingerprint: z.string().min(1).nullable(),
  organizationId: z.string().min(1).nullable(),
  aggregateType: graphEntityTypeSchema.nullable(),
  aggregateId: z.string().min(1).nullable(),
  operation: graphIndexingOperationSchema,
  aggregateVersion: z.number().int().nullable(),
  occurredAt: z.string().nullable(),
  sourceRepository: z.string().min(1),
  transactionId: z.null(),
  correlationId: z.null(),
  changedFields: z.array(z.string()).readonly(),
  approvalState: z.string().nullable(),
  supported: z.boolean(),
  unmappableReason: z.string().nullable(),
}) satisfies z.ZodType<GraphIndexingEvent>;

// ---------------------------------------------------------------------------
// pending-queue row (durable replay substrate)
// ---------------------------------------------------------------------------

export interface GraphPendingEventRow {
  /** `${organizationId}∅${paddedIngestSequence}` */
  key: string;
  organizationId: string;
  ingestSequence: number;
  event: GraphIndexingEvent;
}

export const graphPendingEventRowSchema = z.object({
  key: z.string().min(1),
  organizationId: z.string().min(1),
  ingestSequence: z.number().int().min(0),
  event: graphIndexingEventSchema,
}) satisfies z.ZodType<GraphPendingEventRow>;

// ---------------------------------------------------------------------------
// batch (a coalesced set of events → ONE rebuild)
// ---------------------------------------------------------------------------

export interface GraphIndexingBatch {
  batchId: string;
  organizationId: string;
  /** the ordered, de-duplicated events folded into this batch */
  events: GraphIndexingEvent[];
  /** dedup keys included in this batch */
  eventIds: string[];
  /** lowest ingest sequence in the batch */
  fromIngestSequence: number;
  /** highest ingest sequence in the batch (the new checkpoint on success) */
  toIngestSequence: number;
}

// ---------------------------------------------------------------------------
// checkpoint
// ---------------------------------------------------------------------------

export interface GraphIndexingCheckpoint {
  organizationId: string;
  /** highest ingest sequence whose batch was successfully processed (or NO_OP) */
  lastIngestSequence: number;
  /** eventId of the last processed event (audit) */
  lastEventId: string | null;
  /** sourceHash of the active snapshot at the last successful checkpoint */
  lastSourceHash: string | null;
  updatedAt: string;
  /** when true, this org's queue is HALTED for human review (retries exhausted) */
  halted: boolean;
  /** safe reason code when halted */
  haltReason: string | null;
}

export const graphIndexingCheckpointSchema = z.object({
  organizationId: z.string().min(1),
  lastIngestSequence: z.number().int().min(0),
  lastEventId: z.string().nullable(),
  lastSourceHash: z.string().nullable(),
  updatedAt: z.string(),
  halted: z.boolean(),
  haltReason: z.string().nullable(),
}) satisfies z.ZodType<GraphIndexingCheckpoint>;

// ---------------------------------------------------------------------------
// run result + run record (SAFE observability metadata only)
// ---------------------------------------------------------------------------

export const GRAPH_INDEXING_RESULTS = [
  "ACTIVATED",
  "NO_OP",
  "RETRY_PENDING",
  "FAILED",
  "HALTED",
  "DISABLED",
  // startup canonical reconciliation outcomes (operational metadata, not events):
  "RECONCILED_NO_OP",
  "RECONCILE_FAILED",
] as const;
export type GraphIndexingRunResult = (typeof GRAPH_INDEXING_RESULTS)[number];
export const graphIndexingRunResultSchema = z.enum(GRAPH_INDEXING_RESULTS);

export interface GraphIndexingRun {
  runId: string;
  organizationId: string;
  batchEventIds: string[];
  eventCount: number;
  startingCheckpoint: number;
  endingCheckpoint: number;
  startedAt: string;
  completedAt: string;
  result: GraphIndexingRunResult;
  previousSnapshotId: string | null;
  resultingSnapshotId: string | null;
  sourceHashBefore: string | null;
  sourceHashAfter: string | null;
  retryCount: number;
  /** safe error codes only — NEVER a payload or field value */
  safeErrorCodes: string[];
}

export const graphIndexingRunSchema = z.object({
  runId: z.string().min(1),
  organizationId: z.string().min(1),
  batchEventIds: z.array(z.string()),
  eventCount: z.number().int().min(0),
  startingCheckpoint: z.number().int().min(0),
  endingCheckpoint: z.number().int().min(0),
  startedAt: z.string(),
  completedAt: z.string(),
  result: graphIndexingRunResultSchema,
  previousSnapshotId: z.string().nullable(),
  resultingSnapshotId: z.string().nullable(),
  sourceHashBefore: z.string().nullable(),
  sourceHashAfter: z.string().nullable(),
  retryCount: z.number().int().min(0),
  safeErrorCodes: z.array(z.string()),
}) satisfies z.ZodType<GraphIndexingRun>;

// ---------------------------------------------------------------------------
// failed batch (retry / halt diagnostics — SAFE only)
// ---------------------------------------------------------------------------

export interface GraphIndexingFailure {
  /** `${organizationId}∅${batchId}` */
  key: string;
  batchId: string;
  organizationId: string;
  batchEventIds: string[];
  startingCheckpoint: number;
  attemptCount: number;
  /** safe error codes only */
  safeErrorCodes: string[];
  firstFailedAt: string;
  lastFailedAt: string;
  halted: boolean;
}

export const graphIndexingFailureSchema = z.object({
  key: z.string().min(1),
  batchId: z.string().min(1),
  organizationId: z.string().min(1),
  batchEventIds: z.array(z.string()),
  startingCheckpoint: z.number().int().min(0),
  attemptCount: z.number().int().min(0),
  safeErrorCodes: z.array(z.string()),
  firstFailedAt: z.string(),
  lastFailedAt: z.string(),
  halted: z.boolean(),
}) satisfies z.ZodType<GraphIndexingFailure>;

// ---------------------------------------------------------------------------
// processed-event ledger row (dedup across restart)
// ---------------------------------------------------------------------------

export interface GraphProcessedEventRow {
  /** `${organizationId}∅${eventId}` */
  key: string;
  organizationId: string;
  eventId: string;
  runId: string;
  processedAt: string;
}

export const graphProcessedEventRowSchema = z.object({
  key: z.string().min(1),
  organizationId: z.string().min(1),
  eventId: z.string().min(1),
  runId: z.string().min(1),
  processedAt: z.string(),
}) satisfies z.ZodType<GraphProcessedEventRow>;

// ---------------------------------------------------------------------------
// durable per-organization ingest-sequence counter
// ---------------------------------------------------------------------------

/**
 * The durable monotonic ingest-sequence allocator, one row per organization. The
 * next event's `ingestSequence` is `lastIngestSequence + 1`, allocated inside the
 * SAME IndexedDB transaction that writes the pending event + source fingerprint, so
 * a sequence is never allocated without its event (no gaps, no partial rows).
 */
export interface GraphIngestSequenceRow {
  organizationId: string;
  /** the highest ingest sequence handed out so far for this org */
  lastIngestSequence: number;
}

export const graphIngestSequenceRowSchema = z.object({
  organizationId: z.string().min(1),
  lastIngestSequence: z.number().int().min(0),
}) satisfies z.ZodType<GraphIngestSequenceRow>;

// ---------------------------------------------------------------------------
// source-event fingerprint (duplicate-source-event detection — SAFE key only)
// ---------------------------------------------------------------------------

/**
 * A durable record that a VERSIONED source event `collection:id:version:operation`
 * has already been ingested. Used ONLY to skip a re-delivered versioned source
 * event (allocating no sequence). Carries NO entity body and NO display values —
 * just the safe source tuple + the durable identity it was first ingested as.
 */
export interface GraphSourceFingerprintRow {
  /** `${organizationId}∅${sourceFingerprint}` */
  key: string;
  organizationId: string;
  /** the safe `collection:id:aggregateVersion:operation` tuple (never a body) */
  fingerprint: string;
  /** the ingest sequence this source event was first ingested as */
  ingestSequence: number;
  /** the durable eventId this source event was first ingested as */
  eventId: string;
}

export const graphSourceFingerprintRowSchema = z.object({
  key: z.string().min(1),
  organizationId: z.string().min(1),
  fingerprint: z.string().min(1),
  ingestSequence: z.number().int().min(0),
  eventId: z.string().min(1),
}) satisfies z.ZodType<GraphSourceFingerprintRow>;

// ---------------------------------------------------------------------------
// policy
// ---------------------------------------------------------------------------

/** Deterministic, bounded coordinator policy. NO infinite retry. */
export interface GraphIndexingPolicy {
  /** max retry attempts for a failing batch before HALTING the org */
  maxRetries: number;
  /** base backoff (ms) for the injected scheduler; multiplied by attempt index */
  retryBackoffMs: number;
  registryVersion: string;
  allowOrgInheritance: boolean;
}

export const DEFAULT_GRAPH_INDEXING_POLICY: GraphIndexingPolicy = {
  maxRetries: 3,
  retryBackoffMs: 1000,
  registryVersion: "core-v1",
  allowOrgInheritance: true,
};
