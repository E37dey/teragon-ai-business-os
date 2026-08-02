// TERAGON Business Graph — security contracts (Phase 2).
// Deny-by-default viewer/permission contracts, the sensitivity reveal policy,
// bounded traversal limits, the query-audit context, and the human-approver
// guard. Reuses existing primitives (memory SENSITIVITY_ORDER, the isAiAgentId
// concept from administration/guards) rather than reinventing them — see
// SECURITY_MODEL §3/§4/§8/§10.
import { z } from "zod";
import { SENSITIVITY_ORDER } from "@/domain/memory/types";
import { graphEntityRefSchema, isArrayPositionId, type GraphEntityRef } from "./identity";
import { actorRefSchema, type ActorRef } from "./actor";
import {
  GRAPH_HIDDEN_SENSITIVITIES,
  GRAPH_SENSITIVITIES,
  type GraphSensitivity,
} from "./node";

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type GraphSecurityErrorCode =
  | "GRAPH_APPROVER_NOT_HUMAN"
  | "GRAPH_APPROVER_INVALID_ID"
  | "GRAPH_APPROVER_INACTIVE"
  | "GRAPH_APPROVER_MISSING_PERMISSION"
  | "GRAPH_SELF_APPROVAL_FORBIDDEN";

export class GraphSecurityError extends Error {
  readonly code: GraphSecurityErrorCode;
  readonly detailHe: string;

  constructor(code: GraphSecurityErrorCode, detailHe: string) {
    super(`${code}: ${detailHe}`);
    this.name = "GraphSecurityError";
    this.code = code;
    this.detailHe = detailHe;
  }

  /** Alias for `code` — the machine-readable reason. */
  get reasonCode(): GraphSecurityErrorCode {
    return this.code;
  }

  /** Alias for `detailHe` — the human-readable Hebrew reason. */
  get reasonHe(): string {
    return this.detailHe;
  }
}

// ---------------------------------------------------------------------------
// viewer context
// ---------------------------------------------------------------------------

export interface GraphViewerContext {
  organizationId: string;
  actor: ActorRef;
  role?: string;
}

export const graphViewerContextSchema = z.object({
  organizationId: z.string().min(1),
  actor: actorRefSchema,
  role: z.string().min(1).optional(),
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
// human-approver guard — AI/SYSTEM can never be a human approver
// ---------------------------------------------------------------------------

/** Eligibility facts the caller supplies (the contract cannot read the users repo). */
export interface HumanApproverEligibility {
  active: boolean;
  hasRequiredPermission: boolean;
}

export interface HumanApproverContext {
  eligibility: HumanApproverEligibility;
  /** the actor who requested the change (for self-approval checks) */
  requesterUserId?: string;
  /** when true, an actor may not approve their own request */
  prohibitSelfApproval?: boolean;
}

/**
 * Throws unless `actor` is a HUMAN with a canonical id who is active, holds the
 * required permission, and (when prohibited) is not self-approving. Actor TYPE
 * is read from the discriminant `kind` — NEVER inferred from an id prefix
 * (`ag-*`), so a HUMAN whose userId merely contains "ag" is still a HUMAN.
 * Enforces "AI proposes, only a NAMED human approves" (SECURITY_MODEL §4).
 */
export function assertHumanApprover(actor: ActorRef, ctx: HumanApproverContext): void {
  if (actor.kind !== "HUMAN") {
    throw new GraphSecurityError(
      "GRAPH_APPROVER_NOT_HUMAN",
      `שחקן מסוג ${actor.kind} לעולם אינו יכול לשמש מאשר אנושי — נדרש משתמש אנושי בשם`,
    );
  }
  const userId = actor.userId;
  if (!userId.trim() || /\s/u.test(userId) || isArrayPositionId(userId)) {
    throw new GraphSecurityError(
      "GRAPH_APPROVER_INVALID_ID",
      `מזהה משתמש לא קנוני (${userId}) אינו יכול לשמש מאשר — נדרש מזהה יציב ללא רווחים`,
    );
  }
  if (!ctx.eligibility.active) {
    throw new GraphSecurityError(
      "GRAPH_APPROVER_INACTIVE",
      `המשתמש (${userId}) אינו פעיל/כשיר — אינו יכול לאשר`,
    );
  }
  if (!ctx.eligibility.hasRequiredPermission) {
    throw new GraphSecurityError(
      "GRAPH_APPROVER_MISSING_PERMISSION",
      `למשתמש (${userId}) אין את הרשאת האישור הנדרשת`,
    );
  }
  if (ctx.prohibitSelfApproval === true && ctx.requesterUserId === userId) {
    throw new GraphSecurityError(
      "GRAPH_SELF_APPROVAL_FORBIDDEN",
      `אישור עצמי חסום — המבקש (${userId}) אינו יכול לאשר את בקשתו`,
    );
  }
}
