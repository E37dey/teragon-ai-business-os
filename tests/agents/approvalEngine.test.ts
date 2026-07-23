// W5-C — canonical approval engine: full lifecycle, bypass attempts fail,
// edit-before-approve, honest rollback (inverse ops) + retry-after-failure.
import { describe, expect, it } from "vitest";
import type { Lead } from "@/domain/types";
import type { ExecutionPayload } from "@/domain/agents";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { freshStores, makeClock } from "./helpers";

const RUN_ID = "r-ap";

function taskPayload(id: string): ExecutionPayload {
  return {
    kind: "task-creation",
    collection: "agentTasks",
    record: {
      id,
      agentId: "ag-hunter",
      title: "משימת המשך מאושרת",
      description: "נוצרה על ידי מנוע האישורים",
      status: "בתור",
      evidenceIds: [],
      approvalId: null,
    },
  };
}

function makeEngine() {
  const stores = freshStores();
  const engine = new ApprovalEngine({ stores, clock: makeClock() });
  return { stores, engine };
}

async function requestOne(
  engine: ApprovalEngine,
  payload: ExecutionPayload | null = taskPayload("at-appr-1"),
) {
  return engine.requestApproval({
    runId: RUN_ID,
    subjectRef: "agent-run:r-ap",
    action: "customer-message",
    requestedById: "ag-orchestrator",
    executionPayload: payload,
    previewHe: "תצוגה מקדימה",
  });
}

describe("approval lifecycle", () => {
  it("request creates a pending record + event + audit", async () => {
    const { stores, engine } = makeEngine();
    const approval = await requestOne(engine);
    expect(approval.status).toBe("ממתין");
    expect(await engine.workflowState(RUN_ID, approval.id)).toBe("pending");
    const events = (await stores.events.list()).filter((e) => e.runId === RUN_ID);
    expect(events.find((e) => e.type === "ApprovalRequested")).toBeDefined();
    const audits = await stores.audit.list();
    expect(audits.some((a) => a.action === "approval.request")).toBe(true);
  });

  it("approve → execute creates the record and audits the execution", async () => {
    const { stores, engine } = makeEngine();
    const approval = await requestOne(engine);
    await engine.decide({
      runId: RUN_ID,
      approvalId: approval.id,
      kind: "approve",
      decidedById: "u-tzachi",
    });
    expect((await stores.approvals.get(approval.id))?.status).toBe("אושר");
    const result = await engine.execute(RUN_ID, approval.id, "u-tzachi");
    expect(result.outcome).toBe("הצלחה");
    expect(result.inverse).toMatchObject({ kind: "delete-created", recordId: "at-appr-1" });
    expect(await stores.tasks.get("at-appr-1")).toBeDefined();
    expect(await engine.workflowState(RUN_ID, approval.id)).toBe("executed");
    const audits = await stores.audit.list();
    expect(audits.some((a) => a.action === "approval.execute")).toBe(true);
  });

  it("reject requires a reason and blocks execution forever", async () => {
    const { engine } = makeEngine();
    const approval = await requestOne(engine);
    await expect(
      engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "reject", decidedById: "u-1" }),
    ).rejects.toMatchObject({ code: "AGENT_APPROVAL_STATE_INVALID" });
    await engine.decide({
      runId: RUN_ID,
      approvalId: approval.id,
      kind: "reject",
      decidedById: "u-1",
      noteHe: "לא רלוונטי",
    });
    expect(await engine.workflowState(RUN_ID, approval.id)).toBe("rejected");
    await expect(engine.execute(RUN_ID, approval.id, "u-1")).rejects.toMatchObject({
      code: "AGENT_EXECUTION_WITHOUT_APPROVAL",
    });
  });

  it("BYPASS BLOCKED: executing a pending or missing approval throws", async () => {
    const { engine } = makeEngine();
    const approval = await requestOne(engine);
    await expect(engine.execute(RUN_ID, approval.id, "u-1")).rejects.toMatchObject({
      code: "AGENT_EXECUTION_WITHOUT_APPROVAL",
    });
    await expect(engine.execute(RUN_ID, "ap-not-exists", "u-1")).rejects.toMatchObject({
      code: "AGENT_EXECUTION_WITHOUT_APPROVAL",
    });
  });

  it("double execution is blocked", async () => {
    const { engine } = makeEngine();
    const approval = await requestOne(engine);
    await engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "approve", decidedById: "u-1" });
    await engine.execute(RUN_ID, approval.id, "u-1");
    await expect(engine.execute(RUN_ID, approval.id, "u-1")).rejects.toMatchObject({
      code: "AGENT_APPROVAL_STATE_INVALID",
    });
  });

  it("edit-before-approve: the HUMAN-EDITED payload is what executes", async () => {
    const { stores, engine } = makeEngine();
    const approval = await requestOne(engine, taskPayload("at-original"));
    await engine.decide({
      runId: RUN_ID,
      approvalId: approval.id,
      kind: "edit",
      decidedById: "u-tzachi",
      noteHe: "שיניתי את הכותרת",
      editedPayload: taskPayload("at-edited"),
    });
    expect(await engine.workflowState(RUN_ID, approval.id)).toBe("edited");
    await engine.execute(RUN_ID, approval.id, "u-tzachi");
    expect(await stores.tasks.get("at-edited")).toBeDefined();
    expect(await stores.tasks.get("at-original")).toBeUndefined();
  });

  it("edit without editedPayload is invalid", async () => {
    const { engine } = makeEngine();
    const approval = await requestOne(engine);
    await expect(
      engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "edit", decidedById: "u-1" }),
    ).rejects.toMatchObject({ code: "AGENT_APPROVAL_STATE_INVALID" });
  });

  it("expire and cancel terminate a pending approval (recorded honestly)", async () => {
    const { stores, engine } = makeEngine();
    const a1 = await requestOne(engine);
    const expired = await engine.expire(RUN_ID, a1.id, "system");
    expect(expired.status).toBe("נדחה");
    expect(expired.note).toContain("פג תוקף");
    expect(await engine.workflowState(RUN_ID, a1.id)).toBe("expired");

    const a2 = await requestOne(engine, taskPayload("at-appr-2"));
    const cancelled = await engine.cancel(RUN_ID, a2.id, "u-1");
    expect(cancelled.note).toContain("בוטל");
    expect(await engine.workflowState(RUN_ID, a2.id)).toBe("cancelled");
    // decided approvals cannot be decided again
    await expect(
      engine.decide({ runId: RUN_ID, approvalId: a1.id, kind: "approve", decidedById: "u-1" }),
    ).rejects.toMatchObject({ code: "AGENT_APPROVAL_STATE_INVALID" });
    const audits = await stores.audit.list();
    expect(audits.some((a) => a.action === "approval.expired")).toBe(true);
    expect(audits.some((a) => a.action === "approval.cancelled")).toBe(true);
  });
});

describe("rollback — inverse operations where implemented", () => {
  it("task-creation rolls back by deleting the created record", async () => {
    const { stores, engine } = makeEngine();
    const approval = await requestOne(engine, taskPayload("at-rb-1"));
    await engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "approve", decidedById: "u-1" });
    await engine.execute(RUN_ID, approval.id, "u-1");
    expect(await stores.tasks.get("at-rb-1")).toBeDefined();
    const rb = await engine.rollback(RUN_ID, approval.id, "u-1");
    expect(rb.supported).toBe(true);
    expect(await stores.tasks.get("at-rb-1")).toBeUndefined();
    expect(await engine.workflowState(RUN_ID, approval.id)).toBe("rolled-back");
    // second rollback blocked
    await expect(engine.rollback(RUN_ID, approval.id, "u-1")).rejects.toMatchObject({
      code: "AGENT_APPROVAL_STATE_INVALID",
    });
  });

  it("record-field-change rolls back by restoring the previous value", async () => {
    const { stores, engine } = makeEngine();
    const lead = (await stores.collection<Lead>("leads").list())[0];
    expect(lead).toBeDefined();
    if (!lead) return;
    const previousStatus = lead.status;
    const approval = await requestOne(engine, {
      kind: "record-field-change",
      collection: "leads",
      recordId: lead.id,
      field: "status",
      newValue: "במשא ומתן",
    });
    await engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "approve", decidedById: "u-1" });
    const result = await engine.execute(RUN_ID, approval.id, "u-1");
    expect(result.inverse).toMatchObject({ kind: "restore-field", previousValue: previousStatus });
    expect((await stores.collection<Lead>("leads").get(lead.id))?.status).toBe("במשא ומתן");
    await engine.rollback(RUN_ID, approval.id, "u-1");
    expect((await stores.collection<Lead>("leads").get(lead.id))?.status).toBe(previousStatus);
  });

  it("external actions declare 'rollback לא נתמך' honestly", async () => {
    const stores = freshStores();
    const engine = new ApprovalEngine({
      stores,
      clock: makeClock(),
      externalHandlers: {
        "customer-message": () =>
          Promise.resolve({ resultRef: "message:demo", detailHe: "נשלחה הודעה (מדומה)" }),
      },
    });
    const approval = await engine.requestApproval({
      runId: RUN_ID,
      subjectRef: "lead:l-1",
      action: "customer-message",
      requestedById: "ag-orchestrator",
      executionPayload: {
        kind: "external",
        action: "customer-message",
        descriptionHe: "שליחת פולואו-אפ",
        data: {},
      },
      previewHe: "טיוטת הודעה",
    });
    await engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "approve", decidedById: "u-1" });
    const result = await engine.execute(RUN_ID, approval.id, "u-1");
    expect(result.outcome).toBe("הצלחה");
    expect(result.inverse).toMatchObject({ kind: "unsupported", reasonHe: "rollback לא נתמך" });
    await expect(engine.rollback(RUN_ID, approval.id, "u-1")).rejects.toMatchObject({
      code: "AGENT_ROLLBACK_UNSUPPORTED",
    });
  });
});

describe("failed execution + retry", () => {
  it("a failing external handler records נכשל and can be retried after a fix", async () => {
    const stores = freshStores();
    let attempts = 0;
    const engine = new ApprovalEngine({
      stores,
      clock: makeClock(),
      externalHandlers: {
        "external-notification": () => {
          attempts += 1;
          if (attempts === 1) return Promise.reject(new Error("שרת ההתראות לא זמין"));
          return Promise.resolve({ resultRef: "notification:1", detailHe: "נשלחה התראה" });
        },
      },
    });
    const approval = await engine.requestApproval({
      runId: RUN_ID,
      subjectRef: "agent-run:r-ap",
      action: "external-notification",
      requestedById: "ag-orchestrator",
      executionPayload: {
        kind: "external",
        action: "external-notification",
        descriptionHe: "התראה",
        data: {},
      },
      previewHe: "התראה",
    });
    await engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "approve", decidedById: "u-1" });
    const first = await engine.execute(RUN_ID, approval.id, "u-1");
    expect(first.outcome).toBe("נכשל");
    expect(await engine.workflowState(RUN_ID, approval.id)).toBe("execution-failed");
    const retried = await engine.retryFailedExecution(RUN_ID, approval.id, "u-1");
    expect(retried.outcome).toBe("הצלחה");
    expect(await engine.workflowState(RUN_ID, approval.id)).toBe("executed");
    // retry on an executed approval is invalid
    await expect(engine.retryFailedExecution(RUN_ID, approval.id, "u-1")).rejects.toMatchObject({
      code: "AGENT_APPROVAL_STATE_INVALID",
    });
  });

  it("an external action WITHOUT an injected handler fails honestly (no fake success)", async () => {
    const { engine } = makeEngine();
    const approval = await requestOne(engine, {
      kind: "external",
      action: "discount",
      descriptionHe: "הנחה",
      data: {},
    });
    await engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "approve", decidedById: "u-1" });
    const result = await engine.execute(RUN_ID, approval.id, "u-1");
    expect(result.outcome).toBe("נכשל");
    expect(result.detailHe).toContain("handler");
  });

  it("a recommendation-only approval (no payload) cannot be executed", async () => {
    const { engine } = makeEngine();
    const approval = await requestOne(engine, null);
    await engine.decide({ runId: RUN_ID, approvalId: approval.id, kind: "approve", decidedById: "u-1" });
    await expect(engine.execute(RUN_ID, approval.id, "u-1")).rejects.toMatchObject({
      code: "AGENT_APPROVAL_STATE_INVALID",
    });
  });
});
