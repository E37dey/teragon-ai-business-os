// TERAGON Business Graph — Phase 10 RUNTIME audit adapter.
// ---------------------------------------------------------------------------
// A BOUNDED internal audit adapter connecting the facade's audit sink to a
// durable record. The canonical `AuditEvent` repository redacts raw content and
// is NOT shaped for facade/query/traversal execution-correlation, so this adapter
// keeps a bounded internal buffer of SAFE records and (optionally) forwards each
// to an injected durable writer. It records ONLY safe metadata — authenticated
// actor, organization, operation, the three execution-correlation ids, readiness,
// health, result count, and the safe result/denial code. It NEVER records
// protected bodies, raw search text, customer notes, hidden entity ids, permission
// internals, or session tokens (none of which ever reach the facade audit record).
//
// FAILURE POLICY (enforced by the runtime query gateway, see composition.ts):
//   • fail-CLOSED for sensitive graph queries — if the durable audit write FAILS,
//     the query result is denied and NO data is returned;
//   • fail-SAFE degraded for low-risk status calls — allowed, but marked with an
//     explicit degraded-audit-state so the caller knows the audit was not durable.
// An audit failure NEVER leaks data and NEVER silently grants access.
import type { ActorRef } from "../contracts/actor";
import type { GraphIndexHealthState } from "../store/contracts";
import { safeMessageFor } from "../application/errors";
import type {
  BusinessGraphAuditSink,
  BusinessGraphFacadeAuditRecord,
  BusinessGraphFacadeOperation,
  BusinessGraphFacadeResult,
} from "../application/types";
import type { BusinessGraphFacadeResultCode } from "../application/errors";
import { BUSINESS_QUERY_NAMES, type BusinessQueryName } from "../query/types";
import type { BusinessQueryReadiness } from "../query/types";

// ---------------------------------------------------------------------------
// safe audit entry (an explicit whitelist — nothing unsafe can ride along)
// ---------------------------------------------------------------------------

/** The ONLY fields the runtime audit adapter persists. Defensive whitelist. */
export interface SafeGraphAuditEntry {
  facadeExecutionId: string;
  correlationId: string;
  operation: BusinessGraphFacadeOperation;
  actorRef: ActorRef | null;
  organizationId: string | null;
  readiness: BusinessQueryReadiness | null;
  health: GraphIndexHealthState | null;
  resultCount: number | null;
  resultCode: BusinessGraphFacadeResultCode;
  queryExecutionId: string | null;
  traversalExecutionIds: readonly string[];
}

/** The state of an audit write for one execution. */
export type AuditWriteState = "OK" | "DEGRADED" | "FAILED";

/** The seam onto a durable audit destination. `write` throws on a real failure. */
export interface CanonicalGraphAuditWriter {
  write(entry: SafeGraphAuditEntry): void;
}

/** Project the (already-safe) facade audit record onto the explicit safe whitelist. */
export function toSafeAuditEntry(record: BusinessGraphFacadeAuditRecord): SafeGraphAuditEntry {
  return {
    facadeExecutionId: record.facadeExecutionId,
    correlationId: record.correlationId,
    operation: record.operation,
    actorRef: record.actorRef,
    organizationId: record.organizationId,
    readiness: record.readiness,
    health: record.health,
    resultCount: record.resultCount,
    resultCode: record.resultCode,
    queryExecutionId: record.queryExecutionId,
    traversalExecutionIds: [...record.traversalExecutionIds],
  };
}

interface BufferedEntry {
  entry: SafeGraphAuditEntry;
  state: AuditWriteState;
}

export interface RuntimeAuditAdapterOptions {
  /** durable destination; omit for the current honest state (bounded internal only) */
  writer?: CanonicalGraphAuditWriter;
  /** bounded buffer capacity (oldest dropped past it) */
  capacity?: number;
}

const DEFAULT_AUDIT_CAPACITY = 512;

/**
 * The bounded internal audit adapter. As a `BusinessGraphAuditSink` its `record`
 * NEVER throws (so the facade path is never destabilized): it forwards to the
 * durable writer when present and remembers the per-execution write state, which
 * the query gateway reads to enforce the fail-closed / fail-safe policy.
 */
export class RuntimeBusinessGraphAuditAdapter implements BusinessGraphAuditSink {
  private readonly writer: CanonicalGraphAuditWriter | null;
  private readonly capacity: number;
  private readonly buffer: BufferedEntry[] = [];
  private readonly stateByExecutionId = new Map<string, AuditWriteState>();

  constructor(options: RuntimeAuditAdapterOptions = {}) {
    this.writer = options.writer ?? null;
    this.capacity = Math.max(1, options.capacity ?? DEFAULT_AUDIT_CAPACITY);
  }

  /** The `BusinessGraphAuditSink` contract — safe, bounded, never throws. */
  record(record: BusinessGraphFacadeAuditRecord): void {
    const entry = toSafeAuditEntry(record);
    let state: AuditWriteState;
    if (this.writer !== null) {
      try {
        this.writer.write(entry);
        state = "OK";
      } catch {
        // NEVER surface a raw writer error — it may echo record content.
        state = "FAILED";
      }
    } else {
      // No canonical writer: the record lives ONLY in the bounded internal buffer.
      // That is an honest degraded state, not a write failure.
      state = "DEGRADED";
    }
    this.pushBounded({ entry, state });
    if (entry.facadeExecutionId.length > 0) {
      this.stateByExecutionId.set(entry.facadeExecutionId, state);
    }
  }

  /** The write state for a given facade execution id (DEGRADED when unknown). */
  writeState(facadeExecutionId: string | null): AuditWriteState {
    if (facadeExecutionId === null || facadeExecutionId.length === 0) return "DEGRADED";
    return this.stateByExecutionId.get(facadeExecutionId) ?? "DEGRADED";
  }

  /** All buffered safe entries (bounded), oldest-first. */
  entries(): readonly SafeGraphAuditEntry[] {
    return this.buffer.map((b) => b.entry);
  }

  /** The most recent buffered entry, or null. */
  lastEntry(): SafeGraphAuditEntry | null {
    const last = this.buffer.at(-1);
    return last ? last.entry : null;
  }

  private pushBounded(item: BufferedEntry): void {
    this.buffer.push(item);
    if (this.buffer.length > this.capacity) this.buffer.shift();
  }
}

// ---------------------------------------------------------------------------
// fail-closed / fail-safe outcome resolution
// ---------------------------------------------------------------------------

/** The 9 business queries are ALL sensitive — their audit write is fail-CLOSED. */
export const SENSITIVE_GRAPH_QUERIES: readonly BusinessQueryName[] = BUSINESS_QUERY_NAMES;

/** The result of a sensitive query run through the fail-closed audit gate. */
export interface RuntimeQueryOutcome {
  /** the SAFE result — data-bearing ONLY when `released` is true */
  result: BusinessGraphFacadeResult;
  auditState: AuditWriteState;
  /** false when the fail-closed policy suppressed the data (audit write failed) */
  released: boolean;
}

/** Coerce a data-bearing result into a safe denial when its audit write failed. */
function denyForAuditFailure(result: BusinessGraphFacadeResult): BusinessGraphFacadeResult {
  return {
    code: "INTERNAL_FAILURE",
    ok: false,
    correlationId: result.correlationId,
    facadeExecutionId: result.facadeExecutionId,
    query: result.query,
    view: null,
    audit: result.audit,
    error: { code: "INTERNAL_FAILURE", messageHe: safeMessageFor("INTERNAL_FAILURE") },
  };
}

/**
 * Apply the fail-CLOSED policy: when the durable audit write FAILED for a
 * data-bearing sensitive query, suppress the data and return a safe denial.
 * Otherwise pass the result through unchanged. A non-OK result never carries data
 * and is released as-is.
 */
export function resolveQueryOutcome(
  result: BusinessGraphFacadeResult,
  auditState: AuditWriteState,
): RuntimeQueryOutcome {
  if (auditState === "FAILED" && result.ok) {
    return { result: denyForAuditFailure(result), auditState, released: false };
  }
  return { result, auditState, released: result.ok };
}

/** The result of a low-risk status call run through the fail-safe audit gate. */
export interface RuntimeStatusOutcome<T> {
  result: T;
  auditState: AuditWriteState;
  /** true when the audit was not durable (bounded-internal or failed) */
  degraded: boolean;
}

/** Apply the fail-SAFE policy: always release the status result, marking degraded. */
export function resolveStatusOutcome<T>(result: T, auditState: AuditWriteState): RuntimeStatusOutcome<T> {
  return { result, auditState, degraded: auditState !== "OK" };
}
