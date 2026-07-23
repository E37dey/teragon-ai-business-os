// W9-B — LAYER (c): repository-mutation guard + org-boundary context. The
// wrapped fn NEVER runs on a denied path (no partial mutation), and the demo
// authz context carries orgId through the boundary.
import { describe, expect, it, vi } from "vitest";
import {
  guardedMutation,
  guardedMutationInContext,
  AuthorizationError,
  canInContext,
  DEMO_ORG_ID,
  type AuthzContext,
} from "@/authorization";

describe("W9-B — guardedMutation runs the fn only when authorized", () => {
  it("runs the mutation for an authorized role and returns its value", async () => {
    const fn = vi.fn(async () => "mutated");
    const out = await guardedMutation("user.manage", "crole-sysadmin", fn);
    expect(out).toBe("mutated");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("throws AUTHZ_DENIED and NEVER invokes the fn for an unauthorized role", async () => {
    const fn = vi.fn(async () => "mutated");
    await expect(guardedMutation("user.manage", "crole-viewer", fn)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("W9-B — authz context represents the organization boundary", () => {
  it("carries orgId/userId and re-derives the decision from the role", () => {
    const ctx: AuthzContext = { role: "crole-ceo", userId: "u-tzachi", orgId: DEMO_ORG_ID };
    expect(canInContext(ctx, "discount.approve")).toBe(true);
    expect(canInContext({ ...ctx, role: "crole-sales" }, "discount.approve")).toBe(false);
  });

  it("guardedMutationInContext blocks the unauthorized before the fn runs", async () => {
    const fn = vi.fn(async () => 1);
    const ctx: AuthzContext = { role: "crole-service", userId: "u-dan", orgId: DEMO_ORG_ID };
    await expect(guardedMutationInContext("discount.approve", ctx, fn)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(fn).not.toHaveBeenCalled();
  });
});
