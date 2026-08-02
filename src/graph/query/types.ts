// TERAGON Business Graph — Phase 7 BUSINESS QUERY types (internal, typed).
// ---------------------------------------------------------------------------
// The vocabulary for the internal, evidence-backed business-query pack that sits
// STRICTLY ON TOP of the read-only Phase 6/6.1 traversal service. Every business
// query goes THROUGH BusinessGraphTraversalService — nothing here reads a node
// body, bypasses traversal security, or re-implements BFS. A finding is an
// envelope-safe, provenance-labelled projection of what traversal returned AFTER
// its own security filtering; inaccessible entities are already gone before any
// count is taken. Zod guards the request BOUNDARY only.
import { z } from "zod";
import type { GraphNodeId, GraphEntityType, GraphEntityRef } from "../contracts/identity";
import type {
  GraphProvenance,
  GraphAuthority,
  GraphEdgeApprovalState,
  GraphRelationshipType,
} from "../contracts/edge";
import type { GraphSensitivity } from "../contracts/node";
import type { GraphIndexHealthState } from "../store/contracts";
import type {
  GraphPath,
  GraphTruncationState,
  GraphQueryAuditRecord,
  GraphTraversalOperation,
} from "../traversal/types";
import { graphNodeIdSchema } from "../contracts/identity";

// ---------------------------------------------------------------------------
// query names (closed — the 9 typed internal queries)
// ---------------------------------------------------------------------------

export const BUSINESS_QUERY_NAMES = [
  "findCustomersNeedingFollowUp",
  "findUnansweredQuotations",
  "findRecurringServiceIssues",
  "findDelayedEnrollments",
  "assessPrinterModelSupportImpact",
  "findSupersededEvidence",
  "findRecommendationConflicts",
  "findTasksFromApprovedRecommendations",
  "buildFullEvidencePath",
] as const;
export type BusinessQueryName = (typeof BUSINESS_QUERY_NAMES)[number];
export const businessQueryNameSchema = z.enum(BUSINESS_QUERY_NAMES);

// ---------------------------------------------------------------------------
// readiness (honest data-gap state)
// ---------------------------------------------------------------------------

export const BUSINESS_QUERY_READINESS_STATES = [
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "INSUFFICIENT_GRAPH_DATA",
  "BLOCKED_BY_PERMISSION",
  "BLOCKED_BY_HEALTH",
  "UNSUPPORTED",
] as const;
export type BusinessQueryReadiness = (typeof BUSINESS_QUERY_READINESS_STATES)[number];

// ---------------------------------------------------------------------------
// typed reason codes (why a finding exists) — NEVER free-text, NEVER inferred
// ---------------------------------------------------------------------------

export const BUSINESS_QUERY_REASON_CODES = [
  "OPEN_FOLLOW_UP_TASK",
  "OPEN_OPPORTUNITY",
  "PENDING_QUOTATION_LINK",
  "UNANSWERED_QUOTATION_AGED",
  "RECURRING_SERVICE_ISSUE",
  "DELAYED_ENROLLMENT",
  "PRINTER_MODEL_IMPACT_DIRECT",
  "PRINTER_MODEL_IMPACT_INDIRECT",
  "SUPERSEDED_EVIDENCE_HISTORICAL",
  "CURRENT_EVIDENCE",
  "REGISTERED_CONTRADICTION",
  "REGISTERED_SUPERSEDES_CONFLICT",
  "APPROVED_RECOMMENDATION_TASK",
  "EVIDENCE_PATH",
] as const;
export type BusinessQueryReasonCode = (typeof BUSINESS_QUERY_REASON_CODES)[number];

// ---------------------------------------------------------------------------
// direct-vs-indirect relationship classification of a finding
// ---------------------------------------------------------------------------

export const BUSINESS_RELATIONSHIP_KINDS = ["DIRECT", "INDIRECT", "MIXED", "NONE"] as const;
export type BusinessRelationshipKind = (typeof BUSINESS_RELATIONSHIP_KINDS)[number];

// ---------------------------------------------------------------------------
// evidence reference (envelope-safe; protected bodies remain UNOPENED)
// ---------------------------------------------------------------------------

/**
 * One piece of supporting evidence for a finding. It carries a node/entity
 * reference plus the provenance/authority/approval facts of the hop that reached
 * it — never a body. `bodyOpened` is a CONSTANT false: the query layer never
 * resolves a protected payload.
 */
export interface BusinessQueryEvidence {
  nodeId: GraphNodeId;
  entityType: GraphEntityType;
  entityRef: GraphEntityRef;
  provenance: GraphProvenance;
  authority: GraphAuthority;
  approvalState: GraphEdgeApprovalState | null;
  relationshipType: GraphRelationshipType | null;
  direct: boolean;
  /** the reached node's sensitivity when known; null when only a path id is available */
  sensitivity: GraphSensitivity | null;
  path: GraphPath;
  /** always false — the business-query layer NEVER opens a protected body */
  bodyOpened: false;
}

// ---------------------------------------------------------------------------
// canonical-source confidence (surfaced ONLY if it already exists as an
// approved source field — the query NEVER invents an AI confidence score)
// ---------------------------------------------------------------------------

export interface BusinessQuerySourceConfidence {
  value: number;
  /** the canonical source field this confidence was copied from (kept as ref) */
  sourceRef: GraphEntityRef;
  sourceField: string;
}

// ---------------------------------------------------------------------------
// finding
// ---------------------------------------------------------------------------

/** A business entity reference carried on a finding (node id + type + ref). */
export interface BusinessEntityReference {
  nodeId: GraphNodeId;
  entityType: GraphEntityType;
  entityRef: GraphEntityRef;
}

/**
 * One evidence-backed finding. Carries EVERY field the Phase-7 contract requires:
 * org, snapshot, health, staleness, the query execution id, the business entity
 * references, typed reason codes, supporting paths, evidence, provenance /
 * authority / approval summaries, the direct-vs-indirect classification, the
 * truncation state, and the applied policyVersion. No natural-language fact and
 * no invented confidence ever appears here.
 */
export interface BusinessQueryFinding {
  organizationId: string;
  snapshotId: string | null;
  graphHealth: GraphIndexHealthState;
  stale: boolean;
  queryExecutionId: string;
  subject: BusinessEntityReference;
  relatedEntities: BusinessEntityReference[];
  reasonCodes: BusinessQueryReasonCode[];
  supportingPaths: GraphPath[];
  evidence: BusinessQueryEvidence[];
  provenanceSummary: GraphProvenance[];
  authoritySummary: GraphAuthority[];
  approvalStateSummary: GraphEdgeApprovalState[];
  relationshipKind: BusinessRelationshipKind;
  truncated: GraphTruncationState;
  policyVersion: string;
  /** present ONLY when a canonical, approved source confidence field exists */
  sourceConfidence: BusinessQuerySourceConfidence | null;
}

// ---------------------------------------------------------------------------
// policy (the applied, recorded cutoff policy)
// ---------------------------------------------------------------------------

/**
 * The applied temporal + threshold policy, recorded on every result. `asOf` is
 * the RESOLVED instant (explicit request value or the injected query clock — no
 * hidden Date.now); `cutoff` is the deterministic calendar-day cutoff
 * (asOf − thresholdDays) or null when the query has no age threshold.
 */
export interface BusinessQueryPolicy {
  policyVersion: string;
  asOf: string;
  thresholdDays: number | null;
  cutoff: string | null;
  cutoffMode: "calendar-day";
}

// ---------------------------------------------------------------------------
// capability registry entry (readiness + structured data-gaps for docs)
// ---------------------------------------------------------------------------

export interface BusinessQueryCapability {
  query: BusinessQueryName;
  /** readiness against the 15-entity spine AS SHIPPED (no augmentation) */
  baselineReadiness: BusinessQueryReadiness;
  requiredEntities: readonly GraphEntityType[];
  requiredRelationships: readonly GraphRelationshipType[];
  /** node-envelope metadata fields the query needs for FULL support */
  requiredNodeFacts: readonly string[];
  /**
   * Every missing node/edge/metadata fact required for full support — structured
   * so a human can lift it verbatim into docs. Empty ⇒ fully supported by spine.
   */
  missingFacts: readonly string[];
  /** which traversal operation(s) this query drives */
  traversalOps: readonly GraphTraversalOperation[];
  descriptionHe: string;
}

// ---------------------------------------------------------------------------
// business-query audit record (safe; separate from the traversal audits)
// ---------------------------------------------------------------------------

/**
 * The safe audit record of ONE business query. It is SEPARATE from — and links
 * to — the underlying traversal audit records by their execution ids. It records
 * no raw request content (no subject bodies, no search text): node ids are safe
 * envelope refs, and the query never accepts free text.
 */
export interface BusinessQueryAuditRecord {
  executionId: string;
  query: BusinessQueryName;
  organizationId: string;
  actorKind: string;
  policyVersion: string;
  asOf: string;
  thresholdDays: number | null;
  cutoff: string | null;
  readiness: BusinessQueryReadiness;
  snapshotId: string | null;
  health: GraphIndexHealthState;
  stale: boolean;
  subjectCount: number;
  resultCounts: BusinessQueryCounts;
  truncated: boolean;
  /** execution ids of every underlying traversal operation this query ran */
  traversalExecutionIds: string[];
  safeReason: string | null;
}

export interface BusinessQueryCounts {
  findings: number;
  entities: number;
}

// ---------------------------------------------------------------------------
// request (zod-validated at the boundary)
// ---------------------------------------------------------------------------

export interface BusinessQueryRequest {
  query: BusinessQueryName;
  /** candidate business-entity node ids the query is scoped over */
  subjects?: (GraphNodeId | string)[];
  /** single start node (impact / evidence-path queries) */
  startNodeId?: GraphNodeId | string;
  /** single target node (evidence-path query) */
  targetNodeId?: GraphNodeId | string;
  /** explicit "as of" instant (ISO); when omitted the injected clock supplies it */
  asOf?: string;
  /** deterministic N-day age threshold; when omitted a per-query default applies */
  thresholdDays?: number;
  /** override the policy version stamped on the result */
  policyVersion?: string;
}

export const businessQueryRequestSchema = z
  .object({
    query: businessQueryNameSchema,
    subjects: z.array(graphNodeIdSchema).optional(),
    startNodeId: graphNodeIdSchema.optional(),
    targetNodeId: graphNodeIdSchema.optional(),
    asOf: z.string().min(1).optional(),
    thresholdDays: z.number().int().nonnegative().max(36_500).optional(),
    policyVersion: z.string().min(1).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// result envelope
// ---------------------------------------------------------------------------

export interface BusinessQueryResult {
  /** false ONLY on a hard refusal (invalid context/request or health/permission block) */
  ok: boolean;
  query: BusinessQueryName;
  organizationId: string;
  snapshotId: string | null;
  registryVersion: string | null;
  health: GraphIndexHealthState;
  stale: boolean;
  readiness: BusinessQueryReadiness;
  capability: BusinessQueryCapability;
  policy: BusinessQueryPolicy;
  findings: BusinessQueryFinding[];
  counts: BusinessQueryCounts;
  truncated: boolean;
  /** the missing facts actually encountered on THIS run (subset of capability.missingFacts) */
  missingFacts: string[];
  refusalReason: string | null;
  audit: BusinessQueryAuditRecord;
  /** the audit records of every underlying traversal operation (safe metadata only) */
  traversalAudits: GraphQueryAuditRecord[];
}

// re-export the traversal audit type name for downstream convenience
export type { GraphQueryAuditRecord } from "../traversal/types";
