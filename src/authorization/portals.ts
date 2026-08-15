// TERAGON vNext — Portal presentation archetype (Phase B).
//
// A Portal is a UX/presentation layer OVER the frozen 9 canonical RBAC roles —
// it decides navigation, the landing home and information density for a user,
// but it NEVER decides authorization. Authorization is, and remains, the
// canonical role evaluated by `can(role, permission)` in matrix.ts. A portal is
// PURELY DERIVED from the authenticated user's canonical role (portalForRole),
// so a portal can never grant a capability the role does not hold.
import type { CanonicalRoleId } from "@/domain/administration";

export const PORTALS = ["manager", "student", "technician"] as const;
export type Portal = (typeof PORTALS)[number];

export interface PortalMeta {
  readonly portal: Portal;
  readonly labelHe: string;
  readonly taglineHe: string;
  /** where this portal lands after login (always an open '/' dashboard route). */
  readonly landing: string;
}

export const PORTAL_META: Readonly<Record<Portal, PortalMeta>> = Object.freeze({
  manager: {
    portal: "manager",
    labelHe: "מנהל",
    taglineHe: "ניהול, בקרה וקבלת החלטות",
    landing: "/home",
  },
  student: {
    portal: "student",
    labelHe: "תלמיד",
    taglineHe: "למידה, משימות והתקדמות",
    landing: "/home",
  },
  technician: {
    portal: "technician",
    labelHe: "טכנאי",
    taglineHe: "משימות שטח, ידע טכני ושירות",
    landing: "/home",
  },
});

/**
 * The DERIVED portal for a canonical role. Confirmed mapping (Phase A):
 *   manager  ← bizmgr, ceo, sysadmin, auditor, champion   (broad operational)
 *   student  ← viewer, instructor                          (learning-oriented)
 *   technician ← service, sales                            (field/task-oriented)
 * The default (any unmapped role) is the broadest-safe 'manager' composition,
 * but the ROUTE GUARD still denies anything the role lacks — the portal only
 * affects what is OFFERED, never what is ALLOWED.
 */
export function portalForRole(role: CanonicalRoleId): Portal {
  switch (role) {
    case "crole-viewer":
    case "crole-instructor":
      return "student";
    case "crole-service":
    case "crole-sales":
      return "technician";
    case "crole-bizmgr":
    case "crole-ceo":
    case "crole-sysadmin":
    case "crole-auditor":
    case "crole-champion":
    default:
      return "manager";
  }
}
