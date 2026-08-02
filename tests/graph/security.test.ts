import { describe, expect, it } from "vitest";
import {
  actorRefSchema,
  assertHumanApprover,
  denyByDefault,
  DEFAULT_GRAPH_TRAVERSAL_LIMITS,
  graphTraversalLimitsSchema,
  graphViewerContextSchema,
  GraphSecurityError,
  mayRevealBody,
  type ActorRef,
} from "@/graph";

const activeEligible = { active: true, hasRequiredPermission: true };

describe("graph security contracts", () => {
  describe("assertHumanApprover (actor-kind based, no id-prefix sniffing)", () => {
    it("passes for an active, eligible HUMAN with permission", () => {
      const actor: ActorRef = { kind: "HUMAN", userId: "u-tzachi" };
      expect(() => assertHumanApprover(actor, { eligibility: activeEligible })).not.toThrow();
    });

    it("throws for an AGENT actor", () => {
      const actor: ActorRef = { kind: "AGENT", agentId: "ag-hunter" };
      expect(() => assertHumanApprover(actor, { eligibility: activeEligible })).toThrow(
        GraphSecurityError,
      );
    });

    it("throws for a SYSTEM actor", () => {
      const actor: ActorRef = { kind: "SYSTEM" };
      expect(() => assertHumanApprover(actor, { eligibility: activeEligible })).toThrow(
        GraphSecurityError,
      );
    });

    it("throws for an inactive/ineligible user", () => {
      const actor: ActorRef = { kind: "HUMAN", userId: "u-tzachi" };
      expect(() =>
        assertHumanApprover(actor, {
          eligibility: { active: false, hasRequiredPermission: true },
        }),
      ).toThrow(GraphSecurityError);
    });

    it("throws for a user missing the required permission", () => {
      const actor: ActorRef = { kind: "HUMAN", userId: "u-tzachi" };
      expect(() =>
        assertHumanApprover(actor, {
          eligibility: { active: true, hasRequiredPermission: false },
        }),
      ).toThrow(GraphSecurityError);
    });

    it("throws for a non-canonical id (array-position or whitespace)", () => {
      expect(() =>
        assertHumanApprover({ kind: "HUMAN", userId: "12" }, { eligibility: activeEligible }),
      ).toThrow(GraphSecurityError);
      expect(() =>
        assertHumanApprover({ kind: "HUMAN", userId: "u tzachi" }, { eligibility: activeEligible }),
      ).toThrow(GraphSecurityError);
    });

    it("throws on prohibited self-approval", () => {
      const actor: ActorRef = { kind: "HUMAN", userId: "u-tzachi" };
      expect(() =>
        assertHumanApprover(actor, {
          eligibility: activeEligible,
          requesterUserId: "u-tzachi",
          prohibitSelfApproval: true,
        }),
      ).toThrow(GraphSecurityError);
      // a different requester is fine.
      expect(() =>
        assertHumanApprover(actor, {
          eligibility: activeEligible,
          requesterUserId: "u-dana",
          prohibitSelfApproval: true,
        }),
      ).not.toThrow();
    });

    it("does NOT infer actor type from an 'ag-*' id shape: a HUMAN whose userId contains 'ag' is still HUMAN", () => {
      const actor: ActorRef = { kind: "HUMAN", userId: "ag-not-an-agent" };
      expect(() => assertHumanApprover(actor, { eligibility: activeEligible })).not.toThrow();
    });

    it("carries a reasonCode/reasonHe on failure", () => {
      try {
        assertHumanApprover({ kind: "SYSTEM" }, { eligibility: activeEligible });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(GraphSecurityError);
        const err = e as GraphSecurityError;
        expect(err.reasonCode).toBe("GRAPH_APPROVER_NOT_HUMAN");
        expect(err.reasonHe.length).toBeGreaterThan(0);
      }
    });
  });

  describe("actorRefSchema (discriminated union)", () => {
    it("accepts each valid actor kind", () => {
      expect(actorRefSchema.safeParse({ kind: "HUMAN", userId: "u-1" }).success).toBe(true);
      expect(actorRefSchema.safeParse({ kind: "AGENT", agentId: "ag-1" }).success).toBe(true);
      expect(actorRefSchema.safeParse({ kind: "SYSTEM" }).success).toBe(true);
    });

    it("rejects an unknown kind or a HUMAN without a userId", () => {
      expect(actorRefSchema.safeParse({ kind: "ROBOT" }).success).toBe(false);
      expect(actorRefSchema.safeParse({ kind: "HUMAN" }).success).toBe(false);
    });
  });

  it("GraphViewerContext uses a single ActorRef", () => {
    expect(
      graphViewerContextSchema.safeParse({
        organizationId: "org-1",
        actor: { kind: "HUMAN", userId: "u-1" },
      }).success,
    ).toBe(true);
    expect(
      graphViewerContextSchema.safeParse({
        organizationId: "org-1",
        actor: { kind: "SYSTEM" },
        role: "viewer",
      }).success,
    ).toBe(true);
  });

  it("denyByDefault is a deny decision", () => {
    const d = denyByDefault("אין הרשאה");
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe("GRAPH_DENY_BY_DEFAULT");
  });

  it("hidden sensitivities require a reveal reason and sufficient clearance", () => {
    expect(mayRevealBody("ציבורי", "ציבורי", false)).toBe(true);
    expect(mayRevealBody("מוגבל", "רגיש", false)).toBe(false);
    expect(mayRevealBody("מוגבל", "רגיש", true)).toBe(true);
    expect(mayRevealBody("פנימי", "מוגבל", true)).toBe(false);
  });

  it("traversal limits are positive and bounded", () => {
    expect(graphTraversalLimitsSchema.safeParse(DEFAULT_GRAPH_TRAVERSAL_LIMITS).success).toBe(true);
    expect(
      graphTraversalLimitsSchema.safeParse({ ...DEFAULT_GRAPH_TRAVERSAL_LIMITS, maxDepth: 0 })
        .success,
    ).toBe(false);
    expect(
      graphTraversalLimitsSchema.safeParse({ ...DEFAULT_GRAPH_TRAVERSAL_LIMITS, maxNodes: -1 })
        .success,
    ).toBe(false);
  });
});
