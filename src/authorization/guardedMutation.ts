// TERAGON AI BUSINESS OS — LAYER (c): repository-mutation guard (Wave 9, W9-B).
//
// guardedMutation wraps a mutating function so it runs ONLY when the acting
// role holds the required permission; otherwise it throws AuthorizationError
// (code AUTHZ_DENIED) BEFORE the mutation runs. This is a reusable SEAM modules
// may adopt (adoption list in docs/integration-requests-w9b.md) — it is not yet
// wired into the shared repositories, so this file provides the primitive +
// tests, and the wiring is REQUESTED, not silently imposed.
import type { CanonicalRoleId } from "@/domain/administration";
import { requirePermission, type AuthzContext, canInContext } from "./matrix";
import { AuthorizationError } from "./matrix";
import type { Permission } from "./permissions";

/**
 * Run `fn` only if `role` holds `permission`. Throws AuthorizationError first
 * otherwise — the wrapped function is never invoked, so no partial mutation can
 * occur on a denied path.
 */
export async function guardedMutation<T>(
  permission: Permission,
  role: CanonicalRoleId,
  fn: () => Promise<T>,
): Promise<T> {
  requirePermission(role, permission);
  return fn();
}

/** Context-aware variant — carries orgId/userId through the boundary. */
export async function guardedMutationInContext<T>(
  permission: Permission,
  ctx: AuthzContext,
  fn: () => Promise<T>,
): Promise<T> {
  if (!canInContext(ctx, permission)) throw new AuthorizationError(ctx.role, permission);
  return fn();
}
