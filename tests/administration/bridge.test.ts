// W8-C — baseline bridge: 9 canonical roles + assignments from the 5 seed
// users + initial access reviews. Idempotent (second run creates nothing).
import { beforeEach, describe, expect, it } from "vitest";
import { listCanonicalRoles } from "@/repositories/roleStores";
import {
  ADMIN_DEMO_LABEL_HE,
  AdministrationError,
  assertExactlyNineCanonicalRoles,
} from "@/domain/administration";
import { freshFixture, type Fixture } from "./helpers";

let fx: Fixture;

beforeEach(() => {
  fx = freshFixture();
});

describe("ensureBaseline (idempotent bridge)", () => {
  it("creates exactly 9 roles + 5 assignments + 5 reviews on a fresh seed", async () => {
    const r = await fx.service.ensureBaseline();
    expect(r).toEqual({ rolesCreated: 9, assignmentsCreated: 5, reviewsCreated: 5 });
  });

  it("is idempotent — the second run creates nothing", async () => {
    await fx.service.ensureBaseline();
    const second = await fx.service.ensureBaseline();
    expect(second).toEqual({ rolesCreated: 0, assignmentsCreated: 0, reviewsCreated: 0 });
    const roles = await listCanonicalRoles(fx.roles);
    expect(roles).toHaveLength(9);
  });

  it("bridged roles satisfy the exactly-9 guard and carry the demo label", async () => {
    await fx.service.ensureBaseline();
    const roles = await listCanonicalRoles(fx.roles);
    expect(() => assertExactlyNineCanonicalRoles(roles.map((r) => r.roleId))).not.toThrow();
    for (const role of roles) expect(role.demoLabelHe).toBe(ADMIN_DEMO_LABEL_HE);
  });

  it("maps every legacy seed role to the right canonical role", async () => {
    await fx.service.ensureBaseline();
    const rows = await fx.service.listAdministrativeUsers();
    const byId = Object.fromEntries(rows.map((r) => [r.user.id, r.roleId]));
    expect(byId).toEqual({
      "u-tzachi": "crole-ceo",
      "u-maya": "crole-sales",
      "u-oren": "crole-instructor",
      "u-ran": "crole-service",
      "u-noa": "crole-sysadmin",
    });
  });

  it("does not touch the 6 legacy seed role records", async () => {
    await fx.service.ensureBaseline();
    const all = await fx.roles.raw.list();
    const legacy = all.filter((r) => r.id.startsWith("role-"));
    expect(legacy).toHaveLength(6);
  });
});

describe("bridged user views", () => {
  it("every user row has effective grants, the Teragon org and honest activity", async () => {
    await fx.service.ensureBaseline();
    const rows = await fx.service.listAdministrativeUsers();
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.organizationNames).toEqual(["טרגון טכנולוגיות"]);
      expect(row.suspended).toBe(false);
      expect(row.pendingReviewCount).toBe(1); // the initial bridge review
      expect(Object.keys(row.effectiveGrants)).toHaveLength(13);
    }
  });

  it("organization memberships derive one Teragon membership per user", async () => {
    await fx.service.ensureBaseline();
    const memberships = await fx.service.organizationMemberships();
    expect(memberships).toHaveLength(5);
    for (const m of memberships) expect(m.organizationId).toBe("org-1");
  });

  it("synthetic sessions: exactly one honest current-session record", async () => {
    const sessions = await fx.service.syntheticSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.synthetic).toBe(true);
    expect(sessions[0]?.noteHe).toContain("סינתטי");
  });
});

describe("user actions", () => {
  beforeEach(async () => {
    await fx.service.ensureBaseline();
  });

  it("createDemoUser creates a user + viewer assignment for תלמיד and audits", async () => {
    const user = await fx.service.createDemoUser({
      name: "דנה בדיקה",
      email: "dana@test.demo",
      phone: "050-1111111",
      legacyRole: "תלמיד",
      actorId: "u-noa",
      actorName: "נעה פרידמן",
    });
    expect(user.id).toBe("u-demo-1");
    const rows = await fx.service.listAdministrativeUsers();
    const row = rows.find((r) => r.user.id === user.id);
    expect(row?.roleId).toBe("crole-viewer");
    const audit = await fx.service.listAdminAudit();
    expect(audit.some((a) => a.action === "admin.user.create")).toBe(true);
  });

  it("createDemoUser is blocked for an ag-* actor", async () => {
    await expect(
      fx.service.createDemoUser({
        name: "x",
        email: "x@x",
        phone: "0",
        legacyRole: "תלמיד",
        actorId: "ag-flow",
        actorName: "Flow",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AI_ACTOR_FORBIDDEN" });
  });

  it("assignRole assigns an existing canonical role and resets overrides", async () => {
    const updated = await fx.service.assignRole("u-oren", "crole-champion", "u-noa");
    expect(updated.roleId).toBe("crole-champion");
    expect(updated.overrides).toEqual([]);
    const audit = await fx.service.listAdminAudit();
    expect(audit.some((a) => a.action === "admin.role.assign")).toBe(true);
  });

  it("assignRole rejects an ag-* target — an agent can never hold a role", async () => {
    await expect(fx.service.assignRole("ag-hunter", "crole-sales", "u-noa")).rejects.toMatchObject({
      code: "ADMIN_AI_ACTOR_FORBIDDEN",
    });
  });

  it("suspend + reactivate flip status and audit; self-suspension is blocked", async () => {
    const suspended = await fx.service.suspendUser("u-maya", "u-noa", "בדיקת השעיה");
    expect(suspended.status).toBe("לא פעיל");
    const rows = await fx.service.listAdministrativeUsers();
    expect(rows.find((r) => r.user.id === "u-maya")?.suspended).toBe(true);
    const back = await fx.service.reactivateUser("u-maya", "u-noa");
    expect(back.status).toBe("פעיל");
    await expect(fx.service.suspendUser("u-noa", "u-noa", "עצמי")).rejects.toBeInstanceOf(
      AdministrationError,
    );
    const audit = await fx.service.listAdminAudit();
    expect(audit.some((a) => a.action === "admin.user.suspend")).toBe(true);
    expect(audit.some((a) => a.action === "admin.user.reactivate")).toBe(true);
  });
});
