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
  BusinessQueryReadiness,
} from "./types";
import { EDGE_REGISTRY } from "../registry/edgeRegistry";
import { ENTITY_REGISTRY } from "../registry/entityRegistry";

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
    // Phase 9 — structurally SUPPORTED: the SERVICED serviceTicket→customerPrinter
    // edge + the typed serviceTicket.faultCategory node-fact now exist in the
    // contracts. INSTANCE-level INSUFFICIENT is returned by the query service when
    // relevant tickets exist but lack customerPrinterId / faultCategory.
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["printerModel", "customerPrinter", "serviceTicket", "customer"],
    requiredRelationships: ["USES", "SERVICED", "OWNS"],
    requiredNodeFacts: ["serviceTicket.faultCategory", "serviceTicket.customerPrinterId"],
    missingFacts: [],
    traversalOps: ["getNeighbors"],
    descriptionHe:
      "תקלות שירות חוזרות לפי דגם מדפסת — לפי הקשר קנוני קריאת שירות → מדפסת ומחלקה טיפוסית של תקלה",
  },
  findDelayedEnrollments: {
    query: "findDelayedEnrollments",
    // Phase 9 — structurally SUPPORTED: the enrollment stage-progress projection
    // (earliest OPEN-stage due + open-stage count) is now derived onto the node.
    // INSTANCE-level INSUFFICIENT is returned when an enrollment carries no
    // stage/due facts — delay is NEVER inferred from age.
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["enrollment", "course", "student"],
    requiredRelationships: ["ENROLLED_IN", "RELATED_TO"],
    requiredNodeFacts: ["enrollment.enrollmentStageFactsPresent", "enrollment.enrollmentEarliestOpenStageDue"],
    missingFacts: [],
    traversalOps: ["getNode", "getNeighbors"],
    descriptionHe:
      "הרשמות בפיגור — לפי תאריך יעד של שלב פתוח מול asOf; פיגור לעולם אינו מוסק מגיל ההרשמה בלבד",
  },
  assessPrinterModelSupportImpact: {
    query: "assessPrinterModelSupportImpact",
    // Phase 9 — structurally SUPPORTED via INBOUND impact traversal: the existing
    // customerPrinter→printerModel USES edge is walked inbound (no inverse edge is
    // created), reaching the printers/customers/tickets/tasks that depend on it.
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["printerModel", "customerPrinter", "customer", "serviceTicket", "task"],
    requiredRelationships: ["USES", "OWNS", "SERVICED", "RELATED_TO"],
    requiredNodeFacts: [],
    missingFacts: [],
    traversalOps: ["calculateImpact"],
    descriptionHe:
      "השפעת סיום תמיכה בדגם מדפסת — מדפסות/לקוחות/קריאות/משימות מושפעות (ישיר מול עקיף) לפי מעבר נכנס על קשת USES",
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
    // Phase 9 — structurally SUPPORTED: an aiRecommendation→task GENERATED_TASK
    // edge (from Task.sourceRecommendationId) now exists, and the approved
    // APPROVED_BY hop carries the human decider as the approval node's ownerRef.
    // INSTANCE-level INSUFFICIENT when no approved+human-decided approval is seen.
    baselineReadiness: "SUPPORTED",
    requiredEntities: ["aiRecommendation", "approval", "task"],
    requiredRelationships: ["APPROVED_BY", "GENERATED_TASK"],
    requiredNodeFacts: ["approval.status"],
    missingFacts: [],
    traversalOps: ["calculateImpact"],
    descriptionHe:
      "משימות שנוצרו מהמלצות מאושרות — נתיב המלצה → אישור אנושי מאושר → משימה שנוצרה",
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

const REGISTERED_RELATIONSHIP_TYPES: ReadonlySet<string> = new Set(
  EDGE_REGISTRY.map((e) => e.relationshipType),
);

/**
 * The STRUCTURAL readiness of a query — evaluated against the CONTRACTS/registry,
 * NOT against whether a fixture happens to contain a record or edge. A query is
 * structurally SUPPORTED when every required entity is a graph-eligible node type
 * and every required relationship type is a registered edge; otherwise UNSUPPORTED.
 * This is the capability floor; the query SERVICE independently downgrades to
 * INSUFFICIENT_GRAPH_DATA when the required canonical FACTS are absent at runtime.
 */
export function evaluateStructuralReadiness(cap: BusinessQueryCapability): BusinessQueryReadiness {
  const entitiesOk = cap.requiredEntities.every((t) => ENTITY_REGISTRY[t]?.graphEligible === true);
  const relationshipsOk = cap.requiredRelationships.every((r) => REGISTERED_RELATIONSHIP_TYPES.has(r));
  return entitiesOk && relationshipsOk ? "SUPPORTED" : "UNSUPPORTED";
}
