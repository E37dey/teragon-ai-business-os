// TERAGON AI BUSINESS OS — LAYER (b): UI-action permission hook (Wave 9, W9-B).
//
// usePermission(perm) reads the LIVE demo role and answers whether the current
// role may perform an action, with an honest Hebrew reason when it may not — so
// a control can render disabled + explain WHY. Kept in its own module (no JSX)
// so the component file stays components-only (fast-refresh clean).
import { CANONICAL_ROLE_NAMES_HE } from "@/domain/administration";
import { can } from "./matrix";
import { AUTHZ_DEMO_LABEL_HE, permissionRequirement, type Permission } from "./permissions";
import { useCurrentRole } from "./roleStore";

export interface PermissionVerdict {
  allowed: boolean;
  /** empty string when allowed; a Hebrew reason when denied */
  reasonHe: string;
}

/** Pure verdict (no React) — usable in event handlers and the hook alike. */
export function permissionVerdict(
  role: Parameters<typeof can>[0],
  permission: Permission,
): PermissionVerdict {
  if (can(role, permission)) return { allowed: true, reasonHe: "" };
  const req = permissionRequirement(permission);
  return {
    allowed: false,
    reasonHe:
      `לתפקיד «${CANONICAL_ROLE_NAMES_HE[role]}» אין הרשאה «${req.labelHe}» ` +
      `(${AUTHZ_DEMO_LABEL_HE})`,
  };
}

/**
 * LAYER (b) hook. Reads the live demo role and answers whether the current role
 * may perform `permission`, with an honest Hebrew reason when it may not.
 */
export function usePermission(permission: Permission): PermissionVerdict {
  const role = useCurrentRole();
  return permissionVerdict(role, permission);
}
