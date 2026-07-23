// W8-B — policy governance: idempotent bootstrap, NEVER auto-approved,
// append-only immutable versions (store-level), canonical-engine-only
// activation, revision invalidates approval.
import { describe, expect, it } from "vitest";
import { GOVERNANCE_VERSION_IMMUTABLE_HE } from "@/repositories/governanceStores";
import {
  CANONICAL_POLICIES,
  approvePolicy,
  ensureGovernanceData,
  policyContentChecksum,
  rejectPolicy,
  revisePolicy,
  submitPolicyForReview,
} from "@/governance";
import { APPROVER, bootedGovernance, freshGovernance } from "./helpers";

describe("bootstrap — the 10 canonical policies", () => {
  it("creates exactly 10 policies, all as טיוטה/ממתין לבדיקה — NONE auto-approved", async () => {
    const fx = await bootedGovernance();
    const policies = await fx.stores.policies.list();
    expect(policies).toHaveLength(10);
    expect(CANONICAL_POLICIES).toHaveLength(10);
    for (const p of policies) {
      expect(["טיוטה", "ממתין לבדיקה"]).toContain(p.status);
      expect(p.status).not.toBe("פעילה");
      expect(p.effectiveAt).toBeNull(); // no effective date until approved
      expect(p.approvedById).toBeNull();
      expect(p.ownerId.length).toBeGreaterThan(0); // named owner
      expect(p.ownerName.length).toBeGreaterThan(0);
    }
  });

  it("is idempotent — running twice changes nothing", async () => {
    const fx = freshGovernance();
    const first = await ensureGovernanceData({
      stores: fx.stores,
      engine: fx.engine,
      clock: fx.clock,
    });
    expect(first.policies).toBe(10);
    expect(first.risks).toBe(10);
    const second = await ensureGovernanceData({
      stores: fx.stores,
      engine: fx.engine,
      clock: fx.clock,
    });
    expect(second.policies).toBe(0);
    expect(second.risks).toBe(0);
    expect(second.promptVersions).toBe(0);
    expect((await fx.stores.policies.list()).length).toBe(10);
  });

  it("policy #1 content is the rewritten tm-4 correct-use policy with v1 checksum", async () => {
    const fx = await bootedGovernance();
    const v1 = await fx.stores.policyVersions.get("gp-correct-use-v1");
    expect(v1).toBeTruthy();
    if (!v1) return;
    const headings = v1.sections.map((s) => s.headingHe);
    expect(headings).toEqual([
      "מותר — ללא אישור נוסף",
      "חובה לבדוק — לפני כל שימוש בתוצר",
      "אסור — בשום מצב",
    ]);
    expect(v1.checksumSha256).toBe(
      policyContentChecksum(v1.policyId, v1.version, v1.titleHe, v1.sections),
    );
  });
});

describe("version immutability — store-level enforcement", () => {
  it("update on a policy version THROWS", async () => {
    const fx = await bootedGovernance();
    expect(() => fx.stores.policyVersions.update("gp-correct-use-v1", { titleHe: "שונה" })).toThrow(
      GOVERNANCE_VERSION_IMMUTABLE_HE,
    );
  });

  it("remove/clear on policy versions THROW", async () => {
    const fx = await bootedGovernance();
    expect(() => fx.stores.policyVersions.remove("gp-correct-use-v1")).toThrow(
      GOVERNANCE_VERSION_IMMUTABLE_HE,
    );
    expect(() => fx.stores.policyVersions.clear()).toThrow(GOVERNANCE_VERSION_IMMUTABLE_HE);
  });

  it("prompt versions are equally immutable", async () => {
    const fx = await bootedGovernance();
    const [first] = await fx.stores.promptVersions.list();
    expect(first).toBeTruthy();
    if (!first) return;
    expect(() => fx.stores.promptVersions.update(first.id, { active: false })).toThrow(
      GOVERNANCE_VERSION_IMMUTABLE_HE,
    );
    expect(() => fx.stores.promptVersions.remove(first.id)).toThrow(
      GOVERNANCE_VERSION_IMMUTABLE_HE,
    );
  });

  it("returned version objects are frozen — in-place mutation throws", async () => {
    const fx = await bootedGovernance();
    const v1 = await fx.stores.policyVersions.get("gp-correct-use-v1");
    expect(v1).toBeTruthy();
    if (!v1) return;
    expect(Object.isFrozen(v1)).toBe(true);
    expect(() => {
      (v1 as { titleHe: string }).titleHe = "פריצה";
    }).toThrow();
  });
});

describe("approval — ONLY through the canonical engine, named approver", () => {
  it("approving a pending policy activates it with approver, effective date and review date", async () => {
    const fx = await bootedGovernance();
    const updated = await approvePolicy(
      fx.stores,
      fx.engine,
      { policyId: "gp-correct-use", decidedById: APPROVER.id, decidedByName: APPROVER.name },
      fx.clock,
    );
    expect(updated.status).toBe("פעילה");
    expect(updated.approvedByName).toBe(APPROVER.name);
    expect(updated.effectiveAt).not.toBeNull();
    expect(updated.nextReviewAt).not.toBeNull();
    // the canonical Approval record was decided
    const approval = await fx.stores.approvals.get(updated.approvalId as string);
    expect(approval?.status).toBe("אושר");
    // audited
    const audit = await fx.stores.audit.list();
    expect(audit.some((a) => a.action === "governance.policy-approved")).toBe(true);
  });

  it("a draft cannot be approved — no shortcut around the review queue", async () => {
    const fx = await bootedGovernance();
    const drafts = (await fx.stores.policies.list()).filter((p) => p.status === "טיוטה");
    expect(drafts.length).toBeGreaterThan(0);
    await expect(
      approvePolicy(
        fx.stores,
        fx.engine,
        { policyId: drafts[0]?.id ?? "", decidedById: APPROVER.id, decidedByName: APPROVER.name },
        fx.clock,
      ),
    ).rejects.toThrow(/אינה ממתינה לבדיקה/);
  });

  it("anonymous approval is rejected", async () => {
    const fx = await bootedGovernance();
    await expect(
      approvePolicy(
        fx.stores,
        fx.engine,
        { policyId: "gp-correct-use", decidedById: " ", decidedByName: "" },
        fx.clock,
      ),
    ).rejects.toThrow(/מאשר בשם/);
  });

  it("double-approval is blocked by the engine (approval already decided)", async () => {
    const fx = await bootedGovernance();
    await approvePolicy(
      fx.stores,
      fx.engine,
      { policyId: "gp-correct-use", decidedById: APPROVER.id, decidedByName: APPROVER.name },
      fx.clock,
    );
    await expect(
      approvePolicy(
        fx.stores,
        fx.engine,
        { policyId: "gp-correct-use", decidedById: APPROVER.id, decidedByName: APPROVER.name },
        fx.clock,
      ),
    ).rejects.toThrow(); // policy no longer pending / approval decided
  });

  it("rejection requires a reason and returns the policy to draft", async () => {
    const fx = await bootedGovernance();
    await expect(
      rejectPolicy(
        fx.stores,
        fx.engine,
        {
          policyId: "gp-human-approval",
          decidedById: APPROVER.id,
          decidedByName: APPROVER.name,
          reasonHe: " ",
        },
        fx.clock,
      ),
    ).rejects.toThrow(/נימוק/);
    const rejected = await rejectPolicy(
      fx.stores,
      fx.engine,
      {
        policyId: "gp-human-approval",
        decidedById: APPROVER.id,
        decidedByName: APPROVER.name,
        reasonHe: "נדרש ניסוח מחודש",
      },
      fx.clock,
    );
    expect(rejected.status).toBe("טיוטה");
    expect(rejected.approvalId).toBeNull();
  });

  it("submit → approve works for a draft policy", async () => {
    const fx = await bootedGovernance();
    const submitted = await submitPolicyForReview(
      fx.stores,
      fx.engine,
      { policyId: "gp-data-privacy", requestedById: APPROVER.id },
      fx.clock,
    );
    expect(submitted.status).toBe("ממתין לבדיקה");
    expect(submitted.approvalId).not.toBeNull();
    const approved = await approvePolicy(
      fx.stores,
      fx.engine,
      { policyId: "gp-data-privacy", decidedById: APPROVER.id, decidedByName: APPROVER.name },
      fx.clock,
    );
    expect(approved.status).toBe("פעילה");
  });
});

describe("revision — append-only new version, approval invalidated", () => {
  it("creates v2 (v1 untouched) and returns the policy to draft", async () => {
    const fx = await bootedGovernance();
    await approvePolicy(
      fx.stores,
      fx.engine,
      { policyId: "gp-correct-use", decidedById: APPROVER.id, decidedByName: APPROVER.name },
      fx.clock,
    );
    const v2 = await revisePolicy(
      fx.stores,
      {
        policyId: "gp-correct-use",
        titleHe: "מדיניות שימוש נכון ב-AI (מעודכן)",
        sections: [{ headingHe: "עדכון", bulletsHe: ["סעיף חדש"] }],
        changeReasonHe: "עדכון תקופתי",
        actorId: APPROVER.id,
      },
      fx.clock,
    );
    expect(v2.version).toBe(2);
    const v1 = await fx.stores.policyVersions.get("gp-correct-use-v1");
    expect(v1?.titleHe).toBe("מדיניות שימוש נכון ב-AI"); // untouched
    const policy = await fx.stores.policies.get("gp-correct-use");
    expect(policy?.status).toBe("טיוטה"); // approval invalidated — re-approval required
    expect(policy?.effectiveAt).toBeNull();
    expect(policy?.currentVersion).toBe(2);
  });
});
