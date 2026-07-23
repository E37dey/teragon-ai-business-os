// W8-C — the constructive guards: invalid combinations, ag-* exclusion,
// self-approval, grant-all, exactly-9 — at both the function AND schema level.
import { describe, expect, it } from "vitest";
import {
  ADMIN_DEMO_LABEL_HE,
  AdministrationError,
  CANONICAL_ROLE_BASELINES,
  CANONICAL_ROLE_IDS,
  PERMISSION_DOMAINS,
  accessChangeRequestRecordSchema,
  applyOverrides,
  assertExactlyNineCanonicalRoles,
  assertHumanApprover,
  assertNoGrantAll,
  assertValidCombination,
  getRoleBaseline,
  isAiAgentId,
  roleAssignmentRecordSchema,
  roleDefinitionRecordSchema,
  roleGrantViolations,
  toHumanUserId,
  type GrantLevel,
  type PermissionDomain,
  type RoleGrants,
} from "@/domain/administration";
import { AGENT_IDS } from "@/agents/definitions";

function grantsWith(base: RoleGrants, patch: Partial<Record<PermissionDomain, GrantLevel>>): RoleGrants {
  return applyOverrides(
    base,
    Object.entries(patch).map(([domain, level]) => ({
      domain: domain as PermissionDomain,
      level: level as GrantLevel,
    })),
  );
}

describe("invalid-combination rules (constructive)", () => {
  it("every one of the 9 canonical baselines is violation-free", () => {
    for (const b of CANONICAL_ROLE_BASELINES) {
      expect(roleGrantViolations(b.roleId, b.grants)).toEqual([]);
    }
  });

  it("R1: צופה never write — any write/approve is a violation", () => {
    const viewer = getRoleBaseline("crole-viewer");
    for (const level of ["write", "approve"] as const) {
      const v = roleGrantViolations("crole-viewer", grantsWith(viewer.grants, { crm: level }));
      expect(v).toHaveLength(1);
      expect(v[0]?.ruleId).toBe("R1-viewer-write");
    }
  });

  it("R2: Champion never edits system policy (governance/administration)", () => {
    const champ = getRoleBaseline("crole-champion");
    const v1 = roleGrantViolations("crole-champion", grantsWith(champ.grants, { governance: "write" }));
    expect(v1.map((v) => v.ruleId)).toEqual(["R2-champion-policy"]);
    const v2 = roleGrantViolations("crole-champion", grantsWith(champ.grants, { administration: "approve" }));
    expect(v2.map((v) => v.ruleId)).toEqual(["R2-champion-policy"]);
    // read is allowed
    expect(roleGrantViolations("crole-champion", grantsWith(champ.grants, { governance: "read" }))).toEqual([]);
  });

  it("R3: מכירות has NO restricted technical memory — even read violates", () => {
    const sales = getRoleBaseline("crole-sales");
    const v = roleGrantViolations("crole-sales", grantsWith(sales.grants, { "memory-restricted": "read" }));
    expect(v.map((x) => x.ruleId)).toEqual(["R3-sales-restricted"]);
  });

  it("R4: שירות never approves financial discounts — approve on finance violates", () => {
    const service = getRoleBaseline("crole-service");
    const v = roleGrantViolations("crole-service", grantsWith(service.grants, { finance: "approve" }));
    expect(v.map((x) => x.ruleId)).toEqual(["R4-service-discount"]);
    // read/write finance is not the banned combination
    expect(roleGrantViolations("crole-service", grantsWith(service.grants, { finance: "read" }))).toEqual([]);
  });

  it("assertValidCombination throws a typed AdministrationError", () => {
    const viewer = getRoleBaseline("crole-viewer");
    try {
      assertValidCombination("crole-viewer", grantsWith(viewer.grants, { sales: "write" }));
      expect.unreachable("היה אמור לזרוק");
    } catch (err) {
      expect(err).toBeInstanceOf(AdministrationError);
      expect((err as AdministrationError).code).toBe("ADMIN_INVALID_COMBINATION");
    }
  });
});

describe("AI-agent exclusion (ag-* never role-holder / approver)", () => {
  it("isAiAgentId matches every frozen agent definition id", () => {
    expect(AGENT_IDS.length).toBeGreaterThan(0);
    for (const id of AGENT_IDS) {
      expect(isAiAgentId(id)).toBe(true);
    }
    expect(isAiAgentId("u-tzachi")).toBe(false);
  });

  it("toHumanUserId throws ADMIN_AI_ACTOR_FORBIDDEN for agents and rejects empty ids", () => {
    expect(toHumanUserId("u-noa")).toBe("u-noa");
    try {
      toHumanUserId("ag-hunter");
      expect.unreachable();
    } catch (err) {
      expect((err as AdministrationError).code).toBe("ADMIN_AI_ACTOR_FORBIDDEN");
    }
    expect(() => toHumanUserId("  ")).toThrow(AdministrationError);
  });

  it("assertHumanApprover blocks self-approval", () => {
    expect(assertHumanApprover("u-noa", "u-tzachi")).toBe("u-noa");
    try {
      assertHumanApprover("u-tzachi", "u-tzachi");
      expect.unreachable();
    } catch (err) {
      expect((err as AdministrationError).code).toBe("ADMIN_SELF_APPROVAL_FORBIDDEN");
    }
  });
});

describe("no silent grant-all", () => {
  it("write-or-above on EVERY domain is rejected for any role", () => {
    const all = Object.fromEntries(PERMISSION_DOMAINS.map((d) => [d, "approve"])) as Record<
      PermissionDomain,
      GrantLevel
    >;
    try {
      assertNoGrantAll("crole-sysadmin", all);
      expect.unreachable();
    } catch (err) {
      expect((err as AdministrationError).code).toBe("ADMIN_GRANT_ALL_FORBIDDEN");
    }
  });

  it("every canonical baseline passes (none of the 9 is grant-all)", () => {
    for (const b of CANONICAL_ROLE_BASELINES) {
      expect(() => assertNoGrantAll(b.roleId, b.grants)).not.toThrow();
    }
  });
});

describe("exactly-9 canonical roles", () => {
  it("the canonical id list passes", () => {
    expect(() => assertExactlyNineCanonicalRoles(CANONICAL_ROLE_IDS)).not.toThrow();
  });

  it("missing / extra / duplicate ids throw ADMIN_ROLE_COUNT_INVALID", () => {
    const missing = CANONICAL_ROLE_IDS.slice(0, 8);
    const extra = [...CANONICAL_ROLE_IDS, "crole-extra"];
    const dupes = [...CANONICAL_ROLE_IDS.slice(0, 8), "crole-viewer", "crole-viewer"];
    for (const list of [missing, extra, dupes]) {
      try {
        assertExactlyNineCanonicalRoles(list);
        expect.unreachable();
      } catch (err) {
        expect((err as AdministrationError).code).toBe("ADMIN_ROLE_COUNT_INVALID");
      }
    }
  });
});

describe("schema-level constructive enforcement", () => {
  const ts = "2026-07-23T09:00:00.000Z";

  it("roleDefinitionRecordSchema rejects a viewer-with-write record", () => {
    const viewer = getRoleBaseline("crole-viewer");
    const bad = {
      id: "crole-viewer",
      createdAt: ts,
      updatedAt: ts,
      recordKind: "canonical-role",
      roleId: "crole-viewer",
      nameHe: viewer.nameHe,
      descriptionHe: viewer.descriptionHe,
      grants: { ...viewer.grants, crm: "write" },
      demoLabelHe: ADMIN_DEMO_LABEL_HE,
    };
    expect(roleDefinitionRecordSchema.safeParse(bad).success).toBe(false);
  });

  it("roleAssignmentRecordSchema rejects an ag-* role holder", () => {
    const bad = {
      id: "ra-ag-hunter",
      createdAt: ts,
      updatedAt: ts,
      recordKind: "role-assignment",
      userId: "ag-hunter",
      roleId: "crole-sales",
      overrides: [],
      assignedById: "u-tzachi",
      demoLabelHe: ADMIN_DEMO_LABEL_HE,
    };
    expect(roleAssignmentRecordSchema.safeParse(bad).success).toBe(false);
  });

  it("accessChangeRequestRecordSchema rejects self-approval and ag-* approver/decider", () => {
    const base = {
      id: "acr-1",
      createdAt: ts,
      updatedAt: ts,
      recordKind: "access-change-request",
      kind: "user-override",
      targetRef: "user:u-maya",
      domain: "service",
      newLevel: "write",
      previousLevel: "read",
      requestedById: "u-tzachi",
      requestedByName: "צחי זוסטייהם",
      approverId: "u-noa",
      approverName: "נעה פרידמן",
      status: "ממתין",
      approvalId: null,
      runId: "acr-1",
      previewHe: "בדיקה",
      decidedById: null,
      decidedAt: null,
      verifiedAt: null,
      noteHe: "",
      demoLabelHe: ADMIN_DEMO_LABEL_HE,
    };
    expect(accessChangeRequestRecordSchema.safeParse(base).success).toBe(true);
    expect(
      accessChangeRequestRecordSchema.safeParse({ ...base, approverId: "u-tzachi" }).success,
    ).toBe(false);
    expect(
      accessChangeRequestRecordSchema.safeParse({ ...base, approverId: "ag-fixer" }).success,
    ).toBe(false);
    expect(
      accessChangeRequestRecordSchema.safeParse({ ...base, decidedById: "ag-orchestrator" }).success,
    ).toBe(false);
  });
});
