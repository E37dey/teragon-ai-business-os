// W8-C — pure derivations for the /administration page. Mirrors the service
// reads over useCollection data (plain per-render derivation, demo scale).
import type { Activity, Agent, AuditEvent, BaseEntity, Organization, User } from "@/domain/types";
import type {
  AccessChangeRequestRecord,
  AccessReviewRecord,
  AdministrativeUser,
  AdministrationRecord,
  CombinationViolation,
  EmergencyDisableRecord,
  RoleAssignmentRecord,
  RoleDefinitionRecord,
  RoleGrants,
} from "@/domain/administration";
import {
  GRANT_LEVEL_LABELS_HE,
  GRANT_RANK,
  PERMISSION_DOMAINS,
  applyOverrides,
  roleGrantViolations,
} from "@/domain/administration";

export function canonicalRolesOf(rawRoles: readonly BaseEntity[]): RoleDefinitionRecord[] {
  return rawRoles
    .filter(
      (r): r is RoleDefinitionRecord =>
        (r as { recordKind?: unknown }).recordKind === "canonical-role",
    )
    .sort((a, b) => a.roleId.localeCompare(b.roleId));
}

export function assignmentsOf(records: readonly AdministrationRecord[]): RoleAssignmentRecord[] {
  return records.filter((r): r is RoleAssignmentRecord => r.recordKind === "role-assignment");
}

export function changeRequestsOf(
  records: readonly AdministrationRecord[],
): AccessChangeRequestRecord[] {
  return records
    .filter((r): r is AccessChangeRequestRecord => r.recordKind === "access-change-request")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function emergencyRecordsOf(
  records: readonly AdministrationRecord[],
): EmergencyDisableRecord[] {
  return records
    .filter((r): r is EmergencyDisableRecord => r.recordKind === "emergency-disable")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface BridgeInputs {
  users: readonly User[];
  activities: readonly Activity[];
  organizations: readonly Organization[];
  adminRecords: readonly AdministrationRecord[];
  reviews: readonly AccessReviewRecord[];
  roles: readonly RoleDefinitionRecord[];
}

/** The users-table rows — same shape the service derives (demo scale, pure). */
export function bridgeUsers(inp: BridgeInputs): AdministrativeUser[] {
  const assignments = assignmentsOf(inp.adminRecords);
  const requests = changeRequestsOf(inp.adminRecords);
  const teragon = inp.organizations.find((o) => o.id === "org-1");
  const out: AdministrativeUser[] = [];
  for (const user of [...inp.users].sort((a, b) => a.id.localeCompare(b.id))) {
    const assignment = assignments.find((a) => a.userId === user.id);
    if (!assignment) continue;
    const role = inp.roles.find((r) => r.roleId === assignment.roleId);
    if (!role) continue;
    const lastActivity = inp.activities
      .filter((a) => a.actorId === user.id)
      .map((a) => a.at)
      .sort()
      .at(-1);
    out.push({
      user,
      roleId: assignment.roleId,
      roleNameHe: role.nameHe,
      effectiveGrants: applyOverrides(role.grants, assignment.overrides),
      overrides: assignment.overrides,
      organizationNames: teragon ? [teragon.name] : [],
      lastActivityAt: lastActivity ?? null,
      pendingReviewCount: inp.reviews.filter((r) => r.userId === user.id && r.status === "ממתין")
        .length,
      pendingChangeRequestCount: requests.filter(
        (r) => r.targetRef === `user:${user.id}` && r.status === "ממתין",
      ).length,
      suspended: user.status !== "פעיל",
    });
  }
  return out;
}

/** e.g. "אישור: 3 · כתיבה: 4 · קריאה: 5" — honest summary of the matrix. */
export function grantsSummaryHe(grants: RoleGrants): string {
  const counts = { approve: 0, write: 0, read: 0, none: 0 };
  for (const d of PERMISSION_DOMAINS) counts[grants[d]] += 1;
  const parts: string[] = [];
  if (counts.approve > 0) parts.push(`${GRANT_LEVEL_LABELS_HE.approve}: ${counts.approve}`);
  if (counts.write > 0) parts.push(`${GRANT_LEVEL_LABELS_HE.write}: ${counts.write}`);
  if (counts.read > 0) parts.push(`${GRANT_LEVEL_LABELS_HE.read}: ${counts.read}`);
  return parts.length > 0 ? parts.join(" · ") : "ללא הרשאות";
}

export interface RoleCombinationWarning {
  roleNameHe: string;
  subjectHe: string;
  violation: CombinationViolation;
}

/**
 * Rail warnings: run the invalid-combination rules over every role matrix AND
 * every user's effective grants. The constructive guards keep this empty —
 * a non-empty list means data drift and is surfaced loudly.
 */
export function combinationWarnings(
  roles: readonly RoleDefinitionRecord[],
  users: readonly AdministrativeUser[],
): RoleCombinationWarning[] {
  const out: RoleCombinationWarning[] = [];
  for (const role of roles) {
    for (const v of roleGrantViolations(role.roleId, role.grants)) {
      out.push({ roleNameHe: role.nameHe, subjectHe: `תפקיד ${role.nameHe}`, violation: v });
    }
  }
  for (const u of users) {
    for (const v of roleGrantViolations(u.roleId, u.effectiveGrants)) {
      out.push({ roleNameHe: u.roleNameHe, subjectHe: `משתמש ${u.user.name}`, violation: v });
    }
  }
  return out;
}

export function adminAuditOf(audit: readonly AuditEvent[]): AuditEvent[] {
  return audit
    .filter((a) => a.action.startsWith("admin."))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function activeEmergencies(records: readonly AdministrationRecord[]): EmergencyDisableRecord[] {
  return emergencyRecordsOf(records).filter((r) => r.state === "פעיל");
}

/** highest grant first — for the compact per-user permission chips */
export function topGrantsHe(grants: RoleGrants, limit = 3): string[] {
  return [...PERMISSION_DOMAINS]
    .filter((d) => grants[d] !== "none")
    .sort((a, b) => GRANT_RANK[grants[b]] - GRANT_RANK[grants[a]])
    .slice(0, limit)
    .map((d) => `${GRANT_LEVEL_LABELS_HE[grants[d]]}`);
}

export function disabledAgents(agents: readonly Agent[]): Agent[] {
  return agents.filter((a) => a.status === "מושבת");
}
