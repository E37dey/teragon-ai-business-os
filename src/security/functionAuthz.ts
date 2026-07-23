// TERAGON AI BUSINESS OS — LAYER (d): server-function authorization boundary
// (Wave 9, W9-B, 9.6).
//
// HONEST DEMO, NOT AUTH: this extends the src/server/auth.ts boundary (which
// validates claim SHAPE and marks every demo context trusted:false) with an
// OPERATION-authorization contract. It answers: "does the role CLAIM on this
// request permit the requested operation?" — using the SAME derived
// role→permission matrix as the browser. It is a demo simulation: the role is
// an unverified CLAIM, so this rejects malformed/over-reaching operation
// contexts but NEVER asserts a verified identity. A real deployment swaps the
// upstream AuthVerifier for a signed-token verifier; this operation check then
// runs on trusted claims unchanged.
import {
  CANONICAL_ROLE_IDS,
  type CanonicalRoleId,
} from "@/domain/administration";
import { can } from "@/authorization/matrix";
import { AUTHZ_DEMO_LABEL_HE, isPermission, type Permission } from "@/authorization/permissions";

export type FunctionAuthzDenyReason =
  | "malformed-role-claim"
  | "unknown-operation"
  | "insufficient-permission";

export interface FunctionAuthzContext {
  /** role CLAIM from the request — unverified in demo mode */
  role: string;
  /** organization CLAIM — org boundary represented in the contract */
  orgId: string;
  /** the permission the requested server operation requires */
  operation: string;
}

export type FunctionAuthzResult =
  | { ok: true; role: CanonicalRoleId; permission: Permission }
  | { ok: false; reason: FunctionAuthzDenyReason; detailHe: string };

function isCanonicalRoleId(value: string): value is CanonicalRoleId {
  return (CANONICAL_ROLE_IDS as readonly string[]).includes(value);
}

/** shape guard: org claim must look like an id, never smuggle injection */
const ORG_CLAIM_SHAPE = /^[A-Za-z0-9._:@-]{1,128}$/u;

/**
 * Demo operation-authorization check. Returns a structured verdict — callers
 * (handlers) MUST reject on `ok:false`. Never throws; never fabricates a pass.
 * A malformed role/org claim or an unknown operation is DENIED (fail-closed).
 */
export function authorizeFunctionOperation(ctx: FunctionAuthzContext): FunctionAuthzResult {
  if (!ORG_CLAIM_SHAPE.test(ctx.orgId) || !isCanonicalRoleId(ctx.role)) {
    return {
      ok: false,
      reason: "malformed-role-claim",
      detailHe: `טענת תפקיד/ארגון פגומה — נדחתה (${AUTHZ_DEMO_LABEL_HE})`,
    };
  }
  if (!isPermission(ctx.operation)) {
    return {
      ok: false,
      reason: "unknown-operation",
      detailHe: `פעולת שרת לא מוכרת «${ctx.operation}» — נדחתה (${AUTHZ_DEMO_LABEL_HE})`,
    };
  }
  const permission = ctx.operation;
  if (!can(ctx.role, permission)) {
    return {
      ok: false,
      reason: "insufficient-permission",
      detailHe: `לתפקיד «${ctx.role}» אין הרשאה לפעולה «${permission}» (${AUTHZ_DEMO_LABEL_HE})`,
    };
  }
  return { ok: true, role: ctx.role, permission };
}
