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
 * A normalized, coordinator-stamped mutation signal. NEVER contains an entity
 * body. `eventId` is the deterministic dedup key. `ingestSequence` is the
 * coordinator-assigned monotonic total-order tiebreaker (assigned on receipt).
 */
export interface GraphIndexingEvent {
  /** deterministic dedup key `${collection}:${id}:${aggregateVersion ?? "-"}:${operation}` */
  eventId: string;
  /** coordinator-assigned monotonic order (assigned on receipt; never wall-clock) */
  ingestSequence: number;
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

/** The adapter output before the coordinator assigns an ingest sequence. */
export type NormalizedGraphEvent = Omit<GraphIndexingEvent, "ingestSequence">;

export const graphIndexingEventSchema = z.object({
  eventId: z.string().min(1),
  ingestSequence: z.number().int().min(0),
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
