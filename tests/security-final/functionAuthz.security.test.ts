// W9-B / Phase 9.6 — LAYER (d): server-function operation authorization.
// HONEST DEMO boundary: rejects malformed role/org claims and unknown/over-
// reaching operations (fail-closed), never asserts a verified identity.
import { describe, expect, it } from "vitest";
import { authorizeFunctionOperation } from "@/security";

describe("W9-B 9.6 — function operation authz (demo, not auth)", () => {
  it("permits an operation the role's grants allow", () => {
    const res = authorizeFunctionOperation({
      role: "crole-ceo",
      orgId: "org-1",
      operation: "discount.approve",
    });
    expect(res.ok).toBe(true);
  });

  it("rejects an operation the role's grants do NOT allow", () => {
    const res = authorizeFunctionOperation({
      role: "crole-sales",
      orgId: "org-1",
      operation: "discount.approve",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insufficient-permission");
  });

  it("fails CLOSED on a malformed role claim", () => {
    const res = authorizeFunctionOperation({
      role: "root",
      orgId: "org-1",
      operation: "user.manage",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("malformed-role-claim");
  });

  it("fails CLOSED on an org claim that could smuggle injection", () => {
    const res = authorizeFunctionOperation({
      role: "crole-ceo",
      orgId: "org-1\n x-inject: 1",
      operation: "user.manage",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("malformed-role-claim");
  });

  it("fails CLOSED on an unknown operation (not in the 24 permissions)", () => {
    const res = authorizeFunctionOperation({
      role: "crole-sysadmin",
      orgId: "org-1",
      operation: "database.drop",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown-operation");
  });

  it("never leaks a stack trace — denial detail is a clean Hebrew message", () => {
    const res = authorizeFunctionOperation({ role: "x", orgId: "y", operation: "z" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.detailHe).toContain("סימולציית הרשאות במצב הדגמה");
      expect(res.detailHe).not.toMatch(/\.ts:\d+|at Object|Error:/);
    }
  });
});
