// W5-D — approval panel state machine vs. the canonical engine, with the
// W5-D-injected external handlers (execution = REAL Task + Activity records,
// honestly labeled; nothing fake).
import { beforeEach, describe, expect, it } from "vitest";
import { ApprovalEngine, AgentGovernanceError } from "@/agents";
import type { Activity, Task } from "@/domain/types";
import { makeExternalHandlers } from "@/components/approval/externalHandlers";
import { WORKFLOW_STATE_LABELS_HE } from "@/components/approval/workflowLabels";
import { freshStores, makeClock } from "../agents/helpers";
import type { AgentStores } from "@/repositories/agentStores";

const RUN_ID = "auto-test-run";

function makeEngine(stores: AgentStores): ApprovalEngine {
  return new ApprovalEngine({
    stores,
    clock: makeClock(),
    externalHandlers: makeExternalHandlers(stores),
  });
}

async function requestExternal(engine: ApprovalEngine): Promise<string> {
  const approval = await engine.requestApproval({
    runId: RUN_ID,
    subjectRef: "automation:auto-3",
    action: "external-automation",
    requestedById: "u-tzachi",
    executionPayload: {
      kind: "external",
      action: "external-automation",
      descriptionHe: "הרצת אוטומציית בדיקה",
      data: { automationId: "auto-3", subjectRef: "automation:auto-3" },
    },
    previewHe: "בדיקה",
  });
  return approval.id;
}

let stores: AgentStores;
let engine: ApprovalEngine;

beforeEach(() => {
  stores = freshStores();
  engine = makeEngine(stores);
});

describe("approval workflow via the canonical engine (5.12)", () => {
  it("labels cover every derived workflow state", () => {
    expect(Object.keys(WORKFLOW_STATE_LABELS_HE).sort()).toEqual(
      [
        "approved",
        "cancelled",
        "edited",
        "executed",
        "execution-failed",
        "expired",
        "pending",
        "rejected",
        "rolled-back",
      ].sort(),
    );
  });

  it("pending → approve → execute creates REAL Task + Activity records", async () => {
    const approvalId = await requestExternal(engine);
    expect(await engine.workflowState(RUN_ID, approvalId)).toBe("pending");

    await engine.decide({ runId: RUN_ID, approvalId, kind: "approve", decidedById: "u-tzachi" });
    expect(await engine.workflowState(RUN_ID, approvalId)).toBe("approved");

    const result = await engine.execute(RUN_ID, approvalId, "u-tzachi");
    expect(result.outcome).toBe("הצלחה");
    expect(await engine.workflowState(RUN_ID, approvalId)).toBe("executed");

    // the honest "execution": real records, honestly labeled
    const tasks = (await stores.collection<Task>("tasks").list()).filter((t) =>
      t.id.startsWith("exec-task-"),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.description).toContain("שליחה חיצונית אמיתית אינה נתמכת");
    const activities = (await stores.collection<Activity>("activities").list()).filter((a) =>
      a.id.startsWith("exec-act-"),
    );
    expect(activities).toHaveLength(1);

    // external executions honestly refuse rollback
    await expect(engine.rollback(RUN_ID, approvalId, "u-tzachi")).rejects.toMatchObject({
      code: "AGENT_ROLLBACK_UNSUPPORTED",
    });
  });

  it("reject REQUIRES a note (the UI enforces it; the engine throws without)", async () => {
    const approvalId = await requestExternal(engine);
    await expect(
      engine.decide({ runId: RUN_ID, approvalId, kind: "reject", decidedById: "u-tzachi" }),
    ).rejects.toBeInstanceOf(AgentGovernanceError);
    const rejected = await engine.decide({
      runId: RUN_ID,
      approvalId,
      kind: "reject",
      decidedById: "u-tzachi",
      noteHe: "בקשת תיקון: לרכך את הנוסח",
    });
    expect(rejected.status).toBe("נדחה");
    expect(await engine.workflowState(RUN_ID, approvalId)).toBe("rejected");
  });

  it("edit requires the edited payload and executes IT (not the original)", async () => {
    const approvalId = await requestExternal(engine);
    await expect(
      engine.decide({ runId: RUN_ID, approvalId, kind: "edit", decidedById: "u-tzachi" }),
    ).rejects.toBeInstanceOf(AgentGovernanceError);
    await engine.decide({
      runId: RUN_ID,
      approvalId,
      kind: "edit",
      decidedById: "u-tzachi",
      editedPayload: {
        kind: "external",
        action: "external-automation",
        descriptionHe: "נוסח ערוך על ידי המאשר",
        data: { automationId: "auto-3" },
      },
    });
    expect(await engine.workflowState(RUN_ID, approvalId)).toBe("edited");
    const result = await engine.execute(RUN_ID, approvalId, "u-tzachi");
    expect(result.outcome).toBe("הצלחה");
    const tasks = (await stores.collection<Task>("tasks").list()).filter((t) =>
      t.id.startsWith("exec-task-"),
    );
    expect(tasks[0]?.description).toContain("נוסח ערוך על ידי המאשר");
  });

  it("cancel (בטל פעולה) on a pending approval — and never executes after", async () => {
    const approvalId = await requestExternal(engine);
    await engine.cancel(RUN_ID, approvalId, "u-tzachi");
    expect(await engine.workflowState(RUN_ID, approvalId)).toBe("cancelled");
    await expect(engine.execute(RUN_ID, approvalId, "u-tzachi")).rejects.toMatchObject({
      code: "AGENT_EXECUTION_WITHOUT_APPROVAL",
    });
  });

  it("execution without a handler fails honestly (no fake success)", async () => {
    const bare = new ApprovalEngine({ stores, clock: makeClock() }); // no handlers injected
    const approval = await bare.requestApproval({
      runId: RUN_ID,
      subjectRef: "automation:auto-3",
      action: "external-automation",
      requestedById: "u-tzachi",
      executionPayload: {
        kind: "external",
        action: "external-automation",
        descriptionHe: "ללא handler",
        data: {},
      },
      previewHe: "בדיקה",
    });
    await bare.decide({
      runId: RUN_ID,
      approvalId: approval.id,
      kind: "approve",
      decidedById: "u-tzachi",
    });
    const result = await bare.execute(RUN_ID, approval.id, "u-tzachi");
    expect(result.outcome).toBe("נכשל");
    expect(await bare.workflowState(RUN_ID, approval.id)).toBe("execution-failed");
  });
});
