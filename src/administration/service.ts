// TERAGON AI BUSINESS OS — AdministrationService (Wave 8, W8-C, Phases 8.7-8.8).
// Bridges the seed users onto the 9 canonical roles, runs the GUARDED
// permission-change workflow through the ONE canonical ApprovalEngine
// ('permission-change' is already an APPROVAL_REQUIRED_ACTION), and operates
// the emergency controls. Guarantees (all tested):
//   - self-approval blocked; AI agents (ag-*) never hold roles / never approve
//   - invalid role-permission combinations cannot be requested OR executed
//   - reject path mutates nothing; execution is verified by read-back
//   - every action writes an admin.* audit event
// Everything is local demo administration — ADMIN_DEMO_LABEL_HE on every record.
import type { Activity, AuditEvent, User } from "@/domain/types";
import type {
  AccessChangeRequestRecord,
  AccessReviewRecord,
  AdministrativeUser,
  AdministrationRecord,
  CanonicalRoleId,
  EmergencyControlKind,
  EmergencyDisableRecord,
  GrantLevel,
  GrantOverride,
  OrganizationMembership,
  PermissionDomain,
  RoleAssignmentRecord,
  RoleDefinitionRecord,
  RoleGrants,
  SessionRecord,
} from "@/domain/administration";
import {
  ADMIN_DEMO_LABEL_HE,
  CANONICAL_ROLE_BASELINES,
  CANONICAL_ROLE_NAMES_HE,
  EMERGENCY_CONTROL_LABELS_HE,
  GRANT_LEVEL_LABELS_HE,
  LEGACY_ROLE_TO_CANONICAL,
  PERMISSION_DOMAIN_LABELS_HE,
  AdministrationError,
  accessChangeRequestRecordSchema,
  accessReviewRecordSchema,
  applyOverrides,
  assertExactlyNineCanonicalRoles,
  assertHumanApprover,
  assertNoGrantAll,
  assertValidCombination,
  emergencyDisableRecordSchema,
  roleAssignmentRecordSchema,
  roleDefinitionRecordSchema,
  toHumanUserId,
} from "@/domain/administration";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { AGENT_DISABLED_STATUS } from "@/components/ai/engine";
import type { AgentStores } from "@/repositories/agentStores";
import type { AdministrationClock, UserStores } from "@/repositories/userStores";
import type { RoleStores } from "@/repositories/roleStores";
import { listCanonicalRoles } from "@/repositories/roleStores";
import {
  isEmergencyFlagActive,
  isFlagBackedControl,
  setEmergencyFlag,
  type EmergencyFlagKind,
} from "./emergencyFlags";

const PERMISSION_ACTION = "permission-change" as const;

/** Honest per-control scope statements (Mode A truths). */
export const EMERGENCY_HONEST_SCOPE_HE: Record<EmergencyControlKind, string> = {
  "agent-disable": "משביתה סוכן בודד ברשומת agents (מנגנון W5-D) — הסוכן מסרב למשימות חדשות",
  "remote-ai-disable":
    "מצב A — תצוגה בלבד: אין ספק AI מרוחק פעיל במערכת (remoteEnabled=false), הדגל מתעד כוונה בלבד",
  "automation-execution-disable":
    "הדגל נכתב ונאכף במודול הניהול; אכיפה במודול האוטומציות ממתינה לחיווט (integration-requests-w8c)",
  "permission-change-lock": "נאכף מיידית: המערכת דוחה בקשות שינוי הרשאות חדשות והכרעות בבקשות",
  "read-only-mode":
    "נאכף במודול הניהול (כל פעולה משנה נדחית); אכיפה כלל-מערכתית ממתינה לחיווט (integration-requests-w8c)",
};

/** injectable flag seam — production uses localStorage, tests inject a map */
export interface EmergencyFlagPort {
  isActive(kind: EmergencyFlagKind): boolean;
  set(kind: EmergencyFlagKind, active: boolean): void;
}

const localStorageFlagPort: EmergencyFlagPort = {
  isActive: isEmergencyFlagActive,
  set: setEmergencyFlag,
};

export interface AdministrationDeps {
  stores: UserStores;
  roles: RoleStores;
  agentStores: AgentStores;
  clock?: AdministrationClock;
  flags?: EmergencyFlagPort;
}

export interface RequestPermissionChangeInput {
  kind: "user-override" | "role-grant";
  /** user id for user-override, canonical role id for role-grant */
  targetId: string;
  domain: PermissionDomain;
  newLevel: GrantLevel;
  requestedById: string;
  requestedByName: string;
  approverId: string;
  approverName: string;
  noteHe?: string;
}

export interface CreateDemoUserInput {
  name: string;
  email: string;
  phone: string;
  legacyRole: User["role"];
  actorId: string;
  actorName: string;
}

function nextNumericId(prefix: string, existing: readonly { id: string }[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const r of existing) {
    const m = re.exec(r.id);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${max + 1}`;
}

export class AdministrationService {
  readonly engine: ApprovalEngine;
  private readonly stores: UserStores;
  private readonly roles: RoleStores;
  private readonly clock: AdministrationClock;
  private readonly flags: EmergencyFlagPort;

  constructor(deps: AdministrationDeps) {
    this.stores = deps.stores;
    this.roles = deps.roles;
    this.clock = deps.clock ?? (() => new Date().toISOString());
    this.flags = deps.flags ?? localStorageFlagPort;
    this.engine = new ApprovalEngine({
      stores: deps.agentStores,
      clock: this.clock,
      externalHandlers: {
        [PERMISSION_ACTION]: async (payload) => {
          const requestId = String(payload.data.requestId ?? "");
          return this.executeApprovedChange(requestId);
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // typed update over the discriminated adminRecords collection
  // (Partial<Omit<union>> collapses to the common keys — this helper keeps
  // call sites typed per record kind without unsafe writes)
  // -------------------------------------------------------------------------

  private async updateAdminRecord<T extends AdministrationRecord>(
    id: string,
    patch: Partial<Omit<T, "id" | "recordKind">>,
  ): Promise<T> {
    const updated = await this.stores.adminRecords.update(
      id,
      patch as Partial<Omit<AdministrationRecord, "id">>,
    );
    return updated as T;
  }

  // -------------------------------------------------------------------------
  // guards
  // -------------------------------------------------------------------------

  private assertNotReadOnly(actionHe: string): void {
    if (this.flags.isActive("read-only-mode")) {
      throw new AdministrationError(
        "ADMIN_READ_ONLY",
        `מצב קריאה בלבד פעיל — הפעולה «${actionHe}» נדחתה. בטלו את מצב החירום כדי להמשיך.`,
      );
    }
  }

  private assertPermissionChangesUnlocked(): void {
    if (this.flags.isActive("permission-change-lock")) {
      throw new AdministrationError(
        "ADMIN_PERMISSION_LOCKED",
        "נעילת שינויי הרשאות פעילה — אין לפתוח או להכריע בקשות שינוי עד לביטול הנעילה",
      );
    }
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.stores.users.get(userId);
    if (!user) {
      throw new AdministrationError("ADMIN_NOT_FOUND", `משתמש ${userId} לא נמצא`);
    }
    return user;
  }

  private async audit(actor: string, action: string, entityRef: string, detailsHe: string): Promise<void> {
    const ts = this.clock();
    const existing = await this.stores.audit.list();
    const rec: AuditEvent = {
      id: nextNumericId("adm-audit", existing),
      createdAt: ts,
      updatedAt: ts,
      at: ts,
      actor,
      action,
      entityRef,
      details: detailsHe,
      correlationId: null,
    };
    await this.stores.audit.create(rec);
  }

  // -------------------------------------------------------------------------
  // baseline bridge (idempotent)
  // -------------------------------------------------------------------------

  /**
   * Idempotent: (1) the 9 canonical role records, (2) a role assignment per
   * seed user via the legacy→canonical mapping, (3) an initial pending access
   * review per user. Running twice creates nothing new (tested).
   */
  async ensureBaseline(): Promise<{ rolesCreated: number; assignmentsCreated: number; reviewsCreated: number }> {
    const ts = this.clock();
    let rolesCreated = 0;
    const existingRoles = await listCanonicalRoles(this.roles);
    const existingRoleIds = new Set(existingRoles.map((r) => r.roleId));
    for (const baseline of CANONICAL_ROLE_BASELINES) {
      if (existingRoleIds.has(baseline.roleId)) continue;
      const rec: RoleDefinitionRecord = {
        id: baseline.roleId,
        createdAt: ts,
        updatedAt: ts,
        recordKind: "canonical-role",
        roleId: baseline.roleId,
        nameHe: baseline.nameHe,
        descriptionHe: baseline.descriptionHe,
        grants: baseline.grants,
        demoLabelHe: ADMIN_DEMO_LABEL_HE,
      };
      roleDefinitionRecordSchema.parse(rec);
      await this.roles.raw.create(rec);
      rolesCreated += 1;
    }
    assertExactlyNineCanonicalRoles(
      (await listCanonicalRoles(this.roles)).map((r) => r.roleId),
    );

    const users = await this.stores.users.list();
    const adminRecords = await this.stores.adminRecords.list();
    const assignments = adminRecords.filter(
      (r): r is RoleAssignmentRecord => r.recordKind === "role-assignment",
    );
    const assigned = new Set(assignments.map((a) => a.userId));
    let assignmentsCreated = 0;
    for (const user of users) {
      if (assigned.has(user.id)) continue;
      const humanId = toHumanUserId(user.id); // constructive: ag-* can never be bridged
      const rec: RoleAssignmentRecord = {
        id: `ra-${user.id}`,
        createdAt: ts,
        updatedAt: ts,
        recordKind: "role-assignment",
        userId: humanId,
        roleId: LEGACY_ROLE_TO_CANONICAL[user.role],
        overrides: [],
        assignedById: humanId, // baseline bridge — self-derived from seed, audited
        demoLabelHe: ADMIN_DEMO_LABEL_HE,
      };
      roleAssignmentRecordSchema.parse(rec);
      await this.stores.adminRecords.create(rec);
      assignmentsCreated += 1;
    }

    const reviews = await this.stores.accessReviews.list();
    const reviewed = new Set(reviews.map((r) => r.userId));
    let reviewsCreated = 0;
    for (const user of users) {
      if (reviewed.has(user.id)) continue;
      const assignment = await this.requireAssignment(user.id);
      const due = new Date(ts);
      due.setUTCDate(due.getUTCDate() + 30);
      const rec: AccessReviewRecord = {
        id: `arv-${user.id}`,
        createdAt: ts,
        updatedAt: ts,
        userId: user.id,
        userName: user.name,
        roleId: assignment.roleId,
        status: "ממתין",
        dueAt: due.toISOString(),
        decidedById: null,
        decidedByName: null,
        decidedAt: null,
        noteHe: "סקירת גישה תקופתית ראשונה — נוצרה על ידי גשר ה-baseline",
        demoLabelHe: ADMIN_DEMO_LABEL_HE,
      };
      accessReviewRecordSchema.parse(rec);
      await this.stores.accessReviews.create(rec);
      reviewsCreated += 1;
    }
    if (rolesCreated + assignmentsCreated + reviewsCreated > 0) {
      await this.audit(
        "system",
        "admin.baseline.bridge",
        "administration:baseline",
        `גשר baseline: ${rolesCreated} תפקידים · ${assignmentsCreated} הקצאות · ${reviewsCreated} סקירות`,
      );
    }
    return { rolesCreated, assignmentsCreated, reviewsCreated };
  }

  // -------------------------------------------------------------------------
  // reads (bridged views)
  // -------------------------------------------------------------------------

  async listRoles(): Promise<RoleDefinitionRecord[]> {
    return listCanonicalRoles(this.roles);
  }

  private async requireAssignment(userId: string): Promise<RoleAssignmentRecord> {
    const all = await this.stores.adminRecords.list();
    const found = all.find(
      (r): r is RoleAssignmentRecord => r.recordKind === "role-assignment" && r.userId === userId,
    );
    if (!found) {
      throw new AdministrationError("ADMIN_NOT_FOUND", `אין הקצאת תפקיד למשתמש ${userId} — הריצו ensureBaseline`);
    }
    return found;
  }

  async effectiveGrants(userId: string): Promise<{ roleId: CanonicalRoleId; grants: RoleGrants; overrides: GrantOverride[] }> {
    const assignment = await this.requireAssignment(userId);
    const roles = await this.listRoles();
    const role = roles.find((r) => r.roleId === assignment.roleId);
    if (!role) {
      throw new AdministrationError("ADMIN_NOT_FOUND", `תפקיד ${assignment.roleId} לא נמצא`);
    }
    return {
      roleId: assignment.roleId,
      grants: applyOverrides(role.grants, assignment.overrides),
      overrides: assignment.overrides,
    };
  }

  async listAdministrativeUsers(): Promise<AdministrativeUser[]> {
    const [users, activities, orgs, reviews, adminRecords, roles] = await Promise.all([
      this.stores.users.list(),
      this.stores.activities.list(),
      this.stores.organizations.list(),
      this.stores.accessReviews.list(),
      this.stores.adminRecords.list(),
      this.listRoles(),
    ]);
    const assignments = adminRecords.filter(
      (r): r is RoleAssignmentRecord => r.recordKind === "role-assignment",
    );
    const requests = adminRecords.filter(
      (r): r is AccessChangeRequestRecord => r.recordKind === "access-change-request",
    );
    const teragon = orgs.find((o) => o.id === "org-1");
    const out: AdministrativeUser[] = [];
    for (const user of [...users].sort((a, b) => a.id.localeCompare(b.id))) {
      const assignment = assignments.find((a) => a.userId === user.id);
      if (!assignment) continue; // not bridged yet — ensureBaseline creates it
      const role = roles.find((r) => r.roleId === assignment.roleId);
      if (!role) continue;
      const lastActivity = activities
        .filter((a: Activity) => a.actorId === user.id)
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
        pendingReviewCount: reviews.filter((r) => r.userId === user.id && r.status === "ממתין").length,
        pendingChangeRequestCount: requests.filter(
          (r) => r.targetRef === `user:${user.id}` && r.status === "ממתין",
        ).length,
        suspended: user.status !== "פעיל",
      });
    }
    return out;
  }

  async listChangeRequests(): Promise<AccessChangeRequestRecord[]> {
    const all = await this.stores.adminRecords.list();
    return all
      .filter((r): r is AccessChangeRequestRecord => r.recordKind === "access-change-request")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listEmergencyRecords(): Promise<EmergencyDisableRecord[]> {
    const all = await this.stores.adminRecords.list();
    return all
      .filter((r): r is EmergencyDisableRecord => r.recordKind === "emergency-disable")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAccessReviews(): Promise<AccessReviewRecord[]> {
    return (await this.stores.accessReviews.list()).sort((a, b) => a.id.localeCompare(b.id));
  }

  async listAdminAudit(): Promise<AuditEvent[]> {
    const all = await this.stores.audit.list();
    return all
      .filter((a) => a.action.startsWith("admin."))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Derived org memberships — bridged from the seed, honestly labeled. */
  async organizationMemberships(): Promise<OrganizationMembership[]> {
    const [users, adminRecords, orgs] = await Promise.all([
      this.stores.users.list(),
      this.stores.adminRecords.list(),
      this.stores.organizations.list(),
    ]);
    const teragon = orgs.find((o) => o.id === "org-1");
    if (!teragon) return [];
    const assignments = adminRecords.filter(
      (r): r is RoleAssignmentRecord => r.recordKind === "role-assignment",
    );
    return users
      .map((u) => {
        const a = assignments.find((x) => x.userId === u.id);
        if (!a) return null;
        return {
          userId: u.id,
          organizationId: teragon.id,
          organizationName: teragon.name,
          roleId: a.roleId,
          sourceHe: "נגזר מנתוני ההדגמה — כל המשתמשים שייכים לארגון טרגון",
        } satisfies OrganizationMembership;
      })
      .filter((m): m is OrganizationMembership => m !== null);
  }

  /** Honest demo session: ONLY the current synthetic session, and it says so. */
  async syntheticSessions(): Promise<SessionRecord[]> {
    const user = await this.stores.users.get("u-tzachi");
    if (!user) return [];
    return [
      {
        id: "session-current",
        userId: user.id,
        userName: user.name,
        startedAt: this.clock(),
        synthetic: true,
        noteHe: "סשן סינתטי — מייצג את הסשן הנוכחי בדפדפן בלבד; אין ניהול סשנים אמיתי במצב הדגמה מקומי",
      },
    ];
  }

  // -------------------------------------------------------------------------
  // user actions
  // -------------------------------------------------------------------------

  async createDemoUser(input: CreateDemoUserInput): Promise<User> {
    this.assertNotReadOnly("יצירת משתמש הדגמה");
    const actor = toHumanUserId(input.actorId);
    const ts = this.clock();
    const users = await this.stores.users.list();
    const id = nextNumericId("u-demo", users);
    const user: User = {
      id,
      createdAt: ts,
      updatedAt: ts,
      name: input.name,
      role: input.legacyRole,
      email: input.email,
      phone: input.phone,
      status: "פעיל",
    };
    await this.stores.users.create(user);
    const rec: RoleAssignmentRecord = {
      id: `ra-${id}`,
      createdAt: ts,
      updatedAt: ts,
      recordKind: "role-assignment",
      userId: toHumanUserId(id),
      roleId: LEGACY_ROLE_TO_CANONICAL[input.legacyRole],
      overrides: [],
      assignedById: actor,
      demoLabelHe: ADMIN_DEMO_LABEL_HE,
    };
    roleAssignmentRecordSchema.parse(rec);
    await this.stores.adminRecords.create(rec);
    await this.audit(actor, "admin.user.create", `user:${id}`,
      `נוצר משתמש הדגמה «${input.name}» בתפקיד ${CANONICAL_ROLE_NAMES_HE[rec.roleId]} (${ADMIN_DEMO_LABEL_HE})`);
    return user;
  }

  async updateUserDisplay(
    userId: string,
    patch: Partial<Pick<User, "name" | "email" | "phone">>,
    actorId: string,
  ): Promise<User> {
    this.assertNotReadOnly("עדכון פרטי תצוגה");
    const actor = toHumanUserId(actorId);
    await this.requireUser(userId);
    const ts = this.clock();
    const updated = await this.stores.users.update(userId, { ...patch, updatedAt: ts });
    await this.audit(actor, "admin.user.update-display", `user:${userId}`,
      `עודכנו פרטי תצוגה: ${Object.keys(patch).join(", ")}`);
    return updated;
  }

  /**
   * Assign an EXISTING canonical role. Role change resets overrides (clean
   * slate — the previous per-user exceptions belonged to the previous role).
   */
  async assignRole(userId: string, roleId: CanonicalRoleId, actorId: string): Promise<RoleAssignmentRecord> {
    this.assertNotReadOnly("הקצאת תפקיד");
    const actor = toHumanUserId(actorId);
    const target = toHumanUserId(userId); // ag-* can never hold a role
    await this.requireUser(userId);
    const roles = await this.listRoles();
    const role = roles.find((r) => r.roleId === roleId);
    if (!role) throw new AdministrationError("ADMIN_NOT_FOUND", `תפקיד ${roleId} לא נמצא`);
    const assignment = await this.requireAssignment(userId);
    const ts = this.clock();
    const next: RoleAssignmentRecord = {
      ...assignment,
      roleId,
      overrides: [],
      assignedById: actor,
      updatedAt: ts,
    };
    roleAssignmentRecordSchema.parse(next);
    const updated = await this.updateAdminRecord<RoleAssignmentRecord>(assignment.id, next);
    await this.audit(actor, "admin.role.assign", `user:${target}`,
      `הוקצה התפקיד ${role.nameHe} (חריגים אישיים אופסו)`);
    return updated;
  }

  async suspendUser(userId: string, actorId: string, reasonHe: string): Promise<User> {
    this.assertNotReadOnly("השעיית גישה");
    const actor = toHumanUserId(actorId);
    if (userId === actorId) {
      throw new AdministrationError("ADMIN_STATE_INVALID", "משתמש אינו יכול להשעות את עצמו");
    }
    await this.requireUser(userId);
    const ts = this.clock();
    // EntityStatus has no "מושהה" — suspension = "לא פעיל" + audit (UI shows מושהה)
    const updated = await this.stores.users.update(userId, { status: "לא פעיל", updatedAt: ts });
    await this.audit(actor, "admin.user.suspend", `user:${userId}`, `גישת ההדגמה הושעתה — ${reasonHe}`);
    return updated;
  }

  async reactivateUser(userId: string, actorId: string): Promise<User> {
    this.assertNotReadOnly("החזרת גישה");
    const actor = toHumanUserId(actorId);
    await this.requireUser(userId);
    const ts = this.clock();
    const updated = await this.stores.users.update(userId, { status: "פעיל", updatedAt: ts });
    await this.audit(actor, "admin.user.reactivate", `user:${userId}`, "גישת ההדגמה הוחזרה");
    return updated;
  }

  // -------------------------------------------------------------------------
  // guarded permission-change workflow
  // preview → approval (canonical engine, named approver, not self) →
  // execute → verify → audit
  // -------------------------------------------------------------------------

  /** Compute the prospective grants for a request — used for preview AND validation. */
  private async prospectiveGrants(
    input: Pick<RequestPermissionChangeInput, "kind" | "targetId" | "domain" | "newLevel">,
  ): Promise<{ roleId: CanonicalRoleId; before: GrantLevel; after: RoleGrants; targetNameHe: string }> {
    if (input.kind === "user-override") {
      const user = await this.requireUser(input.targetId);
      const eff = await this.effectiveGrants(input.targetId);
      const after = applyOverrides(eff.grants, [{ domain: input.domain, level: input.newLevel }]);
      return { roleId: eff.roleId, before: eff.grants[input.domain], after, targetNameHe: user.name };
    }
    const roles = await this.listRoles();
    const role = roles.find((r) => r.roleId === input.targetId);
    if (!role) throw new AdministrationError("ADMIN_NOT_FOUND", `תפקיד ${input.targetId} לא נמצא`);
    const after = applyOverrides(role.grants, [{ domain: input.domain, level: input.newLevel }]);
    return { roleId: role.roleId, before: role.grants[input.domain], after, targetNameHe: role.nameHe };
  }

  async requestPermissionChange(input: RequestPermissionChangeInput): Promise<AccessChangeRequestRecord> {
    this.assertNotReadOnly("בקשת שינוי הרשאות");
    this.assertPermissionChangesUnlocked();
    const requester = toHumanUserId(input.requestedById);
    // named approver, human, never self — constructive at request time
    assertHumanApprover(input.approverId, input.requestedById);
    const approverUser = await this.requireUser(input.approverId);
    if (approverUser.status !== "פעיל") {
      throw new AdministrationError("ADMIN_APPROVER_INVALID", `המאשר ${approverUser.name} אינו פעיל`);
    }
    // constructive: an invalid combination cannot even be REQUESTED
    const prospect = await this.prospectiveGrants(input);
    assertValidCombination(prospect.roleId, prospect.after);
    assertNoGrantAll(prospect.roleId, prospect.after);

    const ts = this.clock();
    const existing = await this.stores.adminRecords.list();
    const id = nextNumericId("acr", existing);
    const previewHe =
      `${input.kind === "user-override" ? "שינוי הרשאה למשתמש" : "שינוי הרשאת תפקיד"} ` +
      `«${prospect.targetNameHe}» · ${PERMISSION_DOMAIN_LABELS_HE[input.domain]}: ` +
      `${GRANT_LEVEL_LABELS_HE[prospect.before]} ← ${GRANT_LEVEL_LABELS_HE[input.newLevel]}`;
    const rec: AccessChangeRequestRecord = {
      id,
      createdAt: ts,
      updatedAt: ts,
      recordKind: "access-change-request",
      kind: input.kind,
      targetRef: `${input.kind === "user-override" ? "user" : "role"}:${input.targetId}`,
      domain: input.domain,
      newLevel: input.newLevel,
      previousLevel: prospect.before,
      requestedById: requester,
      requestedByName: input.requestedByName,
      approverId: input.approverId,
      approverName: input.approverName,
      status: "ממתין",
      approvalId: null,
      runId: id,
      previewHe,
      decidedById: null,
      decidedAt: null,
      verifiedAt: null,
      noteHe: input.noteHe ?? "",
      demoLabelHe: ADMIN_DEMO_LABEL_HE,
    };
    accessChangeRequestRecordSchema.parse(rec);
    await this.stores.adminRecords.create(rec);
    const approval = await this.engine.requestApproval({
      runId: id,
      subjectRef: `access-change-request:${id}`,
      action: PERMISSION_ACTION,
      requestedById: input.requestedById,
      executionPayload: {
        kind: "external",
        action: PERMISSION_ACTION,
        descriptionHe: previewHe,
        data: { requestId: id },
      },
      previewHe,
    });
    const updated = await this.updateAdminRecord<AccessChangeRequestRecord>(id, {
      approvalId: approval.id,
      updatedAt: this.clock(),
    });
    await this.audit(requester, "admin.permission.request", `access-change-request:${id}`,
      `${previewHe} — ממתין לאישור של ${input.approverName}`);
    return updated;
  }

  private async requirePendingRequest(requestId: string): Promise<AccessChangeRequestRecord> {
    const rec = await this.stores.adminRecords.get(requestId);
    if (!rec || rec.recordKind !== "access-change-request") {
      throw new AdministrationError("ADMIN_NOT_FOUND", `בקשת שינוי ${requestId} לא נמצאה`);
    }
    if (rec.status !== "ממתין") {
      throw new AdministrationError("ADMIN_STATE_INVALID", `הבקשה ${requestId} כבר הוכרעה (${rec.status})`);
    }
    return rec;
  }

  /** All decider checks in one place: human, not requester, THE named approver. */
  private assertDecider(rec: AccessChangeRequestRecord, deciderId: string): void {
    toHumanUserId(deciderId); // ag-* never decides
    if (deciderId === rec.requestedById) {
      throw new AdministrationError(
        "ADMIN_SELF_APPROVAL_FORBIDDEN",
        "אישור עצמי חסום — מבקש השינוי אינו יכול להכריע בבקשתו",
      );
    }
    if (deciderId !== rec.approverId) {
      throw new AdministrationError(
        "ADMIN_APPROVER_INVALID",
        `רק המאשר בשם (${rec.approverName}) רשאי להכריע בבקשה זו`,
      );
    }
  }

  async approveChangeRequest(
    requestId: string,
    deciderId: string,
    noteHe?: string,
  ): Promise<AccessChangeRequestRecord> {
    this.assertNotReadOnly("אישור בקשת שינוי");
    this.assertPermissionChangesUnlocked();
    const rec = await this.requirePendingRequest(requestId);
    this.assertDecider(rec, deciderId);
    if (!rec.approvalId) {
      throw new AdministrationError("ADMIN_STATE_INVALID", "לבקשה אין רשומת אישור במנוע הקנוני");
    }
    const ts = this.clock();
    await this.engine.decide({
      runId: rec.runId,
      approvalId: rec.approvalId,
      kind: "approve",
      decidedById: deciderId,
      noteHe,
    });
    const result = await this.engine.execute(rec.runId, rec.approvalId, deciderId);
    if (result.outcome !== "הצלחה") {
      const failed = await this.updateAdminRecord<AccessChangeRequestRecord>(requestId, {
        status: "נכשל",
        decidedById: deciderId,
        decidedAt: ts,
        updatedAt: this.clock(),
      });
      await this.audit(deciderId, "admin.permission.execute-failed",
        `access-change-request:${requestId}`, result.detailHe);
      return failed;
    }
    // verify: read back the effective level and compare (no fake success)
    const verified = await this.verifyExecuted(rec);
    const done = await this.updateAdminRecord<AccessChangeRequestRecord>(requestId, {
      status: "בוצע",
      decidedById: deciderId,
      decidedAt: ts,
      verifiedAt: verified ? this.clock() : null,
      updatedAt: this.clock(),
    });
    await this.audit(deciderId, "admin.permission.execute", `access-change-request:${requestId}`,
      `${rec.previewHe} — בוצע${verified ? " ואומת בקריאה חוזרת" : " אך האימות נכשל"}`);
    if (!verified) {
      throw new AdministrationError("ADMIN_STATE_INVALID",
        "הביצוע דווח כהצלחה אך קריאת האימות החזירה רמה שונה — נבדק ונרשם ב-audit");
    }
    return done;
  }

  async rejectChangeRequest(
    requestId: string,
    deciderId: string,
    noteHe: string,
  ): Promise<AccessChangeRequestRecord> {
    this.assertNotReadOnly("דחיית בקשת שינוי");
    const rec = await this.requirePendingRequest(requestId);
    this.assertDecider(rec, deciderId);
    if (!rec.approvalId) {
      throw new AdministrationError("ADMIN_STATE_INVALID", "לבקשה אין רשומת אישור במנוע הקנוני");
    }
    const ts = this.clock();
    await this.engine.decide({
      runId: rec.runId,
      approvalId: rec.approvalId,
      kind: "reject",
      decidedById: deciderId,
      noteHe,
    });
    const updated = await this.updateAdminRecord<AccessChangeRequestRecord>(requestId, {
      status: "נדחה",
      decidedById: deciderId,
      decidedAt: ts,
      noteHe,
      updatedAt: this.clock(),
    });
    await this.audit(deciderId, "admin.permission.reject", `access-change-request:${requestId}`,
      `${rec.previewHe} — נדחה: ${noteHe}`);
    return updated;
  }

  /** The engine-invoked execution — re-validates, applies, never fakes. */
  private async executeApprovedChange(requestId: string): Promise<{ resultRef: string | null; detailHe: string }> {
    const rec = await this.stores.adminRecords.get(requestId);
    if (!rec || rec.recordKind !== "access-change-request") {
      throw new AdministrationError("ADMIN_NOT_FOUND", `בקשת שינוי ${requestId} לא נמצאה בביצוע`);
    }
    const targetId = rec.targetRef.split(":")[1] ?? "";
    // re-validate at execution time (state may have drifted since request)
    const prospect = await this.prospectiveGrants({
      kind: rec.kind,
      targetId,
      domain: rec.domain,
      newLevel: rec.newLevel,
    });
    assertValidCombination(prospect.roleId, prospect.after);
    assertNoGrantAll(prospect.roleId, prospect.after);
    const ts = this.clock();
    if (rec.kind === "user-override") {
      const assignment = await this.requireAssignment(targetId);
      const overrides = [
        ...assignment.overrides.filter((o) => o.domain !== rec.domain),
        { domain: rec.domain, level: rec.newLevel },
      ];
      const next = { ...assignment, overrides, updatedAt: ts };
      roleAssignmentRecordSchema.parse(next);
      await this.updateAdminRecord<RoleAssignmentRecord>(assignment.id, next);
      return { resultRef: `role-assignment:${assignment.id}`, detailHe: rec.previewHe };
    }
    const roles = await this.listRoles();
    const role = roles.find((r) => r.roleId === targetId);
    if (!role) throw new AdministrationError("ADMIN_NOT_FOUND", `תפקיד ${targetId} לא נמצא בביצוע`);
    const nextRole = {
      ...role,
      grants: { ...role.grants, [rec.domain]: rec.newLevel },
      updatedAt: ts,
    };
    roleDefinitionRecordSchema.parse(nextRole);
    await this.roles.raw.update(role.id, nextRole);
    return { resultRef: `canonical-role:${role.id}`, detailHe: rec.previewHe };
  }

  private async verifyExecuted(rec: AccessChangeRequestRecord): Promise<boolean> {
    const targetId = rec.targetRef.split(":")[1] ?? "";
    if (rec.kind === "user-override") {
      const eff = await this.effectiveGrants(targetId);
      return eff.grants[rec.domain] === rec.newLevel;
    }
    const roles = await this.listRoles();
    const role = roles.find((r) => r.roleId === targetId);
    return role !== undefined && role.grants[rec.domain] === rec.newLevel;
  }

  // -------------------------------------------------------------------------
  // access reviews
  // -------------------------------------------------------------------------

  async decideAccessReview(
    reviewId: string,
    status: "אושר" | "נדחה",
    deciderId: string,
    deciderName: string,
    noteHe: string,
  ): Promise<AccessReviewRecord> {
    this.assertNotReadOnly("הכרעת סקירת גישה");
    toHumanUserId(deciderId);
    const review = await this.stores.accessReviews.get(reviewId);
    if (!review) throw new AdministrationError("ADMIN_NOT_FOUND", `סקירה ${reviewId} לא נמצאה`);
    if (review.status !== "ממתין") {
      throw new AdministrationError("ADMIN_STATE_INVALID", `הסקירה ${reviewId} כבר הוכרעה`);
    }
    if (deciderId === review.userId) {
      throw new AdministrationError("ADMIN_SELF_APPROVAL_FORBIDDEN",
        "משתמש אינו סוקר את הגישה של עצמו");
    }
    const ts = this.clock();
    const updated = await this.stores.accessReviews.update(reviewId, {
      status,
      decidedById: toHumanUserId(deciderId),
      decidedByName: deciderName,
      decidedAt: ts,
      noteHe,
      updatedAt: ts,
    });
    await this.audit(deciderId, "admin.access-review.decide", `access-review:${reviewId}`,
      `סקירת הגישה של ${review.userName} הוכרעה: ${status} — ${noteHe}`);
    return updated;
  }

  // -------------------------------------------------------------------------
  // emergency controls
  // -------------------------------------------------------------------------

  async activateEmergencyControl(input: {
    control: EmergencyControlKind;
    targetAgentId?: string;
    actorId: string;
    actorName: string;
    reasonHe: string;
  }): Promise<EmergencyDisableRecord> {
    // emergency activation is allowed even in read-only mode (it IS the emergency system)
    const actor = toHumanUserId(input.actorId);
    const ts = this.clock();
    let targetRef: string | null = null;
    if (input.control === "agent-disable") {
      const agentId = input.targetAgentId ?? "";
      const agent = await this.stores.agents.get(agentId);
      if (!agent) throw new AdministrationError("ADMIN_NOT_FOUND", `סוכן ${agentId} לא נמצא`);
      // reuse the W5-D mechanism exactly: status on the agents record
      await this.stores.agents.update(agentId, { status: AGENT_DISABLED_STATUS, updatedAt: ts });
      targetRef = `agent:${agentId}`;
    } else if (isFlagBackedControl(input.control)) {
      this.flags.set(input.control, true);
    }
    const existing = await this.stores.adminRecords.list();
    const rec: EmergencyDisableRecord = {
      id: nextNumericId("emg", existing),
      createdAt: ts,
      updatedAt: ts,
      recordKind: "emergency-disable",
      control: input.control,
      targetRef,
      state: "פעיל",
      activatedById: actor,
      activatedByName: input.actorName,
      reasonHe: input.reasonHe,
      deactivatedAt: null,
      honestScopeHe: EMERGENCY_HONEST_SCOPE_HE[input.control],
      demoLabelHe: ADMIN_DEMO_LABEL_HE,
    };
    emergencyDisableRecordSchema.parse(rec);
    await this.stores.adminRecords.create(rec);
    await this.audit(actor, "admin.emergency.activate", `emergency:${rec.id}`,
      `${EMERGENCY_CONTROL_LABELS_HE[input.control]}${targetRef ? ` (${targetRef})` : ""} הופעלה — ${input.reasonHe}`);
    return rec;
  }

  async deactivateEmergencyControl(recordId: string, actorId: string, actorName: string): Promise<EmergencyDisableRecord> {
    const actor = toHumanUserId(actorId);
    const rec = await this.stores.adminRecords.get(recordId);
    if (!rec || rec.recordKind !== "emergency-disable") {
      throw new AdministrationError("ADMIN_NOT_FOUND", `רשומת חירום ${recordId} לא נמצאה`);
    }
    if (rec.state !== "פעיל") {
      throw new AdministrationError("ADMIN_STATE_INVALID", `בקרת החירום ${recordId} כבר בוטלה`);
    }
    const ts = this.clock();
    if (rec.control === "agent-disable" && rec.targetRef) {
      const agentId = rec.targetRef.replace(/^agent:/, "");
      const agent = await this.stores.agents.get(agentId);
      if (agent) await this.stores.agents.update(agentId, { status: "פעיל", updatedAt: ts });
    } else if (isFlagBackedControl(rec.control)) {
      this.flags.set(rec.control, false);
    }
    const updated = await this.updateAdminRecord<EmergencyDisableRecord>(recordId, {
      state: "בוטל",
      deactivatedAt: ts,
      updatedAt: ts,
    });
    await this.audit(actor, "admin.emergency.deactivate", `emergency:${recordId}`,
      `${EMERGENCY_CONTROL_LABELS_HE[rec.control]} בוטלה על ידי ${actorName}`);
    return updated;
  }
}
