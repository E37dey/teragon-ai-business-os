// TERAGON Business Graph — traversal types (Phase 6, READ-ONLY traversal).
// ---------------------------------------------------------------------------
// The type vocabulary for the read-only, permission-gated, deterministic graph
// TRAVERSAL layer. Nothing here mutates: a query reads the currently-served
// validated ACTIVE snapshot and returns envelope-safe projections + paths +
// a safe audit record. Zod schemas guard the request/context BOUNDARY (the
// values a caller crosses into the service); the injected permission oracle is
// a function and is checked structurally, not by zod.
import { z } from "zod";
import {
  graphEntityTypeSchema,
  graphNodeIdSchema,
  type GraphEntityType,
  type GraphNodeId,
  type GraphEdgeId,
  type GraphEntityRef,
} from "../contracts/identity";
import {
  graphRelationshipTypeSchema,
  type GraphRelationshipType,
  type GraphProvenance,
  type GraphAuthority,
  type GraphEdgeDirection,
} from "../contracts/edge";
import type { BusinessGraphNode, GraphSensitivity } from "../contracts/node";
import { graphViewerContextSchema, type GraphViewerContext } from "../contracts/security";
import type { ActorRef } from "../contracts/actor";
import type { GraphIndexHealthState } from "../store/contracts";

// ---------------------------------------------------------------------------
// operations
// ---------------------------------------------------------------------------

export const GRAPH_TRAVERSAL_OPERATIONS = [
  "getNode",
  "getNeighbors",
  "findPath",
  "findRelatedEvidence",
  "calculateImpact",
  "findConflicts",
  "searchGraph",
  "getTimeline",
] as const;
export type GraphTraversalOperation = (typeof GRAPH_TRAVERSAL_OPERATIONS)[number];
export const graphTraversalOperationSchema = z.enum(GRAPH_TRAVERSAL_OPERATIONS);

// ---------------------------------------------------------------------------
// query limits (traversal-layer shape — required fields from the brief)
// ---------------------------------------------------------------------------

/**
 * The bounded traversal budget. `allowedEntityTypes` / `allowedRelationshipTypes`
 * of `null` mean "no caller-imposed narrowing" (the internal universe). A caller
 * value may only REDUCE a limit (see resolveLimits): the numeric caps are clamped
 * to the internal hard maxima and the allow-lists are intersected, never widened.
 */
export interface GraphTraversalQueryLimits {
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  maxPaths: number;
  timeoutBudgetMs: number;
  allowedEntityTypes: readonly GraphEntityType[] | null;
  allowedRelationshipTypes: readonly GraphRelationshipType[] | null;
}

export const graphTraversalQueryLimitsInputSchema = z
  .object({
    maxDepth: z.number().int().positive().optional(),
    maxNodes: z.number().int().positive().optional(),
    maxEdges: z.number().int().positive().optional(),
    maxPaths: z.number().int().positive().optional(),
    timeoutBudgetMs: z.number().int().positive().optional(),
    allowedEntityTypes: z.array(graphEntityTypeSchema).optional(),
    allowedRelationshipTypes: z.array(graphRelationshipTypeSchema).optional(),
  })
  .strict();
export type GraphTraversalQueryLimitsInput = z.infer<typeof graphTraversalQueryLimitsInputSchema>;

// ---------------------------------------------------------------------------
// truncation state (WHY a result was cut — a limit, never a security cut)
// ---------------------------------------------------------------------------

export interface GraphTruncationState {
  truncated: boolean;
  byDepth: boolean;
  byNodes: boolean;
  byEdges: boolean;
  byPaths: boolean;
  byTimeout: boolean;
}

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

/**
 * One traversed hop. Carries the edge's real provenance/authority/direction so an
 * INFERRED / non-authoritative hop stays VISIBLY LABELLED in every result.
 */
export interface GraphPathStep {
  edgeId: GraphEdgeId;
  relationshipType: GraphRelationshipType;
  sourceId: GraphNodeId;
  targetId: GraphNodeId;
  provenance: GraphProvenance;
  authority: GraphAuthority;
  direction: GraphEdgeDirection;
}

export interface GraphPath {
  /** node ids along the path, start-first (envelope refs only — never bodies) */
  nodes: GraphNodeId[];
  steps: GraphPathStep[];
  length: number;
}

// ---------------------------------------------------------------------------
// per-operation result payloads
// ---------------------------------------------------------------------------

export interface GraphNeighborView {
  node: BusinessGraphNode;
  via: GraphPathStep;
  direction: "outbound" | "inbound";
}

export interface GraphNeighborResult {
  startNode: BusinessGraphNode;
  neighbors: GraphNeighborView[];
}

export interface GraphEvidenceItem {
  node: BusinessGraphNode;
  path: GraphPath;
  provenance: GraphProvenance;
  authority: GraphAuthority;
  evidenceRefs: GraphEntityRef[];
}

export interface GraphEvidenceResult {
  subjectNodeId: GraphNodeId;
  evidence: GraphEvidenceItem[];
}

export type GraphImpactKind = "DIRECT" | "INDIRECT";

export interface GraphImpactedNode {
  node: BusinessGraphNode;
  distance: number;
  impact: GraphImpactKind;
  path: GraphPath;
}

export interface GraphImpactResult {
  originNodeId: GraphNodeId;
  direct: GraphImpactedNode[];
  indirect: GraphImpactedNode[];
}

export type GraphConflictKind = "CONTRADICTS" | "SUPERSEDES";

export interface GraphConflict {
  kind: GraphConflictKind;
  relationshipType: GraphRelationshipType;
  edgeId: GraphEdgeId;
  sourceNodeId: GraphNodeId;
  targetNodeId: GraphNodeId;
  otherNode: BusinessGraphNode;
  authority: GraphAuthority;
  provenance: GraphProvenance;
}

export interface GraphConflictResult {
  nodeId: GraphNodeId;
  conflicts: GraphConflict[];
}

export type GraphTimelineEventKind =
  | "NODE_CREATED"
  | "NODE_UPDATED"
  | "EDGE_CREATED"
  | "EDGE_VALID_FROM"
  | "EDGE_VALID_UNTIL";

export interface GraphTimelineEvent {
  at: string;
  kind: GraphTimelineEventKind;
  nodeId?: GraphNodeId;
  edgeId?: GraphEdgeId;
  relationshipType?: GraphRelationshipType;
  labelHe: string;
}

export interface GraphTimelineResult {
  nodeId: GraphNodeId;
  events: GraphTimelineEvent[];
}

export interface GraphSearchHit {
  node: BusinessGraphNode;
  score: number;
  matchedField: "title" | "status" | "entityType" | "metadata";
}

export interface GraphSearchResult {
  query: { hash: string | null; classification: string | null };
  hits: GraphSearchHit[];
}

/** The union of all possible operation payloads. */
export type GraphTraversalData =
  | BusinessGraphNode
  | GraphNeighborResult
  | { paths: GraphPath[] }
  | GraphEvidenceResult
  | GraphImpactResult
  | GraphConflictResult
  | GraphSearchResult
  | GraphTimelineResult;

// ---------------------------------------------------------------------------
// audit record (safe metadata ONLY — no bodies / no sensitive field values)
// ---------------------------------------------------------------------------

export interface GraphQueryFilters {
  entityTypes: readonly GraphEntityType[] | null;
  relationshipTypes: readonly GraphRelationshipType[] | null;
  includeInferred: boolean;
  includeUnverified: boolean;
}

export interface GraphQueryResultCounts {
  nodes: number;
  edges: number;
  paths: number;
}

/**
 * The safe, auditable record of one traversal. `queryId` is DETERMINISTIC —
 * derived (SHA-256) from the query identity, never wall-clock/random. Raw search
 * text is NEVER stored: only a `searchTextHash` + a coarse `searchTextClass`.
 */
export interface GraphQueryAuditRecord {
  queryId: string;
  actorRef: ActorRef;
  organizationId: string;
  operation: GraphTraversalOperation;
  snapshotId: string | null;
  requestedLimits: GraphTraversalQueryLimitsInput | null;
  appliedLimits: GraphTraversalQueryLimits;
  filters: GraphQueryFilters;
  resultCounts: GraphQueryResultCounts;
  truncated: GraphTruncationState;
  health: GraphIndexHealthState;
  safeDenialReason: string | null;
  durationBucket: string;
  searchTextHash: string | null;
  searchTextClass: string | null;
}

// ---------------------------------------------------------------------------
// query context (viewer + org + injected permission oracle + query flags)
// ---------------------------------------------------------------------------

/**
 * The caller-injected permission oracle. The traversal layer does NOT hard-couple
 * to the RBAC/agent modules — it asks these two questions at the START node and at
 * EVERY traversed node. Deny-by-default: an oracle that returns `false` hides the
 * node completely (connection never grants visibility).
 */
export interface GraphPermissionOracle {
  /** may this viewer read a node of this entity type (row/entity permission)? */
  canReadEntity(
    viewer: GraphViewerContext,
    entityType: GraphEntityType,
    node: BusinessGraphNode,
  ): boolean;
  /** is this entity type inside the viewer's (agent) domain window? */
  agentDomainAllowed(
    viewer: GraphViewerContext,
    entityType: GraphEntityType,
    node: BusinessGraphNode,
  ): boolean;
}

export interface GraphQueryContext {
  organizationId: string;
  viewer: GraphViewerContext;
  /** the viewer's sensitivity clearance level (ordered scale) */
  viewerClearance: GraphSensitivity;
  permissions: GraphPermissionOracle;
  /** an explicit reveal reason (never returns a body — only relaxes hidden-body gates on a pointer) */
  revealReason?: string;
  /** explicitly authorized to receive a STALE/DEGRADED result (marked stale) */
  allowStale?: boolean;
  /** permit INFERRED-provenance edges (kept visibly labelled) */
  includeInferred?: boolean;
  /** permit UNVERIFIED/PROPOSED-authority edges (kept visibly labelled) */
  includeUnverified?: boolean;
  /** deterministic correlation seed folded into queryId (never a clock) */
  correlationId?: string;
}

/** Scalar (serializable) part of the context — zod-validated at the boundary. */
export const graphQueryContextScalarsSchema = z
  .object({
    organizationId: z.string().min(1),
    viewer: graphViewerContextSchema,
    viewerClearance: z.enum(["ציבורי", "פנימי", "רגיש", "מוגבל"]),
    revealReason: z.string().min(1).optional(),
    allowStale: z.boolean().optional(),
    includeInferred: z.boolean().optional(),
    includeUnverified: z.boolean().optional(),
    correlationId: z.string().min(1).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// request
// ---------------------------------------------------------------------------

export interface GraphTraversalRequest {
  operation: GraphTraversalOperation;
  startNodeId?: GraphNodeId | string;
  targetNodeId?: GraphNodeId | string;
  searchText?: string;
  limits?: GraphTraversalQueryLimitsInput;
}

export const graphTraversalRequestSchema = z
  .object({
    operation: graphTraversalOperationSchema,
    startNodeId: graphNodeIdSchema.optional(),
    targetNodeId: graphNodeIdSchema.optional(),
    searchText: z.string().optional(),
    limits: graphTraversalQueryLimitsInputSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// result envelope
// ---------------------------------------------------------------------------

export interface GraphTraversalResult<TData extends GraphTraversalData = GraphTraversalData> {
  /** false ⇒ a safe refusal (no data) */
  ok: boolean;
  operation: GraphTraversalOperation;
  organizationId: string;
  snapshotId: string | null;
  health: GraphIndexHealthState;
  /** true when a STALE/DEGRADED snapshot was served to an authorized caller */
  stale: boolean;
  registryVersion: string | null;
  limitsApplied: GraphTraversalQueryLimits;
  truncated: GraphTruncationState;
  data: TData | null;
  /** a safe, generic refusal reason (indistinguishable across absent/forbidden) */
  refusalReason: string | null;
  audit: GraphQueryAuditRecord;
}
