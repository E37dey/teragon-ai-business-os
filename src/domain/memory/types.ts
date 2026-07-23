// TERAGON AI BUSINESS OS — memory domain v2 (Wave 6, W6-A).
// New types live HERE — src/domain/types.ts is frozen for W6-A. These records
// populate the Wave-6 memory governance collections (memoryProposals /
// memorySources / memoryLinks / memoryVersions / memoryUsage / memoryConflicts /
// memoryImportJobs / memoryExportJobs) plus the existing memoryRecords store.
//
// Honesty contract:
// - confidence is ALWAYS a ConfidenceInfo (status/method/signals) — NEVER a
//   bare number. Unmeasured ⇒ status "unavailable" ⇒ UI renders "טרם נמדד".
// - approvedAt/approvedBy are null until a NAMED human decided via the
//   canonical Wave-5 ApprovalEngine. There is no other write path.
// - legacy (Wave-1 seed) records bridged to V2 carry origin "legacy-import"
//   and honest nulls — the bridge never invents an approval.
import type { BaseEntity, ISODate } from "@/domain/types";
import type { ConfidenceInfo } from "@/domain/ai/envelope";

// ---------------------------------------------------------------------------
// vocabulary (Hebrew product language)
// ---------------------------------------------------------------------------

/** The four memory layers. */
export type MemoryLayer = "customer" | "business" | "technical" | "agent_learning";

export const MEMORY_LAYERS: readonly MemoryLayer[] = [
  "customer",
  "business",
  "technical",
  "agent_learning",
] as const;

export const MEMORY_LAYER_LABELS_HE: Record<MemoryLayer, string> = {
  customer: "זיכרון לקוחות",
  business: "זיכרון עסקי",
  technical: "זיכרון מקצועי",
  agent_learning: "זיכרון סוכנים",
};

export type MemoryVerificationState =
  | "לא נבדק"
  | "בבדיקה"
  | "מאומת"
  | "שנוי במחלוקת"
  | "נדחה"
  | "פג תוקף";

export const MEMORY_VERIFICATION_STATES: readonly MemoryVerificationState[] = [
  "לא נבדק",
  "בבדיקה",
  "מאומת",
  "שנוי במחלוקת",
  "נדחה",
  "פג תוקף",
] as const;

export type MemorySensitivity = "ציבורי" | "פנימי" | "רגיש" | "מוגבל";

export const MEMORY_SENSITIVITIES: readonly MemorySensitivity[] = [
  "ציבורי",
  "פנימי",
  "רגיש",
  "מוגבל",
] as const;

/** ordered — index = strictness (for "at least X" checks) */
export const SENSITIVITY_ORDER: Record<MemorySensitivity, number> = {
  ציבורי: 0,
  פנימי: 1,
  רגיש: 2,
  מוגבל: 3,
};

/** Approval state of a memory record (derived from the ApprovalEngine flow). */
export type MemoryApprovalState = "טיוטה" | "ממתין לאישור" | "מאושר" | "נדחה";

/** How a V2 record came to exist — the bridge never fakes an approval. */
export type MemoryRecordOrigin = "proposal" | "legacy-import" | "restore";

export type MemoryRetentionPolicy = "קבוע" | "לסקירה תקופתית" | "פג בתאריך יעד";

export const MEMORY_RETENTION_POLICIES: readonly MemoryRetentionPolicy[] = [
  "קבוע",
  "לסקירה תקופתית",
  "פג בתאריך יעד",
] as const;

// ---------------------------------------------------------------------------
// record
// ---------------------------------------------------------------------------

/** A typed link from a memory record to a real domain entity. */
export interface MemoryEntityLink {
  /** collection key of the target, e.g. "customers" */
  collection: string;
  /** id of the actual record, e.g. "cust-2" — never invented */
  entityId: string;
  /** display label (Hebrew) */
  label: string;
}

/**
 * The canonical Wave-6 memory record. Persisted in the "memoryRecords"
 * collection alongside legacy Wave-1 records (the adapter bridges on read —
 * a record with a `memoryLayer` field is V2; anything else is legacy).
 */
export interface MemoryRecordV2 extends BaseEntity {
  organizationId: string;
  title: string;
  /** deterministic, unique-per-collection slug derived from the title */
  slug: string;
  /** markdown body; [[wikilinks]] allowed */
  bodyMarkdown: string;
  /** markdown stripped for search/similarity (deterministic) */
  plainText: string;
  memoryLayer: MemoryLayer;
  /** browser folder inside the layer (legacy "folder" preserved) */
  folder: string;
  entityLinks: MemoryEntityLink[];
  tags: string[];
  /** wikilink targets extracted from bodyMarkdown */
  wikiLinks: string[];
  /** ids of records whose wikiLinks resolve to THIS record (derived, cached) */
  backlinks: string[];
  /** MemorySource ids backing this record */
  sourceIds: string[];
  ownerId: string;
  ownerName: string;
  sensitivity: MemorySensitivity;
  verificationState: MemoryVerificationState;
  approvalState: MemoryApprovalState;
  /** NEVER a bare number — full ConfidenceInfo or honest "unavailable" */
  confidence: ConfidenceInfo;
  approvedAt: ISODate | null;
  /** named human (e.g. "צחי זוסטייהם") — null until a real decision; never invented */
  approvedBy: string | null;
  /** current version number (matches the latest MemoryVersion) */
  version: number;
  /** id of the record this one supersedes (merge/restore chains) */
  supersedesId: string | null;
  retentionPolicy: MemoryRetentionPolicy;
  /** next review / expiry date when the policy requires one */
  reviewDate: ISODate | null;
  archivedAt: ISODate | null;
  origin: MemoryRecordOrigin;
}

// ---------------------------------------------------------------------------
// proposal
// ---------------------------------------------------------------------------

export type MemoryProposalStatus =
  | "טיוטה"
  | "ממתין לאישור"
  | "מאושר"
  | "נדחה"
  | "בוטל"
  | "מוזג";

/** One deterministic pre-approval check and its honest outcome. */
export interface MemoryCheckResult {
  /** "עבר" | "נכשל" | "אזהרה" */
  outcome: "עבר" | "נכשל" | "אזהרה";
  detailHe: string;
  /** ids of the records that triggered the outcome (duplicates, conflicts…) */
  relatedIds: string[];
}

/** The editable content of a proposal — what will become the record. */
export interface MemoryProposalDraft {
  title: string;
  slug: string;
  bodyMarkdown: string;
  memoryLayer: MemoryLayer;
  folder: string;
  entityLinks: MemoryEntityLink[];
  tags: string[];
  sourceIds: string[];
  sensitivity: MemorySensitivity;
  retentionPolicy: MemoryRetentionPolicy;
  reviewDate: ISODate | null;
}

export interface MemoryProposal extends BaseEntity {
  organizationId: string;
  /** the raw observation that triggered the proposal (Hebrew) */
  observationHe: string;
  /** who proposed — agent id or user id */
  proposedById: string;
  proposedByName: string;
  draft: MemoryProposalDraft;
  status: MemoryProposalStatus;
  checks: {
    sourceValidation: MemoryCheckResult;
    duplicateCheck: MemoryCheckResult;
    contradictionCheck: MemoryCheckResult;
    sensitivityCheck: MemoryCheckResult;
  };
  /** ApprovalEngine record id (approvals collection) — null while טיוטה */
  approvalId: string | null;
  /** engine run id used for the approval event log */
  runId: string;
  /** the MemoryRecordV2 created/updated on approval */
  resultRecordId: string | null;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: ISODate | null;
  /** merge target when the decision was "מזג עם פריט קיים" */
  mergeTargetId: string | null;
  /** set by "בקש מקור נוסף" — the reviewer's request (Hebrew) */
  moreSourcesRequestHe: string | null;
}

// ---------------------------------------------------------------------------
// source
// ---------------------------------------------------------------------------

export type MemorySourceKind = "entity" | "document" | "conversation" | "observation" | "external";

export interface MemorySource extends BaseEntity {
  kind: MemorySourceKind;
  /** id/ref of the underlying source (e.g. "ticket:t-8") */
  refId: string;
  titleHe: string;
  /** the exact excerpt supporting the memory claim */
  excerpt: string;
  capturedAt: ISODate;
  /** true only when the referenced record was verified to exist */
  verified: boolean;
}

// ---------------------------------------------------------------------------
// link
// ---------------------------------------------------------------------------

export type MemoryLinkResolution = "resolved" | "unresolved" | "ambiguous" | "broken";

export const MEMORY_LINK_RESOLUTION_LABELS_HE: Record<MemoryLinkResolution, string> = {
  resolved: "מקושר",
  unresolved: "לא מקושר",
  ambiguous: "רב-משמעי",
  broken: "שבור",
};

/** A [[wikilink]] occurrence and its resolution state. */
export interface MemoryLink extends BaseEntity {
  /** record the link appears in */
  fromRecordId: string;
  /** the literal wikilink text, e.g. 'ד"ר יעל ברקאי' */
  targetText: string;
  resolution: MemoryLinkResolution;
  /** resolved target record id (resolution "resolved" only) */
  resolvedRecordId: string | null;
  /** candidate record ids (resolution "ambiguous") */
  candidateIds: string[];
}

// ---------------------------------------------------------------------------
// version (immutable)
// ---------------------------------------------------------------------------

/**
 * Immutable snapshot of a record at a version boundary. The version store
 * REJECTS update/remove (see memoryStores) and snapshots are deep-frozen.
 */
export interface MemoryVersion extends BaseEntity {
  recordId: string;
  versionNumber: number;
  previousVersionId: string | null;
  /** full frozen snapshot of the record at this version */
  snapshot: MemoryRecordV2;
  /** fields changed vs the previous version (empty for v1) */
  changedFields: string[];
  /** who authored the change (agent/user id + name) */
  authorId: string;
  authorName: string;
  /** the named human who approved (null only for legacy-import v1) */
  approverId: string | null;
  approverName: string | null;
  reasonHe: string;
  timestamp: ISODate;
  rollbackEligible: boolean;
}

// ---------------------------------------------------------------------------
// usage — which AI answer used which version
// ---------------------------------------------------------------------------

export interface MemoryUsage extends BaseEntity {
  /** AIResponseEnvelopeV2 id that consumed the memory */
  envelopeId: string;
  /** operation key of the envelope, e.g. "summarize.customer" */
  operation: string;
  recordId: string;
  versionId: string;
  versionNumber: number;
  usedAt: ISODate;
}

// ---------------------------------------------------------------------------
// conflict
// ---------------------------------------------------------------------------

export type MemoryConflictStatus = "פתוח" | "נפתר";

export interface MemoryConflictClaim {
  /** proposal or record id making the claim */
  holderId: string;
  /** "proposal" | "record" */
  holderKind: "proposal" | "record";
  /** normalized claim key (deterministic extraction) */
  claimKey: string;
  claimValue: string;
}

export interface MemoryConflict extends BaseEntity {
  /** proposal that surfaced the contradiction */
  proposalId: string;
  /** the approved record it contradicts */
  recordId: string;
  claimA: MemoryConflictClaim;
  claimB: MemoryConflictClaim;
  status: MemoryConflictStatus;
  resolutionHe: string | null;
  detectedAt: ISODate;
}

// ---------------------------------------------------------------------------
// import/export jobs (records owned here; the import/export ENGINE is W6-B)
// ---------------------------------------------------------------------------

export type MemoryJobStatus = "ממתין" | "רץ" | "הושלם" | "נכשל";

export interface MemoryImportJob extends BaseEntity {
  format: "markdown" | "zip";
  status: MemoryJobStatus;
  requestedById: string;
  startedAt: ISODate | null;
  endedAt: ISODate | null;
  /** honest count of items actually imported (0 until done) */
  importedCount: number;
  detailHe: string;
}

export interface MemoryExportJob extends BaseEntity {
  format: "markdown" | "zip";
  status: MemoryJobStatus;
  requestedById: string;
  startedAt: ISODate | null;
  endedAt: ISODate | null;
  exportedCount: number;
  detailHe: string;
}
