// TERAGON AI BUSINESS OS — agent-orchestration domain types (Wave 5, W5-C).
// New types live HERE — src/domain/types.ts is frozen for W5-C. These records
// populate the (previously empty) agentRuns / agentEvents / agentErrors
// collections. Honesty contract: nothing here invents metrics — unmeasured
// spend stays 0-with-measured:false semantics, statuses are exact Hebrew.
import type { BaseEntity, ISODate } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { AgentRunEvent, AgentRunEventType } from "./events";

// ---------------------------------------------------------------------------
// operations vocabulary (governance — checked by canAgent, deny-by-default)
// ---------------------------------------------------------------------------

/** Operation kinds an agent may be granted. Anything not listed ⇒ denied. */
export type AgentOperation =
  | "plan"
  | "dispatch"
  | "synthesize"
  | "read"
  | "search"
  | "summarize"
  | "classify"
  | "explain"
  | "identify-missing"
  | "draft"
  | "recommend"
  | "flag-contradiction"
  | "propose-update"
  | "prepare-automation-plan"
  | "propose-campaign";

/**
 * Operations agents may perform autonomously (read-only / draft-only).
 * Everything that mutates data or leaves the system requires an Approval.
 */
export const AUTONOMOUS_OPERATIONS: readonly AgentOperation[] = [
  "summarize",
  "classify",
  "search",
  "explain",
  "identify-missing",
  "draft",
  "recommend",
] as const;

// ---------------------------------------------------------------------------
// approval-required action registry (the canonical 12)
// ---------------------------------------------------------------------------

export type ApprovalRequiredAction =
  | "customer-message"
  | "quotation-change"
  | "price-change"
  | "discount"
  | "external-notification"
  | "ticket-closure"
  | "record-deletion"
  | "permission-change"
  | "permanent-knowledge-update"
  | "permanent-memory-update"
  | "external-automation"
  | "financial-commitment";

export const APPROVAL_REQUIRED_ACTIONS: readonly ApprovalRequiredAction[] = [
  "customer-message",
  "quotation-change",
  "price-change",
  "discount",
  "external-notification",
  "ticket-closure",
  "record-deletion",
  "permission-change",
  "permanent-knowledge-update",
  "permanent-memory-update",
  "external-automation",
  "financial-commitment",
] as const;

export const APPROVAL_ACTION_LABELS_HE: Record<ApprovalRequiredAction, string> = {
  "customer-message": "שליחת הודעה ללקוח",
  "quotation-change": "שינוי הצעת מחיר",
  "price-change": "שינוי מחיר",
  discount: "מתן הנחה",
  "external-notification": "התראה חיצונית",
  "ticket-closure": "סגירת קריאת שירות",
  "record-deletion": "מחיקת רשומה",
  "permission-change": "שינוי הרשאות",
  "permanent-knowledge-update": "עדכון קבוע במאגר הידע",
  "permanent-memory-update": "עדכון קבוע בזיכרון הארגוני",
  "external-automation": "אוטומציה חיצונית",
  "financial-commitment": "התחייבות כספית",
};

// ---------------------------------------------------------------------------
// execution payloads (approval engine) + honest rollback contract
// ---------------------------------------------------------------------------

/** JSON-safe scalar for record-field changes. */
export type FieldValue = string | number | boolean | null | string[];

/**
 * What an approved execution will actually do. Only "task-creation" and
 * "record-field-change" have built-in handlers WITH rollback (inverse ops).
 * "external" is a seam for W5-D-injected handlers — rollback לא נתמך.
 */
export type ExecutionPayload =
  | {
      kind: "task-creation";
      collection: "tasks" | "agentTasks";
      /** the full record to create (id chosen by the engine when empty) */
      record: Record<string, FieldValue>;
    }
  | {
      kind: "record-field-change";
      collection: CollectionKey;
      recordId: string;
      field: string;
      newValue: FieldValue;
    }
  | {
      kind: "external";
      action: ApprovalRequiredAction;
      /** Hebrew description of what the injected handler will do */
      descriptionHe: string;
      /** opaque JSON-safe payload for the injected handler */
      data: Record<string, FieldValue>;
    };

/** Inverse operation captured at execution time — enables honest rollback. */
export type InversePayload =
  | { kind: "delete-created"; collection: CollectionKey; recordId: string }
  | {
      kind: "restore-field";
      collection: CollectionKey;
      recordId: string;
      field: string;
      previousValue: FieldValue;
    }
  /** honest marker: this execution cannot be rolled back */
  | { kind: "unsupported"; reasonHe: string };

export const ROLLBACK_UNSUPPORTED_HE = "rollback לא נתמך";

// ---------------------------------------------------------------------------
// conflicts — rich structured detail (the Wave-1 AgentConflict record keeps
// the Hebrew description; the full structure persists in the ConflictDetected
// event payload, from which the UI derives)
// ---------------------------------------------------------------------------

export type ConflictSeverity = "נמוכה" | "בינונית" | "גבוהה";

export type HumanDecisionState = "ממתין להחלטה" | "הוחלט";

export interface ConflictClaim {
  agentId: string;
  claimHe: string;
  /** ids of the real records cited by this side */
  evidenceRefs: string[];
}

export interface ConflictDetail {
  participants: string[];
  claims: ConflictClaim[];
  /** evidence that WOULD settle the conflict but does not exist (Hebrew) */
  missingEvidenceHe: string[];
  severity: ConflictSeverity;
  suggestedResolutionPathHe: string;
  humanDecisionState: HumanDecisionState;
}

// ---------------------------------------------------------------------------
// run record
// ---------------------------------------------------------------------------

export type AgentRunStatus = "טיוטה" | "רץ" | "ממתין לאישור" | "הושלם" | "נכשל" | "בוטל";

/** Bounded counters — every loop in the engine is capped by one of these. */
export interface RunCounters {
  modelCalls: number;
  transientRetries: number;
  revisionCycles: number;
  handoffs: number;
}

export interface RunLimitConfig {
  maxRunDurationMs: number;
  /** ILS; 0 = no spending allowed (Mode A local engine spends nothing) */
  maxUsageBudgetILS: number;
}

export interface AgentRun extends BaseEntity {
  goal: string;
  requestedById: string;
  /** deterministic classification result; null until classified */
  classification: string | null;
  status: AgentRunStatus;
  specialistAgentIds: string[];
  taskIds: string[];
  conflictIds: string[];
  approvalIds: string[];
  counters: RunCounters;
  limits: RunLimitConfig;
  /** measured spend only — Mode A rules engine spends 0 (usage.measured=false) */
  usageSpentILS: number;
  startedAt: ISODate;
  endedAt: ISODate | null;
  correlationId: string;
  /** true for the labeled demo scenario records */
  demo: boolean;
}

// ---------------------------------------------------------------------------
// event + error records (persisted — the UI graph derives ONLY from these)
// ---------------------------------------------------------------------------

export interface AgentEventRecord extends BaseEntity {
  runId: string;
  /** monotonic per-run sequence — total order of the timeline */
  seq: number;
  ts: ISODate;
  /** actor: agent id / user id / "system" */
  actor: string;
  /** denormalized for filtering; always equals event.type */
  type: AgentRunEventType;
  event: AgentRunEvent;
}

export interface AgentErrorRecord extends BaseEntity {
  runId: string;
  agentId: string | null;
  code: string;
  detailHe: string;
  at: ISODate;
}
