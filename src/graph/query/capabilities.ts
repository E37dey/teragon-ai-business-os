// TERAGON Business Graph — Phase 7 BUSINESS QUERY capability registry.
// ---------------------------------------------------------------------------
// One entry PER query documenting: the baseline readiness against the 15-entity
// spine AS SHIPPED, the entities/relationships/node-facts it needs, and — as
// STRUCTURED DATA — every missing node/edge/metadata fact required for full
// support (`missingFacts`), so a human can lift the gaps straight into docs. A
// query MUST return an honest readiness when a required fact is absent; this
// registry records WHY. No entry claims SUPPORTED by fabricating data.
import type {
  BusinessQueryCapability,
  BusinessQueryName,
} from "./types";

export const BUSINESS_QUERY_CAPABILITIES: Record<BusinessQueryName, BusinessQueryCapability> = {
  findCustomersNeedingFollowUp: {
    query: "findCustomersNeedingFollowUp",
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["customer", "task", "opportunity", "quotation"],
    requiredRelationships: ["RELATED_TO", "QUOTED_FOR"],
    requiredNodeFacts: ["task.status", "opportunity.stage", "quotation.status"],
    // follow-up NEED is proven by an authoritative open task / open opportunity;
    // richer SLA prioritisation would need these facts (absent from the spine).
    missingFacts: [
      "task.dueDate (no due-date / SLA field on the task envelope)",
      "task.followUpType (no typed follow-up classification)",
      "customer.lastContactedAt (no last-touch timestamp on the customer envelope)",
    ],
    traversalOps: ["getNeighbors"],
    descriptionHe:
      "לקוחות עם משימת מעקב פתוחה או הזדמנות פתוחה — נתיב הראיה מסביר מדוע נדרש מעקב",
  },
  findUnansweredQuotations: {
    query: "findUnansweredQuotations",
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["quotation", "customer", "opportunity", "task"],
    requiredRelationships: ["QUOTED_FOR", "RELATED_TO"],
    requiredNodeFacts: ["quotation.status", "quotation.createdAt"],
    // status + createdAt exist; a precise "sent/last-responded" instant would
    // sharpen the age cutoff but is not on the envelope.
    missingFacts: [
      "quotation.sentAt (age is measured from createdAt — no explicit send instant)",
      "quotation.lastCustomerResponseAt (no response-timestamp to distinguish silence from activity)",
    ],
    traversalOps: ["getNeighbors"],
    descriptionHe:
      "הצעות מחיר שנשלחו ולא נענו מעבר לחתך גיל דטרמיניסטי (asOf − N ימים)",
  },
  findRecurringServiceIssues: {
    query: "findRecurringServiceIssues",
    baselineReadiness: "INSUFFICIENT_GRAPH_DATA",
    requiredEntities: ["printerModel", "customerPrinter", "serviceTicket", "customer"],
    requiredRelationships: ["USES", "SERVICED"],
    requiredNodeFacts: ["serviceTicket.status"],
    // the SPINE HAS NO EDGE from a serviceTicket to the customerPrinter / printerModel
    // it concerns (SERVICED points ticket→customer only), so tickets cannot be
    // grouped by printer to detect recurrence. This is the honest blocker.
    missingFacts: [
      "edge serviceTicket→customerPrinter (no relationship ties a ticket to the printer it concerns)",
      "edge serviceTicket→printerModel (no direct ticket→model relationship)",
      "serviceTicket.faultCode / serviceTicket.category (no fault taxonomy to define 'recurring' beyond raw count)",
    ],
    traversalOps: ["getNeighbors"],
    descriptionHe:
      "תקלות שירות חוזרות לפי דגם מדפסת — דורש קשר בין קריאת שירות למדפסת/דגם",
  },
  findDelayedEnrollments: {
    query: "findDelayedEnrollments",
    baselineReadiness: "INSUFFICIENT_GRAPH_DATA",
    requiredEntities: ["enrollment", "course", "student"],
    requiredRelationships: ["ENROLLED_IN", "RELATED_TO"],
    requiredNodeFacts: ["enrollment.progress", "enrollment.dueDate", "enrollment.expectedStage"],
    // the enrollment envelope carries paymentStatus only — NO stage-progress and
    // NO due-date facts. Delay MUST NOT be inferred from enrollment age alone.
    missingFacts: [
      "enrollment.progress / stageProgress (stages are embedded in Enrollment.stages, not projected onto the node)",
      "enrollment.dueDate / expectedCompletionAt (no schedule field on the envelope)",
      "enrollment.expectedStage (no target-stage-by-date fact to compare actual against)",
    ],
    traversalOps: ["getNode", "getNeighbors"],
    descriptionHe:
      "הרשמות בפיגור — דורש עובדות התקדמות/תאריך יעד; פיגור לעולם אינו מוסק מגיל ההרשמה בלבד",
  },
  assessPrinterModelSupportImpact: {
    query: "assessPrinterModelSupportImpact",
    baselineReadiness: "INSUFFICIENT_GRAPH_DATA",
    requiredEntities: ["printerModel", "customerPrinter", "customer", "serviceTicket", "task"],
    requiredRelationships: ["USES", "OWNS", "SERVICED"],
    requiredNodeFacts: [],
    // calculateImpact is OUTBOUND; USES is oriented customerPrinter→printerModel,
    // so a printerModel has no outbound impact edges and cannot propagate to the
    // printers/customers that depend on it without a model→printer "affects" edge.
    missingFacts: [
      "edge printerModel→customerPrinter (USES is oriented printer→model; impact needs an outbound model→printer / AFFECTS edge)",
      "operational-consequence fields (no downtime/severity facts — consequences are NOT invented)",
    ],
    traversalOps: ["calculateImpact"],
    descriptionHe:
      "השפעת סיום תמיכה בדגם מדפסת — מדפסות/לקוחות/קריאות/משימות מושפעות, ישירות ועקיפות (חסום ללא קשת יוצאת מהדגם)",
  },
  findSupersededEvidence: {
    query: "findSupersededEvidence",
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["memoryRecord", "knowledgeArticle"],
    requiredRelationships: ["SUPERSEDES"],
    requiredNodeFacts: [],
    missingFacts: [
      "evidence.supersededAt (SUPERSEDES has no explicit transition timestamp; current-vs-historical is inferred from edge direction only)",
    ],
    traversalOps: ["findConflicts"],
    descriptionHe:
      "ראיות שהוחלפו — הבחנה בין ראיה נוכחית להיסטורית לפי קשת SUPERSEDES ומטא-נתוני מחזור חיים",
  },
  findRecommendationConflicts: {
    query: "findRecommendationConflicts",
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["aiRecommendation"],
    requiredRelationships: ["CONTRADICTS", "SUPERSEDES"],
    requiredNodeFacts: [],
    // conflicts come ONLY from a registered CONTRADICTS/SUPERSEDES relationship —
    // never from semantic/keyword/AI inference over recommendation contents.
    missingFacts: [
      "edge aiRecommendation⇄aiRecommendation CONTRADICTS (must be registered explicitly; the spine ships none — no inference is permitted)",
    ],
    traversalOps: ["findConflicts"],
    descriptionHe:
      "המלצות סותרות — רק לפי קשת רשומה (CONTRADICTS) או מצב סמכותי לא-תואם, ללא הסקה סמנטית",
  },
  findTasksFromApprovedRecommendations: {
    query: "findTasksFromApprovedRecommendations",
    baselineReadiness: "INSUFFICIENT_GRAPH_DATA",
    requiredEntities: ["aiRecommendation", "approval", "task"],
    requiredRelationships: ["APPROVED_BY", "GENERATED_TASK"],
    requiredNodeFacts: ["approval.status"],
    // the spine ships an APPROVED_BY edge that is NOT marked approved (so it is
    // not traversable), the approval node carries no NAMED-HUMAN approver, and
    // GENERATED_TASK originates from an agentRun rather than the recommendation.
    missingFacts: [
      "APPROVED_BY edge.approvalState = approved (spine edge is not approval-marked, so it is not a valid hop)",
      "approval → named-human approver reference (approval node has no approver identity edge/field)",
      "edge aiRecommendation→task (GENERATED_TASK originates at agentRun, not the recommendation, so rec→task is not walkable outbound)",
    ],
    traversalOps: ["calculateImpact"],
    descriptionHe:
      "משימות שנוצרו מהמלצות מאושרות — דורש נתיב המלצה → אישור אנושי בשם → משימה שנוצרה",
  },
  buildFullEvidencePath: {
    query: "buildFullEvidencePath",
    baselineReadiness: "SUPPORTED",
    requiredEntities: [],
    requiredRelationships: [],
    requiredNodeFacts: [],
    missingFacts: [],
    traversalOps: ["findPath"],
    descriptionHe:
      "נתיב ראיה מלא — חסום, מסונן-הרשאות ומתויג-מקור; גופים מוגנים נשארים בלתי-נפתחים",
  },
};

/** The 9 capabilities as an ordered array (stable order = BUSINESS_QUERY_NAMES). */
export const BUSINESS_QUERY_CAPABILITY_ENTRIES: readonly BusinessQueryCapability[] = Object.values(
  BUSINESS_QUERY_CAPABILITIES,
);
