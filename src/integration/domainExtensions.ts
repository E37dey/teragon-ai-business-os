// W6-E — module-local DOMAIN EXTENSION interfaces (Phase 6.16).
// src/domain/types.ts is frozen to W6-E; the EXACT fields below are the patch
// the Integration Lead folds into types.ts (ready-to-apply diff lives in
// docs/integration-requests-w6e.md). Until then every module that reads or
// writes the new canonical fields types its records as `Entity & XExtension`.
// ALL fields are optional — every record already in IndexedDB satisfies the
// extended type, and the m001-m007 migrations backfill values.
import type {
  Approval,
  CourseSession,
  CustomerPrinter,
  Document,
  ISODate,
  Opportunity,
  Quotation,
  ServiceTicket,
  SupportRequest,
  Task,
} from "@/domain/types";

// ---------------------------------------------------------------------------
// Task — operational work state + ownership (replaces the ⟦…⟧ markers, m001)
// ---------------------------------------------------------------------------

/** The 6 operational board states (W4 spec) — persisted, no longer marker-encoded. */
export type TaskWorkState =
  | "לביצוע"
  | "בביצוע"
  | "ממתין ללקוח"
  | "ממתין לאישור"
  | "חסום"
  | "הושלם";

export type TaskOwnership = "אנושית" | "משותפת";

export interface TaskExtension {
  /** canonical operational state; absent ⇒ derived from status / legacy marker */
  workState?: TaskWorkState;
  /** canonical ownership; absent ⇒ derived from legacy marker (default אנושית) */
  ownership?: TaskOwnership;
  /** original marker-bearing description, preserved by m001 for rollback */
  legacyMarker?: string;
}

export type TaskX = Task & TaskExtension;

// ---------------------------------------------------------------------------
// SupportRequest — tier / assignee / category / feedback (m002)
// ---------------------------------------------------------------------------

export type SupportTier = 1 | 2 | 3;
export type SupportFeedback = "חיובי" | "שלילי";

export interface SupportRequestExtension {
  tier?: SupportTier;
  assigneeId?: string | null;
  /** deterministic rules-engine category (persisted snapshot of categorize()) */
  category?: string;
  feedback?: SupportFeedback | null;
  /** original marker-bearing description, preserved by m002 for rollback */
  legacyMarker?: string;
}

export type SupportRequestX = SupportRequest & SupportRequestExtension;

// ---------------------------------------------------------------------------
// Opportunity — fine-grained journey step (m003, replaces localStorage)
// ---------------------------------------------------------------------------

export interface OpportunityExtension {
  /** JOURNEY_STEPS id ("j1".."j10"); null/absent ⇒ derived from coarse stage */
  journeyStepId?: string | null;
}

export type OpportunityX = Opportunity & OpportunityExtension;

// ---------------------------------------------------------------------------
// Quotation — version counter (m004, replaces localStorage)
// ---------------------------------------------------------------------------

export interface QuotationExtension {
  /** edit counter, starts at 1; absent ⇒ 1 (or the legacy localStorage value) */
  version?: number;
}

export type QuotationX = Quotation & QuotationExtension;

// ---------------------------------------------------------------------------
// Approval — persisted extended workflow state (m005)
// ---------------------------------------------------------------------------

/** Mirrors ApprovalWorkflowState of the engine — agentEvents stay secondary truth. */
export type ApprovalExtendedState =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "expired"
  | "cancelled"
  | "executed"
  | "execution-failed"
  | "rolled-back";

export interface ApprovalExtension {
  extendedState?: ApprovalExtendedState;
}

export type ApprovalX = Approval & ApprovalExtension;

// ---------------------------------------------------------------------------
// m007 — additive optional fields with safe (honest) defaults
// ---------------------------------------------------------------------------

export interface ServiceTicketExtension {
  /** set from updatedAt for already-closed tickets; null = not closed / unknown */
  closedAt?: ISODate | null;
}

export type ServiceTicketX = ServiceTicket & ServiceTicketExtension;

export interface DocumentExtension {
  /** direct customer link (W3 request #4); null = course-linked only */
  customerId?: string | null;
}

export type DocumentX = Document & DocumentExtension;

export interface CourseSessionAttendanceEntry {
  studentId: string;
  present: boolean;
}

export interface CourseSessionExtension {
  /** structured attendance (W4 request #4); [] = not recorded structurally */
  attendance?: CourseSessionAttendanceEntry[];
}

export type CourseSessionX = CourseSession & CourseSessionExtension;

export interface CustomerPrinterExtension {
  /** explicit warranty end; null = unknown (module policy derivation stays the fallback) */
  warrantyUntil?: ISODate | null;
  lastMaintenanceAt?: ISODate | null;
  maintenanceIntervalDays?: number | null;
}

export type CustomerPrinterX = CustomerPrinter & CustomerPrinterExtension;
