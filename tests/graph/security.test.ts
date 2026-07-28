import { describe, expect, it } from "vitest";
import {
  denyByDefault,
  DEFAULT_GRAPH_TRAVERSAL_LIMITS,
  graphTraversalLimitsSchema,
  GraphSecurityError,
  humanApproverGuard,
  mayRevealBody,
  type GraphEntityRef,
} from "@/graph";

const human: GraphEntityRef = { organizationId: "org-1", entityType: "user", entityId: "u-tzachi" };
const agentByType: GraphEntityRef = {
  organizationId: "org-1",
  entityType: "agent",
  entityId: "ag-hunter",
};
const agentById: GraphEntityRef = {
  organizationId: "org-1",
  entityType: "user",
  entityId: "ag-hunter",
};

describe("graph security contracts", () => {
  it("AI agent can never be a human approver (#9)", () => {
    expect(() => humanApproverGuard(agentByType)).toThrow(GraphSecurityError);
    expect(() => humanApproverGuard(agentById)).toThrow(GraphSecurityError);
    // a named human passes.
    expect(() => humanApproverGuard(human)).not.toThrow();
  });

  it("denyByDefault is a deny decision", () => {
    const d = denyByDefault("אין הרשאה");
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe("GRAPH_DENY_BY_DEFAULT");
  });

  it("hidden sensitivities require a reveal reason and sufficient clearance", () => {
    // public body: always fine.
    expect(mayRevealBody("ציבורי", "ציבורי", false)).toBe(true);
    // hidden body without reason: refused even with top clearance.
    expect(mayRevealBody("מוגבל", "רגיש", false)).toBe(false);
    expect(mayRevealBody("מוגבל", "רגיש", true)).toBe(true);
    // insufficient clearance: refused even with a reason.
    expect(mayRevealBody("פנימי", "מוגבל", true)).toBe(false);
  });

  it("traversal limits are positive and bounded", () => {
    expect(graphTraversalLimitsSchema.safeParse(DEFAULT_GRAPH_TRAVERSAL_LIMITS).success).toBe(true);
    expect(graphTraversalLimitsSchema.safeParse({ ...DEFAULT_GRAPH_TRAVERSAL_LIMITS, maxDepth: 0 }).success).toBe(
      false,
    );
    expect(
      graphTraversalLimitsSchema.safeParse({ ...DEFAULT_GRAPH_TRAVERSAL_LIMITS, maxNodes: -1 }).success,
    ).toBe(false);
  });
});
