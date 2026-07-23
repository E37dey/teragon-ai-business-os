// W6-D — NAMED manager approval through the ONE canonical ApprovalEngine.
// No rule exists without it; bypass attempts fail loudly.
import { describe, expect, it } from "vitest";
import { AgentGovernanceError } from "@/agents";
import { SINGLE_CASE_MARKER_HE } from "@/domain/learning";
import {
  approveProposal,
  rejectProposal,
  submitProposal,
  LEARNING_RUN_ID,
} from "@/learning";
import { freshLearning, makeDraft, REVIEWER } from "./helpers";

describe("submitProposal — opens a canonical approval", () => {
  it("creates the proposal + evidence + a pending Approval record", async () => {
    const { stores, engine } = freshLearning();
    const proposal = await submitProposal(stores, engine, makeDraft());
    expect(proposal.approvalId).toMatch(new RegExp(`^${LEARNING_RUN_ID}-ap-`));
    const approval = await stores.approvals.get(proposal.approvalId as string);
    expect(approval?.status).toBe("ממתין");
    expect((await stores.evidence.list()).filter((e) => e.proposalId === proposal.id)).toHaveLength(
      2,
    );
  });

  it("is idempotent — resubmitting the same id returns the existing proposal", async () => {
    const { stores, engine } = freshLearning();
    const first = await submitProposal(stores, engine, makeDraft());
    const second = await submitProposal(stores, engine, makeDraft());
    expect(second.id).toBe(first.id);
    expect(second.approvalId).toBe(first.approvalId);
    expect(await stores.proposals.list()).toHaveLength(1);
  });
});

describe("approveProposal — named, canonical, single-case-blocked", () => {
  it("full path: named approval ⇒ active rule + immutable version v1 + audit", async () => {
    const { stores, engine, clock } = freshLearning();
    const proposal = await submitProposal(stores, engine, makeDraft());
    const rule = await approveProposal(
      stores,
      engine,
      { proposalId: proposal.id, decidedById: REVIEWER.id, decidedByName: REVIEWER.name },
      clock,
    );
    expect(rule.status).toBe("active");
    expect(rule.approvedByName).toBe(REVIEWER.name);
    expect(rule.effectivenessMeasured).toBe(false);

    const versions = await stores.ruleVersions.list();
    expect(versions.filter((v) => v.ruleId === rule.id)).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);

    const approval = await stores.approvals.get(proposal.approvalId as string);
    expect(approval?.status).toBe("אושר");
    expect(approval?.decidedById).toBe(REVIEWER.id);

    const audit = await stores.audit.list();
    expect(audit.some((a) => a.action === "learning.rule-activated")).toBe(true);
  });

  it("an anonymous approval is rejected", async () => {
    const { stores, engine, clock } = freshLearning();
    const proposal = await submitProposal(stores, engine, makeDraft());
    await expect(
      approveProposal(
        stores,
        engine,
        { proposalId: proposal.id, decidedById: "", decidedByName: "" },
        clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_REVIEWER_NOT_NAMED" });
  });

  it("only the NAMED reviewer may decide", async () => {
    const { stores, engine, clock } = freshLearning();
    const proposal = await submitProposal(stores, engine, makeDraft());
    await expect(
      approveProposal(
        stores,
        engine,
        { proposalId: proposal.id, decidedById: "u-other", decidedByName: "מישהו אחר" },
        clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_REVIEWER_MISMATCH" });
    // the canonical approval is untouched
    const approval = await stores.approvals.get(proposal.approvalId as string);
    expect(approval?.status).toBe("ממתין");
  });

  it("a single-case proposal can NEVER become a rule", async () => {
    const { stores, engine, clock } = freshLearning();
    const proposal = await submitProposal(
      stores,
      engine,
      makeDraft({
        id: "lp-single",
        sampleSize: 1,
        supportingRecordIds: ["ai-recommendation:rec-3"],
        singleCaseMarkerHe: SINGLE_CASE_MARKER_HE,
      }),
    );
    await expect(
      approveProposal(
        stores,
        engine,
        { proposalId: proposal.id, decidedById: REVIEWER.id, decidedByName: REVIEWER.name },
        clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_SINGLE_CASE_RULE_BLOCKED" });
    expect(await stores.rules.list()).toHaveLength(0);
    // still pending — awaiting more data, honestly
    expect((await stores.proposals.get(proposal.id))?.approvalState).toBe("pending");
  });

  it("bypassing the engine is impossible: a decided approval cannot be re-decided", async () => {
    const { stores, engine, clock } = freshLearning();
    const proposal = await submitProposal(stores, engine, makeDraft());
    await approveProposal(
      stores,
      engine,
      { proposalId: proposal.id, decidedById: REVIEWER.id, decidedByName: REVIEWER.name },
      clock,
    );
    // loop-level guard
    await expect(
      approveProposal(
        stores,
        engine,
        { proposalId: proposal.id, decidedById: REVIEWER.id, decidedByName: REVIEWER.name },
        clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_PROPOSAL_NOT_PENDING" });
    // engine-level guard (the canonical gate itself)
    await expect(
      engine.decide({
        runId: LEARNING_RUN_ID,
        approvalId: proposal.approvalId as string,
        kind: "approve",
        decidedById: REVIEWER.id,
      }),
    ).rejects.toBeInstanceOf(AgentGovernanceError);
  });
});

describe("rejectProposal — reason mandatory", () => {
  it("rejects with a reason and records it", async () => {
    const { stores, engine, clock } = freshLearning();
    const proposal = await submitProposal(stores, engine, makeDraft());
    const updated = await rejectProposal(
      stores,
      engine,
      {
        proposalId: proposal.id,
        decidedById: REVIEWER.id,
        decidedByName: REVIEWER.name,
        reasonHe: "הראיות אינן מספקות",
      },
      clock,
    );
    expect(updated.approvalState).toBe("rejected");
    const approval = await stores.approvals.get(proposal.approvalId as string);
    expect(approval?.status).toBe("נדחה");
    const audit = await stores.audit.list();
    expect(audit.some((a) => a.action === "learning.proposal-rejected")).toBe(true);
  });

  it("an empty reason is refused by the canonical engine", async () => {
    const { stores, engine, clock } = freshLearning();
    const proposal = await submitProposal(stores, engine, makeDraft());
    await expect(
      rejectProposal(
        stores,
        engine,
        {
          proposalId: proposal.id,
          decidedById: REVIEWER.id,
          decidedByName: REVIEWER.name,
          reasonHe: "",
        },
        clock,
      ),
    ).rejects.toBeInstanceOf(AgentGovernanceError);
  });
});
