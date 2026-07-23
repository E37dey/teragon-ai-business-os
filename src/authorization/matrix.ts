// TERAGON AI BUSINESS OS — role→permission matrix + core decision fns
// (Wave 9, W9-B). DERIVED from the frozen W8-C RoleDefinition grants: a role
// holds a permission iff its grant on the permission's domain meets the
// required level (GRANT_RANK, approve ⊃ write ⊃ read). There is NO hand-kept
// second matrix — regenerating from CANONICAL_ROLE_BASELINES is the whole point.
import {
  CANONICAL_ROLE_BASELINES,
  CANONICAL_ROLE_IDS,
  CANONICAL_ROLE_NAMES_HE,
  GRANT_RANK,
  type CanonicalRoleId,
  type RoleGrants,
} from "@/domain/administration";
import {
  AUTHZ_DEMO_LABEL_HE,
  PERMISSIONS,
  permissionRequirement,
  type Permission,
} from "./permissions";

// ---------------------------------------------------------------------------
// authorization context — org boundary + actor represented in the contract
// ---------------------------------------------------------------------------

/**
 * The authorization context for a decision. `orgId` represents the
 * organization boundary in the contract (single-org demo today; the field
 * exists so a real multi-tenant check has a home and callers already pass it).
 */
export interface AuthzContext {
  readonly role: CanonicalRoleId;
  readonly userId: string;
  readonly orgId: string;
}

export const DEMO_ORG_ID = "org-1";

// ---------------------------------------------------------------------------
// derived matrix
// ---------------------------------------------------------------------------

const GRANTS_BY_ROLE = ((): Record<CanonicalRoleId, RoleGrants> => {
  const out = {} as Record<CanonicalRoleId, RoleGrants>;
  for (const b of CANONICAL_ROLE_BASELINES) out[b.roleId] = b.grants;
  return out;
})();

function roleHasPermission(role: CanonicalRoleId, permission: Permission): boolean {
  const req = permissionRequirement(permission);
  const grant = GRANTS_BY_ROLE[role][req.domain];
  return GRANT_RANK[grant] >= GRANT_RANK[req.minLevel];
}

/** The full 9×24 grid, computed ONCE from the frozen baselines. */
export const ROLE_PERMISSIONS: Readonly<Record<CanonicalRoleId, ReadonlySet<Permission>>> = ((): Record<
  CanonicalRoleId,
  ReadonlySet<Permission>
> => {
  const out = {} as Record<CanonicalRoleId, ReadonlySet<Permission>>;
  for (const role of CANONICAL_ROLE_IDS) {
    out[role] = new Set(PERMISSIONS.filter((p) => roleHasPermission(role, p)));
  }
  return Object.freeze(out);
})();

// ---------------------------------------------------------------------------
// pure decision fns — NO cached role: callers pass the role every time, so a
// demo role-switch re-evaluates from scratch (no silent escalation).
// ---------------------------------------------------------------------------

/** Pure predicate: may this role perform this permission? */
export function can(role: CanonicalRoleId, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Context-aware predicate (same decision today; org boundary is in the type). */
export function canInContext(ctx: AuthzContext, permission: Permission): boolean {
  return can(ctx.role, permission);
}

export class AuthorizationError extends Error {
  readonly code = "AUTHZ_DENIED" as const;
  readonly permission: Permission;
  readonly role: CanonicalRoleId;
  readonly reasonHe: string;

  constructor(role: CanonicalRoleId, permission: Permission) {
    const req = permissionRequirement(permission);
    const reasonHe =
      `לתפקיד «${CANONICAL_ROLE_NAMES_HE[role]}» אין הרשאה «${req.labelHe}» ` +
      `(${AUTHZ_DEMO_LABEL_HE})`;
    super(`AUTHZ_DENIED: ${role} lacks ${permission}`);
    this.name = "AuthorizationError";
    this.role = role;
    this.permission = permission;
    this.reasonHe = reasonHe;
  }
}

/** Throwing variant — use before any guarded action. */
export function requirePermission(role: CanonicalRoleId, permission: Permission): void {
  if (!can(role, permission)) throw new AuthorizationError(role, permission);
}

/** Every permission a role holds (stable order). */
export function permissionsForRole(role: CanonicalRoleId): Permission[] {
  return PERMISSIONS.filter((p) => ROLE_PERMISSIONS[role].has(p));
}

/** Every role that holds a permission (stable order) — for the matrix docs/UI. */
export function rolesWithPermission(permission: Permission): CanonicalRoleId[] {
  return CANONICAL_ROLE_IDS.filter((r) => ROLE_PERMISSIONS[r].has(permission));
}
