// TERAGON Business Graph — Phase 7 BUSINESS QUERY barrel.
// The internal, typed, evidence-backed business-query pack that sits STRICTLY ON
// TOP of the read-only traversal service. No app/UI/HTTP/agent wiring lives here.
export { BusinessGraphQueryService } from "./service";
export type { BusinessQueryServiceOptions } from "./service";

export {
  BUSINESS_QUERY_NAMES,
  businessQueryNameSchema,
  BUSINESS_QUERY_READINESS_STATES,
  BUSINESS_QUERY_REASON_CODES,
  BUSINESS_RELATIONSHIP_KINDS,
  businessQueryRequestSchema,
} from "./types";
export type {
  BusinessQueryName,
  BusinessQueryReadiness,
  BusinessQueryReasonCode,
  BusinessRelationshipKind,
  BusinessQueryEvidence,
  BusinessQuerySourceConfidence,
  BusinessEntityReference,
  BusinessQueryFinding,
  BusinessQueryPolicy,
  BusinessQueryCapability,
  BusinessQueryAuditRecord,
  BusinessQueryCounts,
  BusinessQueryRequest,
  BusinessQueryResult,
} from "./types";

export {
  BUSINESS_QUERY_CAPABILITIES,
  BUSINESS_QUERY_CAPABILITY_ENTRIES,
} from "./capabilities";

export {
  BUSINESS_QUERY_POLICY_VERSION,
  DEFAULT_THRESHOLD_DAYS,
  subtractCalendarDays,
  resolvePolicy,
  TERMINAL_TASK_STATUSES,
  isOpenTaskStatus,
  CLOSED_OPPORTUNITY_STAGES,
  isOpenOpportunityStage,
  UNANSWERED_QUOTATION_STATUSES,
  isUnansweredQuotationStatus,
  isPendingQuotationStatus,
} from "./policy";
