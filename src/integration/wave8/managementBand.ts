// W8-E — Phase 8.13: the Command-Center MANAGEMENT BAND derivation.
// Seven attention items, ALL derived from real records/catalogues, each with a
// click-through route to the owning screen. Nothing here duplicates the
// existing KPI cards (leads/pipeline/revenue/tickets/approvals/courses) —
// these are the Wave-8 management surfaces: risk, governance, access,
// health, measurement, policy and submission approvals.
import type { Approval, BaseEntity, ISODate } from "@/domain/types";
import type {
  GovernanceIncident,
  GovernancePolicy,
  GovernanceRisk,
} from "@/domain/governance";
import type { AccessReviewRecord } from "@/domain/administration";
import type { SystemHealthSnapshot } from "@/domain/system-health";
import { REGISTRY_DELIVERABLE_KEYS } from "@/domain/submission/contentRegistry";
import { approvalSubjectRef } from "@/domain/submission/readiness";
import { SUBMISSION_METRICS } from "@/domain/submission/metricLevels";
import { splitGovernanceIncidents } from "./healthIncidents";

/** policy is "expiring" when nextReviewAt falls inside this window */
export const POLICY_EXPIRY_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

export interface ManagementBandItem {
  key:
    | "operational-risks"
    | "critical-incidents"
    | "pending-access-reviews"
    | "health-attention"
    | "missing-baselines"
    | "expiring-policies"
    | "submission-approvals";
  titleHe: string;
  /** null ⇔ honestly unmeasured (e.g. no health check ever ran) */
  count: number | null;
  detailHe: string;
  route: string;
  /** ids of the actual records behind the count (click-through targets) */
  recordIds: string[];
  attention: boolean;
}

export interface ManagementBandInput {
  risks: readonly GovernanceRisk[];
  /** the RAW governanceIncidents collection (governance + health shapes) */
  incidents: readonly BaseEntity[];
  accessReviews: readonly AccessReviewRecord[];
  healthSnapshots: readonly SystemHealthSnapshot[];
  approvals: readonly Approval[];
  policies: readonly GovernancePolicy[];
  nowISO: ISODate;
}

const CLOSED_RISK_STATES = new Set(["נסגר", "הופחת"]);

/** deterministic: same records + same clock ⇒ same band */
export function deriveManagementBand(input: ManagementBandInput): ManagementBandItem[] {
  const nowMs = Date.parse(input.nowISO);

  // 1 — active operational risks (governance risk register, not closed/mitigated)
  const openRisks = input.risks.filter((r) => !CLOSED_RISK_STATES.has(r.status));
  const criticalOpenRisks = openRisks.filter((r) => r.severity === "קריטית").length;

  // 2 — critical governance incidents (governance shape only, not closed)
  const { governance: governanceIncidents } = splitGovernanceIncidents(input.incidents);
  const criticalIncidents = governanceIncidents.filter(
    (i: GovernanceIncident) => i.status !== "סגור" && (i.severity === "קריטית" || i.severity === "גבוהה"),
  );

  // 3 — pending access reviews (administration)
  const pendingReviews = input.accessReviews.filter((r) => r.status === "ממתין");

  // 4 — health components needing attention, from the LATEST snapshot only;
  //     no snapshot ⇒ honestly unmeasured (count null), never 0
  const latestSnapshot = [...input.healthSnapshots].sort((a, b) =>
    b.takenAt.localeCompare(a.takenAt),
  )[0];
  const attentionComponents = latestSnapshot
    ? latestSnapshot.components.filter(
        (c) => c.state === "דורש תשומת לב" || c.state === "לא זמין",
      )
    : null;

  // 5 — computable metrics without a defined baseline (submission catalogue)
  const missingBaselines = SUBMISSION_METRICS.filter((m) => m.baseline === null);

  // 6 — active policies whose review date passed or falls inside the window
  const expiringPolicies = input.policies.filter(
    (p) =>
      p.status === "פעילה" &&
      p.nextReviewAt !== null &&
      Date.parse(p.nextReviewAt) <= nowMs + POLICY_EXPIRY_WINDOW_DAYS * DAY_MS,
  );

  // 7 — submission deliverables still awaiting the NAMED human approval
  //     (canonical Approval records with subjectRef submission-deliverable:<key>)
  const pendingDeliverableKeys = REGISTRY_DELIVERABLE_KEYS.filter((key) => {
    const subject = approvalSubjectRef(key);
    const matching = input.approvals
      .filter((a) => a.subjectRef === subject)
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id));
    const latest = matching[matching.length - 1];
    return latest === undefined || latest.status !== "אושר";
  });

  return [
    {
      key: "operational-risks",
      titleHe: "סיכונים תפעוליים פעילים",
      count: openRisks.length,
      detailHe:
        openRisks.length === 0
          ? "אין סיכונים פתוחים ברשם הסיכונים"
          : `${openRisks.length} סיכונים פתוחים (${criticalOpenRisks} קריטיים) — רשם הסיכונים`,
      route: "/governance",
      recordIds: openRisks.map((r) => r.id),
      attention: openRisks.length > 0,
    },
    {
      key: "critical-incidents",
      titleHe: "תקריות ממשל חמורות",
      count: criticalIncidents.length,
      detailHe:
        criticalIncidents.length === 0
          ? "אין תקריות פתוחות בחומרה גבוהה/קריטית"
          : `${criticalIncidents.length} תקריות פתוחות בחומרה גבוהה/קריטית`,
      route: "/governance",
      recordIds: criticalIncidents.map((i) => i.id),
      attention: criticalIncidents.length > 0,
    },
    {
      key: "pending-access-reviews",
      titleHe: "סקירות גישה ממתינות",
      count: pendingReviews.length,
      detailHe:
        pendingReviews.length === 0
          ? "כל סקירות הגישה הוכרעו"
          : `${pendingReviews.length} סקירות גישה תקופתיות ממתינות להכרעה`,
      route: "/administration",
      recordIds: pendingReviews.map((r) => r.id),
      attention: pendingReviews.length > 0,
    },
    {
      key: "health-attention",
      titleHe: "רכיבי בריאות הדורשים טיפול",
      count: attentionComponents === null ? null : attentionComponents.length,
      detailHe:
        attentionComponents === null
          ? "טרם הורצה בדיקת בריאות — אין תצלום; לא מדווח מצב שלא נמדד"
          : attentionComponents.length === 0
            ? `כל ${latestSnapshot?.components.length ?? 0} הרכיבים שנבדקו תקינים/מוגבלים`
            : `${attentionComponents.length} רכיבים במצב «דורש תשומת לב»/«לא זמין» בתצלום האחרון`,
      route: "/system-health",
      recordIds: attentionComponents === null ? [] : attentionComponents.map((c) => c.componentId),
      attention: attentionComponents !== null && attentionComponents.length > 0,
    },
    {
      key: "missing-baselines",
      titleHe: "מדדים ללא קו בסיס",
      count: missingBaselines.length,
      detailHe:
        missingBaselines.length === 0
          ? "לכל המדדים הוגדר קו בסיס"
          : `${missingBaselines.length} מדדים בקטלוג ללא קו בסיס — השוואת לפני/אחרי אינה אפשרית`,
      route: "/analytics",
      recordIds: missingBaselines.map((m) => m.key),
      attention: missingBaselines.length > 0,
    },
    {
      key: "expiring-policies",
      titleHe: "מדיניות שתוקפה קרב",
      count: expiringPolicies.length,
      detailHe:
        expiringPolicies.length === 0
          ? `אין מדיניות פעילה שמועד הסקירה שלה בתוך ${POLICY_EXPIRY_WINDOW_DAYS} יום`
          : `${expiringPolicies.length} מדיניות פעילה עם מועד סקירה שחלף או בתוך ${POLICY_EXPIRY_WINDOW_DAYS} יום`,
      route: "/governance",
      recordIds: expiringPolicies.map((p) => p.id),
      attention: expiringPolicies.length > 0,
    },
    {
      key: "submission-approvals",
      titleHe: "אישורי הגשה ממתינים",
      count: pendingDeliverableKeys.length,
      detailHe:
        pendingDeliverableKeys.length === 0
          ? "כל 12 התוצרים אושרו במנוע הקנוני"
          : `${pendingDeliverableKeys.length} תוצרי הגשה ממתינים לאישור אנושי בשם`,
      route: "/submission",
      recordIds: [...pendingDeliverableKeys],
      attention: pendingDeliverableKeys.length > 0,
    },
  ];
}
