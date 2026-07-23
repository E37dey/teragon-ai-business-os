// TERAGON AI BUSINESS OS — canonical PERMISSION vocabulary (Wave 9, W9-B).
//
// HONESTY CONTRACT: this is a DEMO permission simulation, not a real auth
// system. There is no identity provider — the "current role" is a demo setting
// (see roleStore.ts). Every denied surface says so plainly with
// AUTHZ_DEMO_LABEL_HE. Nothing here authenticates anyone.
//
// The 24 canonical permissions are the ONLY permissions in the product. Each
// maps to a W8-C administration DOMAIN + a minimum GRANT LEVEL, so the whole
// role→permission matrix is DERIVED from the frozen RoleDefinition grants
// (roles.ts) — there is no second, hand-maintained source of truth to drift.
import type { GrantLevel, PermissionDomain } from "@/domain/administration";

// ---------------------------------------------------------------------------
// demo label — every denied surface carries this; NEVER "אימות פעיל"
// ---------------------------------------------------------------------------

export const AUTHZ_DEMO_LABEL_HE = "סימולציית הרשאות במצב הדגמה";

/** honest denial copy for a screen the demo role may not view */
export const ACCESS_DENIED_SCREEN_HE = `אין לך הרשאה לצפות במסך זה (${AUTHZ_DEMO_LABEL_HE})`;

// ---------------------------------------------------------------------------
// the canonical 24 permissions — EXACTLY the mandated set, nothing more
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  "customer.read",
  "customer.create",
  "customer.update",
  "sales.read",
  "quotation.create",
  "quotation.approve",
  "discount.approve",
  "service.read",
  "service.update",
  "service.close",
  "course.manage",
  "knowledge.review",
  "memory.approve",
  "learning.approve",
  "agent.disable",
  "automation.approve",
  "governance.review",
  "policy.approve",
  "audit.read",
  "user.manage",
  "permission.approve",
  "settings.update",
  "health.diagnostics",
  "submission.approve",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** runtime membership test for an unknown string */
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// permission → (domain, minimum grant level) requirement
// ---------------------------------------------------------------------------

export interface PermissionRequirement {
  /** the W8-C administration domain this permission draws its grant from */
  readonly domain: PermissionDomain;
  /** minimum grant level a role must hold on that domain */
  readonly minLevel: Extract<GrantLevel, "read" | "write" | "approve">;
  /** Hebrew label for the matrix + denial messages */
  readonly labelHe: string;
}

/**
 * The single mapping table. `.approve` permissions require an `approve` grant
 * (mandate: "where a role has domain:approve → the .approve perms"); `.create`/
 * `.update`/`.manage`/`.close`/`.update` require `write`; read/entry perms
 * require `read`. approve ⊃ write ⊃ read (GRANT_RANK), so a higher grant always
 * satisfies a lower requirement.
 */
export const PERMISSION_REQUIREMENTS: Readonly<Record<Permission, PermissionRequirement>> =
  Object.freeze({
    "customer.read": { domain: "crm", minLevel: "read", labelHe: "צפייה בלקוחות" },
    "customer.create": { domain: "crm", minLevel: "write", labelHe: "יצירת לקוח" },
    "customer.update": { domain: "crm", minLevel: "write", labelHe: "עדכון לקוח" },
    "sales.read": { domain: "sales", minLevel: "read", labelHe: "צפייה במכירות" },
    "quotation.create": { domain: "sales", minLevel: "write", labelHe: "יצירת הצעת מחיר" },
    "quotation.approve": { domain: "sales", minLevel: "approve", labelHe: "אישור הצעת מחיר" },
    "discount.approve": { domain: "finance", minLevel: "approve", labelHe: "אישור הנחה" },
    "service.read": { domain: "service", minLevel: "read", labelHe: "צפייה בשירות" },
    "service.update": { domain: "service", minLevel: "write", labelHe: "עדכון קריאת שירות" },
    "service.close": { domain: "service", minLevel: "write", labelHe: "סגירת קריאת שירות" },
    "course.manage": { domain: "courses", minLevel: "write", labelHe: "ניהול קורסים" },
    "knowledge.review": { domain: "knowledge", minLevel: "write", labelHe: "סקירת ידע" },
    "memory.approve": { domain: "memory-general", minLevel: "approve", labelHe: "אישור זיכרון" },
    "learning.approve": { domain: "governance", minLevel: "approve", labelHe: "אישור למידה/שיפור" },
    "agent.disable": { domain: "agents", minLevel: "approve", labelHe: "השבתת סוכן" },
    "automation.approve": {
      domain: "automations",
      minLevel: "approve",
      labelHe: "אישור אוטומציה",
    },
    "governance.review": { domain: "governance", minLevel: "read", labelHe: "סקירת ממשל" },
    "policy.approve": { domain: "governance", minLevel: "approve", labelHe: "אישור מדיניות" },
    "audit.read": { domain: "administration", minLevel: "read", labelHe: "קריאת יומן ביקורת" },
    "user.manage": { domain: "administration", minLevel: "write", labelHe: "ניהול משתמשים" },
    "permission.approve": {
      domain: "administration",
      minLevel: "approve",
      labelHe: "אישור שינוי הרשאות",
    },
    "settings.update": { domain: "administration", minLevel: "write", labelHe: "עדכון הגדרות" },
    "health.diagnostics": {
      domain: "administration",
      minLevel: "read",
      labelHe: "אבחון בריאות המערכת",
    },
    "submission.approve": { domain: "governance", minLevel: "approve", labelHe: "אישור הגשה" },
  });

export function permissionRequirement(permission: Permission): PermissionRequirement {
  return PERMISSION_REQUIREMENTS[permission];
}
