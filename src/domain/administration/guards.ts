// W8-C — constructive guards: invalid role-permission combinations, AI-agent
// exclusion (ag-* can never hold a role or approve), self-approval blocking,
// no-silent-grant-all and the exactly-9-canonical-roles invariant.
import { AGENT_IDS } from "@/agents/definitions";
import type {
  CanonicalRoleId,
  GrantLevel,
  HumanUserId,
  PermissionDomain,
  RoleGrants,
} from "./types";
import {
  AI_AGENT_ID_PREFIX,
  CANONICAL_ROLE_IDS,
  CANONICAL_ROLE_NAMES_HE,
  GRANT_RANK,
  PERMISSION_DOMAINS,
  PERMISSION_DOMAIN_LABELS_HE,
} from "./types";

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type AdministrationErrorCode =
  | "ADMIN_AI_ACTOR_FORBIDDEN"
  | "ADMIN_SELF_APPROVAL_FORBIDDEN"
  | "ADMIN_INVALID_COMBINATION"
  | "ADMIN_GRANT_ALL_FORBIDDEN"
  | "ADMIN_ROLE_COUNT_INVALID"
  | "ADMIN_PERMISSION_LOCKED"
  | "ADMIN_READ_ONLY"
  | "ADMIN_APPROVER_INVALID"
  | "ADMIN_NOT_FOUND"
  | "ADMIN_STATE_INVALID";

export class AdministrationError extends Error {
  readonly code: AdministrationErrorCode;
  readonly detailHe: string;

  constructor(code: AdministrationErrorCode, detailHe: string) {
    super(`${code}: ${detailHe}`);
    this.name = "AdministrationError";
    this.code = code;
    this.detailHe = detailHe;
  }
}

// ---------------------------------------------------------------------------
// AI-agent exclusion — type-level + runtime
// ---------------------------------------------------------------------------

const KNOWN_AGENT_IDS: ReadonlySet<string> = new Set(AGENT_IDS);

/** true for ag-* ids AND any id registered in the frozen agent definitions. */
export function isAiAgentId(id: string): boolean {
  return id.startsWith(AI_AGENT_ID_PREFIX) || KNOWN_AGENT_IDS.has(id);
}

/**
 * The ONLY constructor of HumanUserId. Throws for AI agent ids — so any
 * role-holder/approver field typed HumanUserId is agent-free by construction.
 */
export function toHumanUserId(id: string): HumanUserId {
  if (!id.trim()) {
    throw new AdministrationError("ADMIN_APPROVER_INVALID", "מזהה משתמש ריק אינו חוקי");
  }
  if (isAiAgentId(id)) {
    throw new AdministrationError(
      "ADMIN_AI_ACTOR_FORBIDDEN",
      `סוכן AI (${id}) לעולם אינו יכול לשאת תפקיד או לשמש מאשר — נדרש משתמש אנושי בשם`,
    );
  }
  return id as HumanUserId;
}

/** Runtime guard for decision points: approver must be human and not self. */
export function assertHumanApprover(approverId: string, requesterId: string): HumanUserId {
  const human = toHumanUserId(approverId);
  if (approverId === requesterId) {
    throw new AdministrationError(
      "ADMIN_SELF_APPROVAL_FORBIDDEN",
      "אישור עצמי חסום — מבקש השינוי אינו יכול לאשר את הבקשה של עצמו",
    );
  }
  return human;
}

// ---------------------------------------------------------------------------
// invalid-combination rules (the 4 canonical rules + generic checks)
// ---------------------------------------------------------------------------

export interface CombinationViolation {
  ruleId: "R1-viewer-write" | "R2-champion-policy" | "R3-sales-restricted" | "R4-service-discount";
  domain: PermissionDomain;
  detailHe: string;
}

/**
 * Pure rule evaluation on EFFECTIVE grants of a role (baseline + overrides).
 * R1: צופה never write/approve anywhere.
 * R2: Champion never write/approve on governance or administration.
 * R3: מכירות has NO access to restricted technical memory.
 * R4: שירות never approve on finance (financial discounts).
 */
export function roleGrantViolations(
  roleId: CanonicalRoleId,
  grants: RoleGrants,
): CombinationViolation[] {
  const out: CombinationViolation[] = [];
  const nameHe = CANONICAL_ROLE_NAMES_HE[roleId];
  if (roleId === "crole-viewer") {
    for (const d of PERMISSION_DOMAINS) {
      if (GRANT_RANK[grants[d]] > GRANT_RANK.read) {
        out.push({
          ruleId: "R1-viewer-write",
          domain: d,
          detailHe: `${nameHe} לעולם אינו כותב — "${PERMISSION_DOMAIN_LABELS_HE[d]}" ברמת ${grants[d]} אסורה`,
        });
      }
    }
  }
  if (roleId === "crole-champion") {
    for (const d of ["governance", "administration"] as const) {
      if (GRANT_RANK[grants[d]] > GRANT_RANK.read) {
        out.push({
          ruleId: "R2-champion-policy",
          domain: d,
          detailHe: `${nameHe} לעולם אינו עורך מדיניות מערכת — "${PERMISSION_DOMAIN_LABELS_HE[d]}" מוגבל לקריאה`,
        });
      }
    }
  }
  if (roleId === "crole-sales" && grants["memory-restricted"] !== "none") {
    out.push({
      ruleId: "R3-sales-restricted",
      domain: "memory-restricted",
      detailHe: `${nameHe} ללא גישה לזיכרון טכני מוגבל — כל רמה מעל "ללא" אסורה`,
    });
  }
  if (roleId === "crole-service" && grants.finance === "approve") {
    out.push({
      ruleId: "R4-service-discount",
      domain: "finance",
      detailHe: `${nameHe} לעולם אינו מאשר הנחות כספיות — רמת "אישור" בכספים אסורה`,
    });
  }
  return out;
}

/** Throwing variant — used before any grant change is persisted. */
export function assertValidCombination(roleId: CanonicalRoleId, grants: RoleGrants): void {
  const violations = roleGrantViolations(roleId, grants);
  if (violations.length > 0) {
    throw new AdministrationError(
      "ADMIN_INVALID_COMBINATION",
      violations.map((v) => v.detailHe).join(" · "),
    );
  }
}

/**
 * No silent grant-all: a grants matrix with write-or-above on EVERY domain is
 * rejected for every role (even the admin baselines keep finance/analytics at
 * read). A full-power role cannot be created by a single edit.
 */
export function assertNoGrantAll(roleId: CanonicalRoleId, grants: RoleGrants): void {
  const allWritable = PERMISSION_DOMAINS.every((d) => GRANT_RANK[grants[d]] >= GRANT_RANK.write);
  if (allWritable) {
    throw new AdministrationError(
      "ADMIN_GRANT_ALL_FORBIDDEN",
      `הענקת כתיבה/אישור בכל התחומים בבת אחת חסומה (${CANONICAL_ROLE_NAMES_HE[roleId]}) — אין grant-all שקט`,
    );
  }
}

// ---------------------------------------------------------------------------
// exactly-9 invariant
// ---------------------------------------------------------------------------

export function assertExactlyNineCanonicalRoles(roleIds: readonly string[]): void {
  const unique = new Set(roleIds);
  const expected = new Set<string>(CANONICAL_ROLE_IDS);
  const missing = CANONICAL_ROLE_IDS.filter((id) => !unique.has(id));
  const extra = [...unique].filter((id) => !expected.has(id));
  const hasDuplicates = roleIds.length !== unique.size;
  if (unique.size !== 9 || missing.length > 0 || extra.length > 0 || hasDuplicates) {
    throw new AdministrationError(
      "ADMIN_ROLE_COUNT_INVALID",
      `נדרשים בדיוק 9 תפקידים קנוניים — נמצאו ${unique.size}` +
        (hasDuplicates ? " · קיימות רשומות כפולות" : "") +
        (missing.length > 0 ? ` · חסרים: ${missing.join(", ")}` : "") +
        (extra.length > 0 ? ` · עודפים: ${extra.join(", ")}` : ""),
    );
  }
}

// ---------------------------------------------------------------------------
// effective grants (baseline + approved per-user overrides)
// ---------------------------------------------------------------------------

export function applyOverrides(
  base: RoleGrants,
  overrides: readonly { domain: PermissionDomain; level: GrantLevel }[],
): RoleGrants {
  const next = { ...base } as Record<PermissionDomain, GrantLevel>;
  for (const o of overrides) next[o.domain] = o.level;
  return next;
}
