// TERAGON Business Graph — derivation types (Phase 3, PURE derivation only).
// The vocabulary + result envelope for turning canonical records into graph
// nodes/edges. Everything here is data: the derivation functions are pure and
// deterministic — they never read a repository, a clock, or randomness. All
// runtime facts arrive through a caller-supplied `lookup` oracle and a
// clock-free `GraphDerivationContext`.
import type { GraphEntityType } from "../contracts/identity";
import type { BusinessGraphNode } from "../contracts/node";
import type { BusinessGraphEdge, GraphRelationshipType } from "../contracts/edge";

// ---------------------------------------------------------------------------
// issue vocabulary (closed)
// ---------------------------------------------------------------------------

/**
 * The CLOSED set of reasons a derivation step refused to (or could not fully)
 * produce an authoritative node/edge. Every code carries a fixed severity and a
 * Hebrew reason/remediation (see makeIssue).
 */
export const DERIVATION_ISSUE_CODES = [
  "MISSING_ORGANIZATION",
  "MISSING_TARGET",
  "AMBIGUOUS_REFERENCE",
  "MALFORMED_REFERENCE",
  "UNSUPPORTED_REFERENCE",
  "CROSS_ORGANIZATION",
  "INELIGIBLE_TARGET",
  "ARCHIVED_SOURCE",
  "SUPERSEDED_SOURCE",
  "DUPLICATE_EDGE",
  "ORPHAN_NODE",
  "SENSITIVITY_BLOCKED",
  "NON_AUTHORITATIVE_SOURCE",
  "ORG_SCOPE_INHERITED",
  "EXCLUDED_ENTITY",
  "UNMAPPABLE_ENTITY",
  "DANGLING_ENDPOINT",
] as const;

export type DerivationIssueCode = (typeof DERIVATION_ISSUE_CODES)[number];

export type DerivationSeverity = "error" | "warning" | "info";

export interface GraphDerivationIssue {
  code: DerivationIssueCode;
  sourceEntityType: GraphEntityType;
  sourceEntityId: string;
  field?: string;
  attemptedRelationship?: GraphRelationshipType;
  severity: DerivationSeverity;
  reasonHe: string;
  safeRemediationHe: string;
  /** whether the surrounding record may still be (partially) indexed */
  indexingMayContinue: boolean;
}

export interface GraphUnmappableRecord {
  entityType: GraphEntityType;
  entityId: string;
  reason: DerivationIssueCode;
  detailHe: string;
}

// ---------------------------------------------------------------------------
// derivation status (coverage commitment for ALL 37 entity types)
// ---------------------------------------------------------------------------

export const DERIVATION_STATUSES = [
  "IMPLEMENTED",
  "DEFERRED",
  "EXCLUDED",
  "UNMAPPABLE",
] as const;

export type DerivationStatus = (typeof DERIVATION_STATUSES)[number];

/**
 * Every one of the 37 GraphEntityTypes has an explicit status — no type
 * disappears silently. The 15 Core-V1 spine types are IMPLEMENTED (node + its
 * priority edges). Protected, agent-hard-banned raw-content stores are EXCLUDED
 * from Phase-3 derivation; the remaining supporting types are DEFERRED (a
 * generic node is derivable, but their edges are not committed this phase).
 */
export const DERIVATION_STATUS: Record<GraphEntityType, DerivationStatus> = {
  // --- Core-V1 spine (IMPLEMENTED: node + priority edges) ---
  customer: "IMPLEMENTED",
  lead: "IMPLEMENTED",
  opportunity: "IMPLEMENTED",
  quotation: "IMPLEMENTED",
  customerPrinter: "IMPLEMENTED",
  printerModel: "IMPLEMENTED",
  serviceTicket: "IMPLEMENTED",
  knowledgeArticle: "IMPLEMENTED",
  aiRecommendation: "IMPLEMENTED",
  approval: "IMPLEMENTED",
  task: "IMPLEMENTED",
  agentRun: "IMPLEMENTED",
  course: "IMPLEMENTED",
  enrollment: "IMPLEMENTED",
  memoryRecord: "IMPLEMENTED",
  // --- excluded: protected raw-content / agent-hard-banned (no derivation) ---
  auditEvent: "EXCLUDED",
  agentEvent: "EXCLUDED",
  // --- deferred: node derivable generically, edges not committed this phase ---
  organization: "DEFERRED",
  user: "DEFERRED",
  role: "DEFERRED",
  contact: "DEFERRED",
  product: "DEFERRED",
  repairAction: "DEFERRED",
  student: "DEFERRED",
  document: "DEFERRED",
  automation: "DEFERRED",
  automationRun: "DEFERRED",
  agent: "DEFERRED",
  learningObservation: "DEFERRED",
  learningProposal: "DEFERRED",
  learningRule: "DEFERRED",
  metricDefinition: "DEFERRED",
  metricObservation: "DEFERRED",
  governancePolicy: "DEFERRED",
  governanceRisk: "DEFERRED",
  governanceIncident: "DEFERRED",
  submissionDeliverable: "DEFERRED",
};

// ---------------------------------------------------------------------------
// context (NO clock, NO randomness)
// ---------------------------------------------------------------------------

export interface GraphDerivationContext {
  organizationId: string;
  registryVersion: string;
  sourceSnapshotVersion: string;
  /** when true, a record with no own organization may adopt context.organizationId */
  allowOrgInheritance?: boolean;
}

// ---------------------------------------------------------------------------
// lookup oracle (caller-supplied existence/eligibility — never a repository)
// ---------------------------------------------------------------------------

export interface GraphLookupTarget {
  organizationId?: string | null;
  archived?: boolean;
  superseded?: boolean;
  rejected?: boolean;
  status?: string | null;
  [key: string]: unknown;
}

export interface GraphDerivationLookup {
  exists(entityType: GraphEntityType, entityId: string): boolean;
  get(entityType: GraphEntityType, entityId: string): GraphLookupTarget | undefined;
}

/** A canonical record is an opaque bag of fields — read defensively, never cast. */
export type CanonicalRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// stats + result envelope
// ---------------------------------------------------------------------------

export interface GraphDerivationStats {
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  edgesByProvenance: Record<string, number>;
  edgesByAuthority: Record<string, number>;
  issuesBySeverity: Record<DerivationSeverity, number>;
  unmappable: number;
  duplicateEdges: number;
  orphanReferences: number;
}

export interface GraphDerivationResult {
  nodes: BusinessGraphNode[];
  edges: BusinessGraphEdge[];
  issues: GraphDerivationIssue[];
  unmappableRecords: GraphUnmappableRecord[];
  duplicateEdges: BusinessGraphEdge[];
  orphanReferences: GraphDerivationIssue[];
  stats: GraphDerivationStats;
  registryVersion: string;
  sourceSnapshotVersion: string;
}

// ---------------------------------------------------------------------------
// per-function return shapes
// ---------------------------------------------------------------------------

export interface DeriveNodeOutcome {
  node?: BusinessGraphNode;
  issues: GraphDerivationIssue[];
  unmappable?: GraphUnmappableRecord;
}

export interface DeriveEdgesOutcome {
  edges: BusinessGraphEdge[];
  issues: GraphDerivationIssue[];
}
