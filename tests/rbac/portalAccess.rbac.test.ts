// vNext Phase B — portal access matrix (true RBAC, not nav hiding).
//
// Proves that the route guard authorizes by the trusted canonical role: the
// Manager portal role sees the executive routes; Student/Technician are DENIED
// on the SAME routes — the exact denials a typed-URL attempt would hit, because
// <RequirePermission> consults routePermission() + can() on every render.
import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/authorization/portalRoutes";
import { portalForRole } from "@/authorization/portals";
import { DEMO_ACCOUNTS, authenticateDemo } from "@/auth/demoAccounts";
import type { CanonicalRoleId } from "@/domain/administration";

/** Effective route access = canonical RBAC AND derived portal scope. */
function canView(role: CanonicalRoleId, path: string): boolean {
  return canAccessRoute(role, path);
}

const MANAGER: CanonicalRoleId = "crole-bizmgr";
const STUDENT: CanonicalRoleId = "crole-viewer";
const TECH: CanonicalRoleId = "crole-service";

describe("portal ↔ role mapping (presentation only, derived from role)", () => {
  it("each demo account's portal equals portalForRole(canonicalRole)", () => {
    for (const a of DEMO_ACCOUNTS) {
      expect(a.portal).toBe(portalForRole(a.canonicalRole));
    }
  });
  it("maps the three canonical roles to the three portals", () => {
    expect(portalForRole(MANAGER)).toBe("manager");
    expect(portalForRole(STUDENT)).toBe("student");
    expect(portalForRole(TECH)).toBe("technician");
  });
});

describe("Manager (bizmgr) — broad operational ALLOW", () => {
  for (const p of ["/", "/analytics", "/automations", "/agents", "/agents/collaboration", "/memory", "/tasks", "/customers", "/knowledge", "/governance"]) {
    it(`ALLOW ${p}`, () => expect(canView(MANAGER, p)).toBe(true));
  }
});

describe("Manager (bizmgr) != sysadmin — sysadmin-only capabilities stay DENIED", () => {
  // The manager PORTAL is broad, but the CAPABILITY layer must not promote bizmgr
  // to sysadmin. These routes are sysadmin-only and must be denied to the manager
  // even though the portal would otherwise allow every module.
  for (const p of ["/administration", "/system-health", "/settings"]) {
    it(`DENY bizmgr ${p}`, () => expect(canView(MANAGER, p)).toBe(false));
    it(`(sanity) sysadmin ALLOW ${p}`, () => expect(canView("crole-sysadmin", p)).toBe(true));
  }
});

describe("Student (viewer) — DENY executive, ALLOW learning", () => {
  for (const p of ["/analytics", "/automations", "/agents", "/agents/collaboration", "/memory", "/governance", "/administration", "/system-health", "/settings"]) {
    it(`DENY ${p}`, () => expect(canView(STUDENT, p)).toBe(false));
  }
  for (const p of ["/", "/learning", "/knowledge", "/courses", "/tasks", "/faq", "/support"]) {
    it(`ALLOW ${p}`, () => expect(canView(STUDENT, p)).toBe(true));
  }
});

describe("Technician (service) — DENY executive/admin, ALLOW field work", () => {
  for (const p of ["/analytics", "/automations", "/governance", "/administration", "/system-health", "/settings"]) {
    it(`DENY ${p}`, () => expect(canView(TECH, p)).toBe(false));
  }
  for (const p of ["/", "/tasks", "/service", "/printers", "/knowledge", "/customers", "/contacts"]) {
    it(`ALLOW ${p}`, () => expect(canView(TECH, p)).toBe(true));
  }
});

describe("demo credentials are authoritative + non-escalating", () => {
  it("correct credentials resolve exactly the account's fixed role", () => {
    expect(authenticateDemo("manager@teragon.demo", "TeragonManager2026!")?.canonicalRole).toBe(MANAGER);
    expect(authenticateDemo("student@teragon.demo", "TeragonStudent2026!")?.canonicalRole).toBe(STUDENT);
    expect(authenticateDemo("technician@teragon.demo", "TeragonTech2026!")?.canonicalRole).toBe(TECH);
  });
  it("wrong password → no account (no silent access)", () => {
    expect(authenticateDemo("manager@teragon.demo", "wrong")).toBeNull();
  });
  it("a student credential can NEVER yield manager authorization", () => {
    const acc = authenticateDemo("student@teragon.demo", "TeragonStudent2026!");
    expect(acc?.canonicalRole).toBe(STUDENT);
    expect(canView(acc!.canonicalRole, "/analytics")).toBe(false);
    expect(canView(acc!.canonicalRole, "/governance")).toBe(false);
  });
});
