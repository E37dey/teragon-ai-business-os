// TERAGON Business Graph — security contracts (Phase 2).
// Deny-by-default viewer/permission contracts, the sensitivity reveal policy,
// bounded traversal limits, the query-audit context, and the human-approver
// guard. Reuses existing primitives (memory SENSITIVITY_ORDER, the isAiAgentId
// concept from administration/guards) rather than reinventing them — see
// SECURITY_MODEL §3/§4/§8/§10.
import { z } from "zod";
import { SENSITIVITY_ORDER } from "@/domain/memory/types";
import { isAiAgentId } from "@/domain/administration/guards";
import { graphEntityRefSchema, type GraphEntityRef } from "./identity";
import {
  GRAPH_HIDDEN_SENSITIVITIES,
  GRAPH_SENSITIVITIES,
  type GraphSensitivity,
} from "./node";

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type GraphSecurityErrorCode = "GRAPH_AI_APPROVER_FORBIDDEN";

export class GraphSecurityError extends Error {
  readonly code: GraphSecurityErrorCode;
  readonly detailHe: string;

  constructor(code: GraphSecurityErrorCode, detailHe: string) {
    super(`${code}: ${detailHe}`);
    this.name = "GraphSecurityError";
    this.code = code;
    this.detailHe = detailHe;
  }
}

// ---------------------------------------------------------------------------
// viewer context
// ---------------------------------------------------------------------------

export interface GraphViewerContext {
  organizationId: string;
  actorRef: GraphEntityRef;
  role?: string;
  isAgent: boolean;
  agentId?: string;
}

export const graphViewerContextSchema = z.object({
  organizationId: z.string().min(1),
  actorRef: graphEntityRefSchema,
  role: z.string().min(1).optional(),
  isAgent: z.boolean(),
  agentId: z.string().min(1).optional(),
}) satisfies z.ZodType<GraphViewerContext>;

// ---------------------------------------------------------------------------
// permission decision (deny-by-default)
// ---------------------------------------------------------------------------

export interface GraphPermissionDecision {
  allowed: boolean;
  reasonHe: string;
  reasonCode: string;
}

export const graphPermissionDecisionSchema = z.object({
  allowed: z.boolean(),
  reasonHe: z.string(),
  reasonCode: z.string(),
}) satisfies z.ZodType<GraphPermissionDecision>;

/** The canonical deny result — every gate returns this unless it explicitly allows. */
export function denyByDefault(reasonHe: string): GraphPermissionDecision {
  return { allowed: false, reasonHe, reasonCode: "GRAPH_DENY_BY_DEFAULT" };
}

// ---------------------------------------------------------------------------
// sensitivity reveal policy
// ---------------------------------------------------------------------------

/**
 * Pure predicate: may the viewer see the BODY of a node at this sensitivity?
 * Two gates: (1) clearance must meet the node's sensitivity; (2) hidden
 * sensitivities (רגיש/מוגבל) additionally require an explicit reveal reason.
 */
export function mayRevealBody(
  viewerClearance: GraphSensitivity,
  nodeSensitivity: GraphSensitivity,
  hasReason: boolean,
): boolean {
  if (SENSITIVITY_ORDER[viewerClearance] < SENSITIVITY_ORDER[nodeSensitivity]) return false;
  if (GRAPH_HIDDEN_SENSITIVITIES.includes(nodeSensitivity) && !hasReason) return false;
  return true;
}

export interface GraphSensitivityPolicy {
  clearanceLevels: readonly GraphSensitivity[];
  hiddenSensitivities: readonly GraphSensitivity[];
  mayRevealBody: (
    viewerClearance: GraphSensitivity,
    nodeSensitivity: GraphSensitivity,
    hasReason: boolean,
  ) => boolean;
}

export const DEFAULT_GRAPH_SENSITIVITY_POLICY: GraphSensitivityPolicy = {
  clearanceLevels: GRAPH_SENSITIVITIES,
  hiddenSensitivities: GRAPH_HIDDEN_SENSITIVITIES,
  mayRevealBody,
};

// ---------------------------------------------------------------------------
// traversal limits (bounded — no unlimited recursion)
// ---------------------------------------------------------------------------

export interface GraphTraversalLimits {
  maxDepth: number;
  maxNodes: number;
  maxPaths: number;
  timeoutMs: number;
  cancellable: boolean;
}

export const DEFAULT_GRAPH_TRAVERSAL_LIMITS: GraphTraversalLimits = {
  maxDepth: 6,
  maxNodes: 500,
  maxPaths: 100,
  timeoutMs: 5000,
  cancellable: true,
};

export const graphTraversalLimitsSchema = z.object({
  maxDepth: z.number().int().positive().max(64),
  maxNodes: z.number().int().positive().max(100_000),
  maxPaths: z.number().int().positive().max(10_000),
  timeoutMs: z.number().int().positive().max(600_000),
  cancellable: z.boolean(),
}) satisfies z.ZodType<GraphTraversalLimits>;

// ---------------------------------------------------------------------------
// audit context
// ---------------------------------------------------------------------------

export interface GraphAuditContext {
  actorRef: GraphEntityRef;
  action: string;
  rootRef: GraphEntityRef;
  correlationId: string;
}

export const graphAuditContextSchema = z.object({
  actorRef: graphEntityRefSchema,
  action: z.string().min(1),
  rootRef: graphEntityRefSchema,
  correlationId: z.string().min(1),
}) satisfies z.ZodType<GraphAuditContext>;

// ---------------------------------------------------------------------------
// human-approver guard — AI can never be a human approver
// ---------------------------------------------------------------------------

/**
 * Throws if the proposed approver is an AI agent — either by node type
 * (`agent`) or by id shape (`ag-*` / a registered agent id, via isAiAgentId).
 * Mirrors administration/guards.ts (toHumanUserId) at the graph layer. Never
 * weaken: "AI proposes, only a NAMED human approves" (SECURITY_MODEL §4).
 */
export function humanApproverGuard(approverRef: GraphEntityRef): void {
  if (approverRef.entityType === "agent" || isAiAgentId(approverRef.entityId)) {
    throw new GraphSecurityError(
      "GRAPH_AI_APPROVER_FORBIDDEN",
      `סוכן AI (${approverRef.entityId}) לעולם אינו יכול לשמש מאשר אנושי — נדרש משתמש אנושי בשם`,
    );
  }
}
