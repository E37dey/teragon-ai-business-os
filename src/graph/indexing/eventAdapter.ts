// TERAGON Business Graph — ChangeEvent → GraphIndexingEvent adapter (Phase 5).
// ---------------------------------------------------------------------------
// The app has NO durable transactional outbox: the only mutation channel is
// `Repository.subscribe` emitting a minimal `ChangeEvent {type, collection, id?,
// item?}` AFTER a committed write (see docs/BUSINESS_GRAPH_EVENT_DISCOVERY.md).
// Delivery is therefore best-effort — an event can be lost between the canonical
// commit and the durable graph queue. This adapter SYNTHESIZES the normalized
// indexing contract from that event + the item + the closed ENTITY_REGISTRY. It is
// PURE: no clock, no randomness, no repo read, and it assigns NEITHER the durable
// `eventId` NOR the `ingestSequence` (both are allocated atomically in IndexedDB by
// the state store on ingest). It produces only a SAFE `sourceFingerprint` used for
// duplicate-source-event detection.
//
// It NEVER copies an entity body, notes, prompt, secret or protected content into
// the event — the event is a rebuild signal + audit reference, not graph content.
// Only small scalar metadata (id, version, updatedAt timestamp, approval-state
// literal, org id) is lifted. An unknown collection or a `clear` event is recorded
// SAFELY as an unsupported event; a relationship is never fabricated.
import type { BaseEntity } from "@/domain/types";
import type { ChangeEvent } from "@/repositories/Repository";
import { classifyOrganization } from "../contracts/identity";
import { registryEntryForCollection } from "./collectionMap";
import type { GraphIndexingOperation, NormalizedGraphEvent } from "./types";

const APPROVED_LITERALS: ReadonlySet<string> = new Set(["מאושר", "אושר"]);
const REJECTED_LITERALS: ReadonlySet<string> = new Set(["נדחה"]);

type Rec = Record<string, unknown>;

/** Read a (possibly dotted) field defensively; never throws, never casts. */
function readField(item: Rec | undefined, path: string | null): unknown {
  if (item === undefined || path === null) return undefined;
  if (!path.includes(".")) return item[path];
  let cur: unknown = item;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Rec)[seg];
  }
  return cur;
}

function isPresent(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

function readApprovalState(item: Rec | undefined): string | null {
  const direct = readField(item, "approvalState");
  if (typeof direct === "string") return direct;
  const nested = readField(item, "approval.state");
  if (typeof nested === "string") return nested;
  return null;
}

function readVersion(item: Rec | undefined, versionField: string | null): number | null {
  const raw = readField(item, versionField);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function readUpdatedAt(item: Rec | undefined): string | null {
  const raw = readField(item, "updatedAt");
  return typeof raw === "string" ? raw : null;
}

/**
 * Infer the operation. `ChangeEvent` carries no diff, so ARCHIVE/APPROVE/REJECT/
 * SUPERSEDE are inferred from CURRENT item field VALUES (best-effort — the full
 * rebuild is the authority, so the label never affects the produced graph).
 */
function inferUpdateOperation(
  item: Rec | undefined,
  archiveField: string | null,
  supersedeField: string | null,
  approvalState: string | null,
): GraphIndexingOperation {
  if (isPresent(readField(item, supersedeField))) return "SUPERSEDE";
  if (isPresent(readField(item, archiveField))) return "ARCHIVE";
  if (approvalState !== null && REJECTED_LITERALS.has(approvalState)) return "REJECT";
  if (approvalState !== null && APPROVED_LITERALS.has(approvalState)) return "APPROVE";
  return "UPDATE";
}

/**
 * Normalize a committed `ChangeEvent` into a `NormalizedGraphEvent`. The coordinator
 * wraps the result with a monotonic `ingestSequence`.
 */
export function normalizeChangeEvent<T extends BaseEntity>(
  change: ChangeEvent<T>,
  item?: T,
): NormalizedGraphEvent {
  const collection = change.collection;
  const rec = (item ?? change.item) as Rec | undefined;
  const aggregateId = change.id ?? (typeof rec?.["id"] === "string" ? (rec["id"] as string) : null);

  const entry = registryEntryForCollection(collection);

  // --- unsupported collection: record safely, never guess a relationship ---
  if (entry === null) {
    return {
      sourceFingerprint: null,
      organizationId: null,
      aggregateType: null,
      aggregateId,
      operation: "UNSUPPORTED",
      aggregateVersion: null,
      occurredAt: readUpdatedAt(rec),
      sourceRepository: collection,
      transactionId: null,
      correlationId: null,
      changedFields: [],
      approvalState: null,
      supported: false,
      unmappableReason: "UNSUPPORTED_COLLECTION",
    };
  }

  // --- clear event: no id, no item — a whole-collection wipe signal ---
  if (change.type === "clear") {
    return {
      sourceFingerprint: null,
      organizationId: null,
      aggregateType: entry.entityType,
      aggregateId: null,
      operation: "UNSUPPORTED",
      aggregateVersion: null,
      occurredAt: null,
      sourceRepository: collection,
      transactionId: null,
      correlationId: null,
      changedFields: [],
      approvalState: null,
      supported: false,
      unmappableReason: "CLEAR_EVENT",
    };
  }

  const approvalState = readApprovalState(rec);
  const aggregateVersion = readVersion(rec, entry.versionField);

  // operation mapping
  let operation: GraphIndexingOperation;
  if (change.type === "create") operation = "CREATE";
  else if (change.type === "remove") operation = "DELETE";
  else operation = inferUpdateOperation(rec, entry.archiveField, entry.supersedeField, approvalState);

  // organization: derive from the registry organizationField, else unmappable.
  // NEVER invent an org (SECURITY_MODEL §1: the dangling-org risk).
  let organizationId: string | null = null;
  let unmappableReason: string | null = null;
  let supported = true;
  if (entry.organizationField !== null) {
    const raw = readField(rec, entry.organizationField);
    const cls = classifyOrganization(typeof raw === "string" ? raw : (raw as null | undefined));
    if (cls.status === "mapped") {
      organizationId = cls.organizationId;
    } else {
      unmappableReason = cls.reasonCode;
      supported = false;
    }
  } else {
    // org is inherited from a parent FK — not resolvable on this channel.
    unmappableReason = "ORG_INHERITED";
    supported = false;
  }

  // SAFE source fingerprint — only when the source event carries a real version
  // AND id (a versionless update is never fingerprint-deduped; two legitimate
  // versionless updates to the same record must remain two distinct events).
  const sourceFingerprint =
    aggregateVersion !== null && aggregateId !== null
      ? `${collection}:${aggregateId}:${aggregateVersion}:${operation}`
      : null;

  return {
    sourceFingerprint,
    organizationId,
    aggregateType: entry.entityType,
    aggregateId,
    operation,
    aggregateVersion,
    occurredAt: readUpdatedAt(rec),
    sourceRepository: collection,
    transactionId: null,
    correlationId: null,
    changedFields: [],
    approvalState,
    supported,
    unmappableReason,
  };
}
