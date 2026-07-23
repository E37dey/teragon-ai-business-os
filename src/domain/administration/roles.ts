// W8-C — the canonical grants matrix of the 9 roles. Deep-frozen like the
// agent definitions: the baseline can never be mutated at runtime; changes go
// through the guarded permission-change workflow only (new records, audited).
import type { CanonicalRoleId, PermissionDomain, GrantLevel, RoleGrants } from "./types";
import { CANONICAL_ROLE_NAMES_HE, PERMISSION_DOMAINS } from "./types";

function grants(partial: Partial<Record<PermissionDomain, GrantLevel>>): RoleGrants {
  const full = {} as Record<PermissionDomain, GrantLevel>;
  for (const d of PERMISSION_DOMAINS) full[d] = partial[d] ?? "none";
  return Object.freeze(full);
}

export interface CanonicalRoleBaseline {
  readonly roleId: CanonicalRoleId;
  readonly nameHe: string;
  readonly descriptionHe: string;
  readonly grants: RoleGrants;
}

/**
 * The 9 canonical baselines. Every matrix honors the invalid-combination
 * rules (guards.ts) BY CONSTRUCTION — verified by tests:
 * צופה never writes; Champion never edits system policy; מכירות has no
 * restricted technical memory; שירות never approves financial discounts.
 */
export const CANONICAL_ROLE_BASELINES: readonly CanonicalRoleBaseline[] = Object.freeze([
  {
    roleId: "crole-sysadmin",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-sysadmin"],
    descriptionHe: "תצורה, הרשאות וניטור — מאשר שינויי הרשאות ומדיניות מערכת",
    grants: grants({
      crm: "write",
      sales: "write",
      finance: "read",
      courses: "write",
      service: "write",
      knowledge: "write",
      "memory-general": "write",
      "memory-restricted": "write",
      agents: "approve",
      automations: "approve",
      analytics: "read",
      governance: "approve",
      administration: "approve",
    }),
  },
  {
    roleId: "crole-ceo",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-ceo"],
    descriptionHe: "גישה מלאה — המאשר הבכיר לפעולות AI רגישות ולהתחייבויות כספיות",
    grants: grants({
      crm: "write",
      sales: "approve",
      finance: "approve",
      courses: "read",
      service: "read",
      knowledge: "approve",
      "memory-general": "approve",
      "memory-restricted": "approve",
      agents: "approve",
      automations: "approve",
      analytics: "read",
      governance: "approve",
      administration: "approve",
    }),
  },
  {
    roleId: "crole-bizmgr",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-bizmgr"],
    descriptionHe: "ניהול עסקי — מאשר מכירות והנחות, ללא ניהול הרשאות מערכת",
    grants: grants({
      crm: "write",
      sales: "approve",
      finance: "approve",
      courses: "read",
      service: "read",
      knowledge: "write",
      "memory-general": "write",
      agents: "read",
      automations: "write",
      analytics: "read",
      governance: "read",
    }),
  },
  {
    roleId: "crole-sales",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-sales"],
    descriptionHe: "לידים, הצעות מחיר ולקוחות — הנחות דורשות אישור; ללא זיכרון טכני מוגבל",
    grants: grants({
      crm: "write",
      sales: "write",
      service: "read",
      knowledge: "read",
      "memory-general": "read",
      agents: "read",
      analytics: "read",
    }),
  },
  {
    roleId: "crole-service",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-service"],
    descriptionHe: "קריאות שירות ותיקונים — לעולם אינו מאשר הנחות כספיות",
    grants: grants({
      crm: "read",
      service: "write",
      knowledge: "read",
      "memory-general": "read",
      "memory-restricted": "read",
      agents: "read",
    }),
  },
  {
    roleId: "crole-instructor",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-instructor"],
    descriptionHe: "קורסים, תלמידים וחומרי הדרכה",
    grants: grants({
      crm: "read",
      courses: "write",
      knowledge: "write",
      "memory-general": "read",
      agents: "read",
      analytics: "read",
    }),
  },
  {
    roleId: "crole-champion",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-champion"],
    descriptionHe: "שגריר האימוץ — מקדם שימוש ומעדכן ידע; לעולם אינו עורך מדיניות מערכת",
    grants: grants({
      crm: "read",
      sales: "read",
      courses: "read",
      service: "read",
      knowledge: "write",
      "memory-general": "write",
      agents: "read",
      automations: "read",
      analytics: "read",
      governance: "read",
    }),
  },
  {
    roleId: "crole-auditor",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-auditor"],
    descriptionHe: "ביקורת — קריאה בכל התחומים כולל ממשל וכספים, ללא כתיבה",
    grants: grants({
      crm: "read",
      sales: "read",
      finance: "read",
      courses: "read",
      service: "read",
      knowledge: "read",
      "memory-general": "read",
      "memory-restricted": "read",
      agents: "read",
      automations: "read",
      analytics: "read",
      governance: "read",
      administration: "read",
    }),
  },
  {
    roleId: "crole-viewer",
    nameHe: CANONICAL_ROLE_NAMES_HE["crole-viewer"],
    descriptionHe: "צפייה בלבד בתחומים העסקיים — לעולם אינו כותב",
    grants: grants({
      crm: "read",
      sales: "read",
      courses: "read",
      service: "read",
      knowledge: "read",
      "memory-general": "read",
      agents: "read",
      automations: "read",
      analytics: "read",
    }),
  },
] as const);

export function getRoleBaseline(roleId: CanonicalRoleId): CanonicalRoleBaseline {
  const found = CANONICAL_ROLE_BASELINES.find((b) => b.roleId === roleId);
  if (!found) throw new Error(`תפקיד קנוני לא מוכר: ${roleId}`);
  return found;
}
