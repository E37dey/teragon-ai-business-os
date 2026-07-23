// W9-B — approval-side guarantees. These REUSE the frozen W8-C guards (no new
// implementation): ag-* AI agents can never approve (branded HumanUserId), and
// self-approval is blocked. Pinned here so the FINAL RBAC report can cite a
// green test for both guarantees under the W9-B gate.
import { describe, expect, it } from "vitest";
import {
  assertHumanApprover,
  toHumanUserId,
  AdministrationError,
} from "@/domain/administration";
import { AGENT_IDS } from "@/agents/definitions";

describe("W9-B — ag-* AI agents can NEVER be an approver (reuse W8-C brand)", () => {
  it("toHumanUserId throws ADMIN_AI_ACTOR_FORBIDDEN for every registered agent id", () => {
    expect(AGENT_IDS.length).toBeGreaterThan(0);
    for (const agentId of AGENT_IDS) {
      let caught: unknown;
      try {
        toHumanUserId(agentId);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AdministrationError);
      expect((caught as AdministrationError).code).toBe("ADMIN_AI_ACTOR_FORBIDDEN");
    }
  });

  it("rejects any ag- prefixed id even if not in the registry", () => {
    expect(() => toHumanUserId("ag-rogue-99")).toThrow(AdministrationError);
  });
});

describe("W9-B — self-approval is blocked (reuse W8-C)", () => {
  it("assertHumanApprover throws when approver === requester", () => {
    let caught: unknown;
    try {
      assertHumanApprover("u-tzachi", "u-tzachi");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AdministrationError);
    expect((caught as AdministrationError).code).toBe("ADMIN_SELF_APPROVAL_FORBIDDEN");
  });

  it("permits a distinct named human approver", () => {
    expect(() => assertHumanApprover("u-maya", "u-tzachi")).not.toThrow();
  });
});
