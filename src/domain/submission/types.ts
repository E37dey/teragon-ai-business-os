// TERAGON AI BUSINESS OS — W7-E (Phase 7.18): the canonical submission model.
// SubmissionPackage / Deliverable / Evidence / Validation / Blocker / Snapshot.
// Honesty contract: "מלא" is DERIVED, never stored by hand; several
// deliverables are honestly חלקי/ממתין לבדיקה until the canonical approval
// engine produces real approvals. Nothing here fakes 12/12.
import type { BaseEntity, ISODate } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { DeliverableKey } from "./contentRegistry";

// ---------------------------------------------------------------------------
// deliverable states (mandated vocabulary)
// ---------------------------------------------------------------------------

export const DELIVERABLE_STATES = [
  "חסר",
  "חלקי",
  "ממתין לבדיקה",
  "מלא",
  "חסום",
  "פג תוקף",
] as const;

export type DeliverableState = (typeof DELIVERABLE_STATES)[number];

/** overall submission readiness — NEVER green while a blocker exists */
export const READINESS_STATES = ["לא מוכן להגשה", "בהכנה", "מוכן להגשה"] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

// ---------------------------------------------------------------------------
// evidence
// ---------------------------------------------------------------------------

/** typed reference to a REAL record — same shape family as W7-A EvidenceRef */
export interface SubmissionEvidenceRef {
  collection: CollectionKey;
  recordId: string;
  /** in-app route where the record is inspectable */
  route: string;
}

/** a single evidence requirement of a deliverable + its resolution result */
export interface ResolvedEvidence {
  label: string;
  ref: SubmissionEvidenceRef | null;
  /** derived — the referenced record genuinely exists */
  resolved: boolean;
  /** honest Hebrew status: "נמצאה" / "חסרה ראיה" / "רשומה לא נמצאה" */
  statusHe: string;
}

// ---------------------------------------------------------------------------
// collection records
// ---------------------------------------------------------------------------

/** THE submission package (collection submissionPackages) */
export interface SubmissionPackage extends BaseEntity {
  name: string;
  version: number;
  ownerId: string;
  readiness: ReadinessState;
  deliverableKeys: DeliverableKey[];
  noteHe: string;
}

/** persisted deliverable evaluation (collection submissionDeliverables) */
export interface SubmissionDeliverableRecord extends BaseEntity {
  key: DeliverableKey;
  title: string;
  state: DeliverableState;
  /** named seed user or null ⇒ "לא הוקצה אחראי" */
  ownerId: string | null;
  route: string;
  printable: boolean;
  /** canonical Approval record id; null ⇒ "ממתין לאישור" */
  approvalId: string | null;
  stateReasonsHe: string[];
  lastEvaluatedAt: ISODate;
}

/** persisted evidence row (collection submissionEvidence) */
export interface SubmissionEvidenceRecord extends BaseEntity {
  deliverableKey: DeliverableKey;
  label: string;
  ref: SubmissionEvidenceRef | null;
  resolved: boolean;
  statusHe: string;
}

/** persisted quality-validation result (collection qualityValidations) */
export interface SubmissionValidationRecord extends BaseEntity {
  deliverableKey: DeliverableKey;
  criterion: string;
  state: "pass" | "warning" | "fail" | "not_applicable";
  reasonHe: string;
  evidenceHe: string[];
  missingFields: string[];
  affectedRecord: string | null;
  recommendedFixHe: string | null;
  checkedAt: ISODate;
  validatorVersion: string;
}

/** a blocking / warning issue (collection submissionBlockers) */
export interface SubmissionBlocker extends BaseEntity {
  /** null ⇒ package-wide blocker */
  deliverableKey: DeliverableKey | null;
  severity: "חוסם" | "אזהרה";
  titleHe: string;
  detailHe: string;
  /** route that opens the place to fix it; null when none */
  targetRoute: string | null;
  resolvedAt: ISODate | null;
}

/** an immutable point-in-time snapshot (collection submissionSnapshots) */
export interface SubmissionSnapshotRecord extends BaseEntity {
  takenAt: ISODate;
  takenById: string;
  readiness: ReadinessState;
  deliverableStates: Record<string, DeliverableState>;
  qualitySummary: { pass: number; warning: number; fail: number; notApplicable: number };
  blockerCount: number;
  noteHe: string;
}

// ---------------------------------------------------------------------------
// derived (non-persisted) views
// ---------------------------------------------------------------------------

/** live evaluation of one deliverable — computed, never hand-set */
export interface DeliverableEvaluation {
  key: DeliverableKey;
  order: number;
  title: string;
  state: DeliverableState;
  ownerId: string | null;
  ownerNameHe: string | null;
  route: string;
  routeExists: boolean;
  printable: boolean;
  /** honest approval status: "מאושר" | "ממתין לאישור" | "אין רשומת אישור" */
  approvalStatusHe: string;
  approvalId: string | null;
  evidence: ResolvedEvidence[];
  /** blocking quality fails on this deliverable (criterion names) */
  qualityFails: string[];
  qualityWarnings: string[];
  /** every reason the deliverable is not "מלא" (empty ⇒ מלא) */
  stateReasonsHe: string[];
  /** W7-F seam: presentation coverage — "חסר" until presenterNotes land */
  presentationStatusHe: string;
}

/** one finding of the "מבקר ההגשה" rail auditor */
export interface SubmissionAuditFinding {
  kind:
    | "missing-deliverable"
    | "conflicting-number"
    | "wrong-persona-count"
    | "missing-baseline"
    | "missing-named-owner"
    | "unresolved-evidence"
    | "expired-material"
    | "failed-route"
    | "missing-presenter-note"
    | "timing-overflow"
    | "stale-screenshot";
  severity: "חוסם" | "אזהרה";
  titleHe: string;
  detailHe: string;
  /** route the finding opens */
  targetRoute: string;
}
