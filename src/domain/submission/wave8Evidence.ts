// TERAGON AI BUSINESS OS — W8-E (Phase 8.14): ADDITIVE Wave-8 evidence refs.
// The Wave-8 workstreams produced new live artifacts (analytics catalogue,
// governance registers, permission/administration records, system-health
// snapshots) + their docs. These refs EXTEND the deliverables' evidence
// surface for reviewers WITHOUT touching the readiness gate: deliverable
// states stay exactly as derived (ממתין לאישור until a NAMED human approves
// via the canonical engine) — nothing here can auto-מלא anything.
import type { CollectionKey } from "@/repositories/collections";
import type { DeliverableKey } from "./contentRegistry";

/** The mandated honest label for an undecided deliverable approval. */
export const WAVE8_PENDING_APPROVAL_HE = "ממתין לאישור אנושי בשם";

export interface Wave8EvidenceRef {
  deliverableKey: DeliverableKey;
  label: string;
  /** in-app route where the artifact is inspectable — MUST exist in APP_ROUTES */
  route: string;
  /** live collection backing the artifact; null ⇒ document-only reference */
  collection: CollectionKey | null;
  /** repo doc for reviewers; null ⇒ live-record-only reference */
  docPath: string | null;
  noteHe: string;
}

/**
 * The additive Wave-8 references, per deliverable. Purely informative for the
 * reviewer: the readiness gate (evaluateDeliverable) does NOT consume them.
 */
export const WAVE8_DELIVERABLE_EVIDENCE: readonly Wave8EvidenceRef[] = [
  // analytics artifacts → the metric-levels deliverable
  {
    deliverableKey: "metric-levels",
    label: "עמוד /analytics — קטלוג המדדים החי (W8-A)",
    route: "/analytics",
    collection: "metricDefinitions",
    docPath: "docs/WAVE_8_METRIC_INVENTORY.md",
    noteHe: "שש קבוצות המדדים עם ההפרדה הכנה מחושב / יעד פיילוט / מבני — הגשר ל-SUBMISSION_METRICS",
  },
  {
    deliverableKey: "metric-levels",
    label: "מבקר המדדים + ארכיטקטורת האנליטיקה (W8-A)",
    route: "/analytics",
    collection: "metricObservations",
    docPath: "docs/ANALYTICS_ARCHITECTURE.md",
    noteHe: "שמונה בדיקות דטרמיניסטיות על הקטלוג והתצפיות — קו-בסיס חסר מדווח, לא מומצא",
  },
  // governance artifacts → the correct-use policy deliverable
  {
    deliverableKey: "correct-use-policy",
    label: "עמוד /governance — מדיניות, סיכונים ותקריות (W8-B)",
    route: "/governance",
    collection: "governancePolicies",
    docPath: "docs/WAVE_8_GOVERNANCE_REPORT.md",
    noteHe: "נוהל השימוש הנכון ממומש כרשומות מדיניות חיות עם גרסאות append-only ואישור בשם",
  },
  // permission/administration artifacts → the correct-use policy deliverable
  {
    deliverableKey: "correct-use-policy",
    label: "עמוד /administration — הרשאות, בקשות שינוי וסקירות גישה (W8-C)",
    route: "/administration",
    collection: "accessChangeRequests",
    docPath: "docs/WAVE_8_PERMISSION_REPORT.md",
    noteHe: "מותר/חובה-לבדוק/אסור נאכף במטריצת ההרשאות — כל שינוי הרשאה עובר במנוע האישורים הקנוני",
  },
  // system-health artifacts → the support-plan deliverable
  {
    deliverableKey: "support-plan",
    label: "עמוד /system-health — 15 בדיקות רכיבים + תצלומי בריאות (W8-D)",
    route: "/system-health",
    collection: "healthSnapshots",
    docPath: "docs/WAVE_8_SYSTEM_HEALTH_REPORT.md",
    noteHe: "שכבת התמיכה נשענת על בדיקות אמיתיות שרצו — רכיב שלא נבדק מדווח «טרם נבדק», לא תקין",
  },
] as const;

/** The additive Wave-8 refs of one deliverable (possibly empty). */
export function wave8EvidenceFor(key: DeliverableKey): Wave8EvidenceRef[] {
  return WAVE8_DELIVERABLE_EVIDENCE.filter((r) => r.deliverableKey === key);
}

/**
 * Honest reviewer summary for a deliverable with Wave-8 refs: the refs are
 * listed AND the approval truth is restated — the deliverable remains
 * "ממתין לאישור אנושי בשם" until the canonical Approval is decided.
 */
export function wave8EvidenceSummaryHe(key: DeliverableKey): string | null {
  const refs = wave8EvidenceFor(key);
  if (refs.length === 0) return null;
  return `${refs.length} ראיות Wave-8 נוספות · התוצר ${WAVE8_PENDING_APPROVAL_HE} עד הכרעת האישור הקנוני`;
}
