// TERAGON AI BUSINESS OS — administration domain (Wave 8, W8-C, Phase 8.7).
// The 9 canonical roles with TYPED permission grants (read/write/approve/none
// per domain), role assignments bridged from the seed users, access reviews,
// guarded permission-change requests and emergency controls.
//
// HONESTY CONTRACT: everything here is local demo administration — every
// record carries ADMIN_DEMO_LABEL_HE. Sessions are synthetic (current session
// only) and say so. AI agents (ag-*) can NEVER hold a role or approve —
// enforced type-level (HumanUserId brand) AND at runtime (guards.ts).
import type { BaseEntity, ISODate, User } from "@/domain/types";

// ---------------------------------------------------------------------------
// demo label
// ---------------------------------------------------------------------------

export const ADMIN_DEMO_LABEL_HE = "ניהול הרשאות במצב הדגמה מקומי";

// ---------------------------------------------------------------------------
// human-vs-agent identity (type-level guard)
// ---------------------------------------------------------------------------

export const AI_AGENT_ID_PREFIX = "ag-";

declare const humanUserIdBrand: unique symbol;
/**
 * A user id PROVEN not to be an AI agent id. The only constructor is
 * toHumanUserId() in guards.ts, which throws on ag-* — so any field typed
 * HumanUserId cannot hold an agent id without an explicit unsafe cast.
 */
export type HumanUserId = string & { readonly [humanUserIdBrand]: true };

// ---------------------------------------------------------------------------
// permission vocabulary
// ---------------------------------------------------------------------------

export const PERMISSION_DOMAINS = [
  "crm",
  "sales",
  "finance",
  "courses",
  "service",
  "knowledge",
  "memory-general",
  "memory-restricted",
  "agents",
  "automations",
  "analytics",
  "governance",
  "administration",
] as const;
export type PermissionDomain = (typeof PERMISSION_DOMAINS)[number];

export const PERMISSION_DOMAIN_LABELS_HE: Record<PermissionDomain, string> = {
  crm: "לקוחות ולידים",
  sales: "מכירות והצעות מחיר",
  finance: "כספים והנחות",
  courses: "קורסים ולמידה",
  service: "שירות ותיקונים",
  knowledge: "מאגר ידע",
  "memory-general": "זיכרון ארגוני כללי",
  "memory-restricted": "זיכרון טכני מוגבל",
  agents: "סוכני AI",
  automations: "אוטומציות",
  analytics: "דוחות וניתוחים",
  governance: "מדיניות מערכת וממשל",
  administration: "ניהול משתמשים והרשאות",
};

export const GRANT_LEVELS = ["none", "read", "write", "approve"] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

export const GRANT_LEVEL_LABELS_HE: Record<GrantLevel, string> = {
  none: "ללא",
  read: "קריאה",
  write: "כתיבה",
  approve: "אישור",
};

/** approve ⊃ write ⊃ read ⊃ none (single stored level per domain). */
export const GRANT_RANK: Record<GrantLevel, number> = { none: 0, read: 1, write: 2, approve: 3 };

export type RoleGrants = Readonly<Record<PermissionDomain, GrantLevel>>;

/** Static permission catalog entry (the "הרשאות" tab). */
export interface PermissionDefinition {
  readonly domain: PermissionDomain;
  readonly labelHe: string;
  readonly descriptionHe: string;
}

// ---------------------------------------------------------------------------
// the 9 canonical roles
// ---------------------------------------------------------------------------

export const CANONICAL_ROLE_IDS = [
  "crole-sysadmin",
  "crole-ceo",
  "crole-bizmgr",
  "crole-sales",
  "crole-service",
  "crole-instructor",
  "crole-champion",
  "crole-auditor",
  "crole-viewer",
] as const;
export type CanonicalRoleId = (typeof CANONICAL_ROLE_IDS)[number];

export const CANONICAL_ROLE_NAMES_HE: Record<CanonicalRoleId, string> = {
  "crole-sysadmin": "מנהל מערכת",
  "crole-ceo": 'מנכ"ל',
  "crole-bizmgr": "מנהל עסקי",
  "crole-sales": "מכירות",
  "crole-service": "שירות",
  "crole-instructor": "מדריך",
  "crole-champion": "Champion",
  "crole-auditor": "מבקר",
  "crole-viewer": "צופה",
};

/** Canonical role record — persisted in the `roles` collection as crole-*. */
export interface RoleDefinitionRecord extends BaseEntity {
  recordKind: "canonical-role";
  roleId: CanonicalRoleId;
  nameHe: string;
  descriptionHe: string;
  grants: RoleGrants;
  demoLabelHe: typeof ADMIN_DEMO_LABEL_HE;
}

/** Legacy seed UserRoleKey → canonical role bridge (honest, documented). */
export const LEGACY_ROLE_TO_CANONICAL: Record<User["role"], CanonicalRoleId> = {
  'מנכ"ל': "crole-ceo",
  מכירות: "crole-sales",
  מדריך: "crole-instructor",
  תמיכה: "crole-service",
  תלמיד: "crole-viewer",
  "מנהל מערכת": "crole-sysadmin",
};

// ---------------------------------------------------------------------------
// administration records — persisted in accessChangeRequests with recordKind
// (the Wave-8 collection registry is frozen; see integration-requests-w8c)
// ---------------------------------------------------------------------------

export interface GrantOverride {
  domain: PermissionDomain;
  level: GrantLevel;
}

/** A user's canonical role assignment + approved per-user overrides. */
export interface RoleAssignmentRecord extends BaseEntity {
  recordKind: "role-assignment";
  userId: string; // constructed only from HumanUserId (guards.ts)
  roleId: CanonicalRoleId;
  overrides: GrantOverride[];
  assignedById: string;
  demoLabelHe: typeof ADMIN_DEMO_LABEL_HE;
}

export type AccessChangeRequestStatus = "ממתין" | "נדחה" | "בוצע" | "נכשל";

export type AccessChangeKind = "user-override" | "role-grant";

/**
 * A guarded permission change: preview → approval (canonical engine, named
 * approver, never self) → execute → verify → audit.
 */
export interface AccessChangeRequestRecord extends BaseEntity {
  recordKind: "access-change-request";
  kind: AccessChangeKind;
  /** "user:u-maya" or "role:crole-sales" */
  targetRef: string;
  domain: PermissionDomain;
  newLevel: GrantLevel;
  previousLevel: GrantLevel;
  requestedById: string;
  requestedByName: string;
  /** the NAMED human approver — never the requester, never ag-* */
  approverId: string;
  approverName: string;
  status: AccessChangeRequestStatus;
  approvalId: string | null;
  runId: string;
  previewHe: string;
  decidedById: string | null;
  decidedAt: ISODate | null;
  /** set only after post-execution read-back verified the new grant */
  verifiedAt: ISODate | null;
  noteHe: string;
  demoLabelHe: typeof ADMIN_DEMO_LABEL_HE;
}

// ---------------------------------------------------------------------------
// emergency controls
// ---------------------------------------------------------------------------

export const EMERGENCY_CONTROL_KINDS = [
  "agent-disable",
  "remote-ai-disable",
  "automation-execution-disable",
  "permission-change-lock",
  "read-only-mode",
] as const;
export type EmergencyControlKind = (typeof EMERGENCY_CONTROL_KINDS)[number];

export const EMERGENCY_CONTROL_LABELS_HE: Record<EmergencyControlKind, string> = {
  "agent-disable": "השבתת סוכן בודד",
  "remote-ai-disable": "השבתת כל ה-AI המרוחק",
  "automation-execution-disable": "השבתת ביצוע אוטומציות",
  "permission-change-lock": "נעילת שינויי הרשאות",
  "read-only-mode": "מצב קריאה בלבד",
};

export interface EmergencyDisableRecord extends BaseEntity {
  recordKind: "emergency-disable";
  control: EmergencyControlKind;
  /** e.g. "agent:ag-hunter" for agent-disable, null for global controls */
  targetRef: string | null;
  state: "פעיל" | "בוטל";
  activatedById: string;
  activatedByName: string;
  reasonHe: string;
  deactivatedAt: ISODate | null;
  /** honest scope note (e.g. "מצב A — תצוגה בלבד, אין ספק מרוחק פעיל") */
  honestScopeHe: string;
  demoLabelHe: typeof ADMIN_DEMO_LABEL_HE;
}

/** Union of everything hosted in the accessChangeRequests collection. */
export type AdministrationRecord =
  | RoleAssignmentRecord
  | AccessChangeRequestRecord
  | EmergencyDisableRecord;

export type AdministrationRecordKind = AdministrationRecord["recordKind"];

// ---------------------------------------------------------------------------
// access reviews (accessReviews collection)
// ---------------------------------------------------------------------------

export type AccessReviewStatus = "ממתין" | "אושר" | "נדחה";

export interface AccessReviewRecord extends BaseEntity {
  userId: string;
  userName: string;
  roleId: CanonicalRoleId;
  status: AccessReviewStatus;
  dueAt: ISODate;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: ISODate | null;
  noteHe: string;
  demoLabelHe: typeof ADMIN_DEMO_LABEL_HE;
}

// ---------------------------------------------------------------------------
// derived (never persisted) views
// ---------------------------------------------------------------------------

/** Honest demo session — synthetic, derived from the running app only. */
export interface SessionRecord {
  id: string;
  userId: string;
  userName: string;
  startedAt: ISODate;
  synthetic: true;
  noteHe: string;
}

/** Derived org membership — bridged from seed data, not persisted. */
export interface OrganizationMembership {
  userId: string;
  organizationId: string;
  organizationName: string;
  roleId: CanonicalRoleId;
  sourceHe: string;
}

/** The users-table row: seed User bridged with role/grants/activity. */
export interface AdministrativeUser {
  user: User;
  roleId: CanonicalRoleId;
  roleNameHe: string;
  /** role grants + approved per-user overrides */
  effectiveGrants: RoleGrants;
  overrides: GrantOverride[];
  organizationNames: string[];
  lastActivityAt: ISODate | null;
  pendingReviewCount: number;
  pendingChangeRequestCount: number;
  /** derived from User.status !== "פעיל" (EntityStatus has no "מושהה") */
  suspended: boolean;
}

/** Administrative audit = the auditEvents rows written with admin.* actions. */
export const ADMIN_AUDIT_ACTION_PREFIX = "admin.";
