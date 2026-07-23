// W6-D — rollback lifecycle: deactivate + LearningRollback + audit; past
// applications remain visible; versioning is append-only.
import { describe, expect, it } from "vitest";
import {
  applyRule,
  approveProposal,
  reviseRule,
  rollbackRule,
  ruleApplicationsFromAudit,
  submitProposal,
} from "@/learning";
import { freshLearning, makeDraft, makeEffect, REVIEWER, type LearningFixture } from "./helpers";
import type { LearningRule } from "@/domain/learning";

async function activateRule(fx: LearningFixture): Promise<LearningRule> {
  const proposal = await submitProposal(fx.stores, fx.engine, makeDraft());
  return approveProposal(
    fx.stores,
    fx.engine,
    { proposalId: proposal.id, decidedById: REVIEWER.id, decidedByName: REVIEWER.name },
    fx.clock,
  );
}

describe("rollback lifecycle", () => {
  it("deactivates the rule + writes a LearningRollback + audit entry", async () => {
    const fx = freshLearning();
    const rule = await activateRule(fx);
    await applyRule(fx.stores, rule.id, "ticket:t-9", REVIEWER.id, fx.clock);

    const { rule: updated, rollback } = await rollbackRule(
      fx.stores,
      { ruleId: rule.id, reasonHe: "הכלל לא הועיל בפועל", actorId: REVIEWER.id, actorName: REVIEWER.name },
      fx.clock,
    );
    expect(updated.status).toBe("rolled-back");
    expect(rollback.ruleId).toBe(rule.id);
    expect(rollback.version).toBe(1);
    expect(rollback.rolledBackByName).toBe(REVIEWER.name);

    const audit = await fx.stores.audit.list();
    expect(audit.some((a) => a.action === "learning.rule-rollback")).toBe(true);
  });

  it("a rolled-back rule's PAST applications remain visible", async () => {
    const fx = freshLearning();
    const rule = await activateRule(fx);
    await applyRule(fx.stores, rule.id, "ticket:t-9", REVIEWER.id, fx.clock);
    await applyRule(fx.stores, rule.id, "ticket:t-3", REVIEWER.id, fx.clock);
    await rollbackRule(
      fx.stores,
      { ruleId: rule.id, reasonHe: "בדיקה", actorId: REVIEWER.id, actorName: REVIEWER.name },
      fx.clock,
    );
    const audit = await fx.stores.audit.list();
    expect(ruleApplicationsFromAudit(audit, rule.id)).toHaveLength(2);
    // but new applications are refused
    await expect(
      applyRule(fx.stores, rule.id, "ticket:t-1", REVIEWER.id, fx.clock),
    ).rejects.toMatchObject({ code: "LEARNING_RULE_INACTIVE" });
  });

  it("double rollback / anonymous / reason-less rollback all fail", async () => {
    const fx = freshLearning();
    const rule = await activateRule(fx);
    await expect(
      rollbackRule(
        fx.stores,
        { ruleId: rule.id, reasonHe: "", actorId: REVIEWER.id, actorName: REVIEWER.name },
        fx.clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_ROLLBACK_INVALID" });
    await expect(
      rollbackRule(
        fx.stores,
        { ruleId: rule.id, reasonHe: "סיבה", actorId: "", actorName: "" },
        fx.clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_ROLLBACK_INVALID" });
    await rollbackRule(
      fx.stores,
      { ruleId: rule.id, reasonHe: "סיבה", actorId: REVIEWER.id, actorName: REVIEWER.name },
      fx.clock,
    );
    await expect(
      rollbackRule(
        fx.stores,
        { ruleId: rule.id, reasonHe: "שוב", actorId: REVIEWER.id, actorName: REVIEWER.name },
        fx.clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_RULE_ALREADY_ROLLED_BACK" });
  });
});

describe("versioning — append-only, immutable version records", () => {
  it("revision appends v2 without touching v1", async () => {
    const fx = freshLearning();
    const rule = await activateRule(fx);
    const v1 = (await fx.stores.ruleVersions.list()).find((v) => v.ruleId === rule.id);
    expect(v1?.version).toBe(1);
    const v1Snapshot = JSON.parse(JSON.stringify(v1)) as unknown;

    const updated = await reviseRule(
      fx.stores,
      {
        ruleId: rule.id,
        effect: makeEffect({ actionHe: "פעולה מעודכנת" }),
        insightHe: "תובנה מעודכנת",
        reasonHe: "דיוק ניסוח",
        actorId: REVIEWER.id,
      },
      fx.clock,
    );
    expect(updated.currentVersion).toBe(2);
    const versions = (await fx.stores.ruleVersions.list()).filter((v) => v.ruleId === rule.id);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
    // v1 unchanged — append-only
    expect(versions.find((v) => v.version === 1)).toEqual(v1Snapshot);
  });

  it("a rolled-back rule cannot be revised", async () => {
    const fx = freshLearning();
    const rule = await activateRule(fx);
    await rollbackRule(
      fx.stores,
      { ruleId: rule.id, reasonHe: "סיבה", actorId: REVIEWER.id, actorName: REVIEWER.name },
      fx.clock,
    );
    await expect(
      reviseRule(
        fx.stores,
        {
          ruleId: rule.id,
          effect: makeEffect(),
          insightHe: "x",
          reasonHe: "y",
          actorId: REVIEWER.id,
        },
        fx.clock,
      ),
    ).rejects.toMatchObject({ code: "LEARNING_RULE_INACTIVE" });
  });
});
