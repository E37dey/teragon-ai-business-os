// TERAGON AI BUSINESS OS — evidence-eligibility gate for the implementation
// programme (W7-A, 7.1). Pure predicate: an evidence requirement is satisfied
// only when its typed ref points at a record that EXISTS, and — where the
// record type carries approval semantics — that record is APPROVED. Drafts,
// pending and rejected records BLOCK; a missing ref is an honest "חסרה ראיה".
import type { BaseEntity } from "@/domain/types";
import type { ImplementationEvidence } from "./types";

export type EvidenceEligibility =
  | { eligible: true; statusHe: "ראיה קבילה" }
  | {
      eligible: false;
      statusHe:
        | "חסרה ראיה"
        | "הרשומה לא נמצאה"
        | "לא קבילה — טיוטה"
        | "לא קבילה — ממתין לאישור"
        | "לא קבילה — נדחתה"
        | "לא קבילה — בארכיון";
    };

/** Approval-ish shapes a referenced record may carry (structural, no imports). */
interface ApprovalBearing {
  approval?: { state?: unknown };
  approvalState?: unknown;
  status?: unknown;
  archived?: unknown;
}

const DRAFT_STATES = new Set(["טיוטה"]);
const PENDING_STATES = new Set(["ממתין לאישור", "ממתין לבדיקה", "ממתין", "הוגש לבדיקה"]);
const REJECTED_STATES = new Set(["נדחה", "נדחתה", "נכשל"]);
const ARCHIVED_STATES = new Set(["בארכיון"]);

function stateOf(record: ApprovalBearing): string | null {
  const nested = record.approval?.state;
  if (typeof nested === "string") return nested;
  if (typeof record.approvalState === "string") return record.approvalState;
  // generic status field (e.g. Quotation.status "טיוטה"/"נדחתה") — only the
  // blocking values matter; any other status falls through to "eligible"
  if (typeof record.status === "string") return record.status;
  return null;
}

/**
 * Pure eligibility check for ONE evidence row against the (already fetched)
 * referenced record. `record === null` ⇒ the ref points nowhere.
 *
 * Rules:
 * - ref === null                          ⇒ "חסרה ראיה"
 * - record not found                      ⇒ "הרשומה לא נמצאה"
 * - approval-bearing record not approved  ⇒ blocked (draft/pending/rejected)
 * - archived record                       ⇒ blocked
 * - plain existing record (no approval semantics) ⇒ eligible
 */
export function evidenceEligibility(
  evidence: Pick<ImplementationEvidence, "ref">,
  record: BaseEntity | null,
): EvidenceEligibility {
  if (evidence.ref === null) return { eligible: false, statusHe: "חסרה ראיה" };
  if (record === null) return { eligible: false, statusHe: "הרשומה לא נמצאה" };

  const bearing = record as BaseEntity & ApprovalBearing;
  if (bearing.archived === true) return { eligible: false, statusHe: "לא קבילה — בארכיון" };

  const state = stateOf(bearing);
  if (state !== null) {
    if (DRAFT_STATES.has(state)) return { eligible: false, statusHe: "לא קבילה — טיוטה" };
    if (PENDING_STATES.has(state)) {
      return { eligible: false, statusHe: "לא קבילה — ממתין לאישור" };
    }
    if (REJECTED_STATES.has(state)) return { eligible: false, statusHe: "לא קבילה — נדחתה" };
    if (ARCHIVED_STATES.has(state)) return { eligible: false, statusHe: "לא קבילה — בארכיון" };
    // any other explicit state ("מאושר" etc.) — approved enough to cite
  }
  return { eligible: true, statusHe: "ראיה קבילה" };
}
