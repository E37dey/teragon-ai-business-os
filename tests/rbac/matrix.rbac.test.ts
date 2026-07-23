// W9-B — the derived role→permission matrix. Every expectation is checked
// against the FROZEN W8-C RoleDefinition grants, so this file also pins that
// the derivation stayed faithful (no hand-drift).
import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  requirePermission,
  AuthorizationError,
  permissionsForRole,
  rolesWithPermission,
  permissionRequirement,
  type Permission,
} from "@/authorization";
import {
  CANONICAL_ROLE_BASELINES,
  CANONICAL_ROLE_IDS,
  GRANT_RANK,
} from "@/domain/administration";

describe("W9-B — canonical permission vocabulary", () => {
  it("is EXACTLY the mandated 24 permissions, no more no less", () => {
    expect(PERMISSIONS).toHaveLength(24);
    expect(new Set(PERMISSIONS).size).toBe(24);
    expect([...PERMISSIONS].sort()).toEqual(
      [
        "agent.disable",
        "audit.read",
        "automation.approve",
        "course.manage",
        "customer.create",
        "customer.read",
        "customer.update",
        "discount.approve",
        "governance.review",
        "health.diagnostics",
        "knowledge.review",
        "learning.approve",
        "memory.approve",
        "permission.approve",
        "policy.approve",
        "quotation.approve",
        "quotation.create",
        "sales.read",
        "service.close",
        "service.read",
        "service.update",
        "settings.update",
        "submission.approve",
        "user.manage",
      ].sort(),
    );
  });

  it("every .approve permission requires an APPROVE-level grant", () => {
    for (const p of PERMISSIONS) {
      if (p.endsWith(".approve")) {
        expect(permissionRequirement(p).minLevel).toBe("approve");
      }
    }
  });
});

describe("W9-B — matrix is faithfully DERIVED from the frozen grants", () => {
  it("role holds a permission iff its grant on the domain meets the level", () => {
    const grantsByRole = new Map(CANONICAL_ROLE_BASELINES.map((b) => [b.roleId, b.grants]));
    for (const role of CANONICAL_ROLE_IDS) {
      for (const p of PERMISSIONS) {
        const req = permissionRequirement(p);
        const grant = grantsByRole.get(role)![req.domain];
        const expected = GRANT_RANK[grant] >= GRANT_RANK[req.minLevel];
        expect(can(role, p)).toBe(expected);
      }
    }
  });

  it("covers all 9 canonical roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...CANONICAL_ROLE_IDS].sort());
  });
});

describe("W9-B — key role expectations (honest business separation)", () => {
  it("צופה (viewer) holds ONLY read-entry permissions — never write/approve", () => {
    expect(permissionsForRole("crole-viewer").sort()).toEqual(
      ["customer.read", "sales.read", "service.read"].sort(),
    );
    for (const p of PERMISSIONS) {
      if (p.endsWith(".approve") || p.endsWith(".create") || p.endsWith(".update")) {
        expect(can("crole-viewer", p)).toBe(false);
      }
    }
  });

  it("שירות (service) never holds discount.approve (R4 — financial discounts)", () => {
    expect(can("crole-service", "discount.approve")).toBe(false);
    expect(permissionsForRole("crole-service").sort()).toEqual(
      ["customer.read", "service.read", "service.update", "service.close"].sort(),
    );
  });

  it("Champion never holds policy.approve / permission.approve (R2 — no policy edits)", () => {
    expect(can("crole-champion", "policy.approve")).toBe(false);
    expect(can("crole-champion", "permission.approve")).toBe(false);
    expect(can("crole-champion", "governance.review")).toBe(true); // read is fine
  });

  it("מכירות (sales) can create but NOT approve quotations/discounts", () => {
    expect(can("crole-sales", "quotation.create")).toBe(true);
    expect(can("crole-sales", "quotation.approve")).toBe(false);
    expect(can("crole-sales", "discount.approve")).toBe(false);
  });

  it("only מנכ\"ל and מנהל עסקי approve quotations and discounts", () => {
    expect(rolesWithPermission("quotation.approve").sort()).toEqual(
      ["crole-ceo", "crole-bizmgr"].sort(),
    );
    expect(rolesWithPermission("discount.approve").sort()).toEqual(
      ["crole-ceo", "crole-bizmgr"].sort(),
    );
  });

  it("only מנהל מערכת and מנכ\"ל manage users / approve permissions", () => {
    expect(rolesWithPermission("user.manage").sort()).toEqual(
      ["crole-sysadmin", "crole-ceo"].sort(),
    );
    expect(rolesWithPermission("permission.approve").sort()).toEqual(
      ["crole-sysadmin", "crole-ceo"].sort(),
    );
  });

  it("every role can read customers (crm read is universal)", () => {
    expect(rolesWithPermission("customer.read").sort()).toEqual([...CANONICAL_ROLE_IDS].sort());
  });
});

describe("W9-B — requirePermission throws AUTHZ_DENIED for the unauthorized", () => {
  it("throws a structured AuthorizationError with Hebrew reason", () => {
    let caught: unknown;
    try {
      requirePermission("crole-viewer", "user.manage");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthorizationError);
    const e = caught as AuthorizationError;
    expect(e.code).toBe("AUTHZ_DENIED");
    expect(e.permission).toBe<Permission>("user.manage");
    expect(e.reasonHe).toContain("סימולציית הרשאות במצב הדגמה");
  });

  it("does not throw for an authorized role", () => {
    expect(() => requirePermission("crole-sysadmin", "user.manage")).not.toThrow();
  });
});
