// W6-A — proposal lifecycle through the CANONICAL ApprovalEngine, incl. the
// bypass-attempt test: execution without a decided approval must throw and
// leave zero records behind.
import { describe, expect, it } from "vitest";
import { AgentGovernanceError } from "@/agents/errors";
import { MemoryWorkflowError } from "@/memory/core/proposalWorkflow";
import { freshWorkflow, makeDraft, seedSource, TZACHI } from "./helpers";

describe("memory proposal workflow", () => {
  it("submit → checks recorded → approval requested via the engine", async () => {
    const { stores, agents, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית בדיקה",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    expect(proposal.status).toBe("ממתין לאישור");
    expect(proposal.checks.sourceValidation.outcome).toBe("עבר");
    expect(proposal.approvalId).toBe(`${proposal.id}-ap-1`);
    const approval = await agents.approvals.get(proposal.approvalId!);
    expect(approval?.status).toBe("ממתין");
    expect(approval?.note).toContain("עדכון קבוע בזיכרון הארגוני");
  });

  it("blocks a proposal without sources — stays טיוטה, no approval request", async () => {
    const { agents, workflow } = freshWorkflow();
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית ללא מקור",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ sourceIds: [] }),
    });
    expect(proposal.status).toBe("טיוטה");
    expect(proposal.approvalId).toBeNull();
    expect(proposal.checks.sourceValidation.outcome).toBe("נכשל");
    expect((await agents.approvals.list()).filter((a) => a.id.startsWith(proposal.id))).toHaveLength(0);
  });

  it("אשר לזיכרון: approve → record + version + audit, approvedBy is the named human", async () => {
    const { stores, agents, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    const record = await workflow.approve(proposal.id, TZACHI);
    expect(record.approvalState).toBe("מאושר");
    expect(record.approvedBy).toBe("צחי זוסטייהם");
    expect(record.version).toBe(1);
    expect(record.origin).toBe("proposal");
    const versions = (await stores.versions.list()).filter((v) => v.recordId === record.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.approverName).toBe("צחי זוסטייהם");
    const updated = await stores.proposals.get(proposal.id);
    expect(updated?.status).toBe("מאושר");
    expect(updated?.resultRecordId).toBe(record.id);
    const audit = await agents.audit.list();
    expect(audit.some((a) => a.action === "approval.approve" || a.action === "approval.approved")).toBe(true);
    expect(audit.some((a) => a.action === "approval.execute")).toBe(true);
    expect(audit.some((a) => a.action === "memory.proposal.submit")).toBe(true);
  });

  it("BYPASS ATTEMPT: execute without a decision throws and writes nothing", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    const before = (await stores.records.list()).length;
    await expect(
      workflow.engine.execute(proposal.runId, proposal.approvalId!, "agent-memory"),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AgentGovernanceError && e.code === "AGENT_EXECUTION_WITHOUT_APPROVAL",
    );
    expect((await stores.records.list()).length).toBe(before);
    expect((await stores.versions.list()).length).toBe(0);
  });

  it("BYPASS ATTEMPT: controls refuse a proposal that never entered the queue", async () => {
    const { workflow } = freshWorkflow();
    const draftProposal = await workflow.submitProposal({
      observationHe: "ללא מקור",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ sourceIds: [] }),
    });
    await expect(workflow.approve(draftProposal.id, TZACHI)).rejects.toBeInstanceOf(MemoryWorkflowError);
  });

  it("ערוך ואשר: the human-edited body is what gets written", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    const edited = { ...proposal.draft, bodyMarkdown: "# נערך\n\nערוץ מועדף: טלפון" };
    const record = await workflow.editAndApprove(proposal.id, TZACHI, edited, "עריכה אנושית");
    expect(record.bodyMarkdown).toBe(edited.bodyMarkdown);
    expect(record.approvedBy).toBe("צחי זוסטייהם");
  });

  it("דחה requires a reason (engine-enforced) and marks the proposal", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    const rejected = await workflow.reject(proposal.id, TZACHI, "המקור אינו מספק");
    expect(rejected.status).toBe("נדחה");
    expect((await stores.records.list()).some((r) => r.id.startsWith("memr-"))).toBe(false);
  });

  it("בקש מקור נוסף keeps the proposal pending and records the request", async () => {
    const { stores, agents, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    const updated = await workflow.requestMoreSources(proposal.id, TZACHI.deciderId, "נדרש תיעוד פגישה");
    expect(updated.status).toBe("ממתין לאישור");
    expect(updated.moreSourcesRequestHe).toBe("נדרש תיעוד פגישה");
    expect((await agents.audit.list()).some((a) => a.action === "memory.proposal.request-sources")).toBe(true);
  });

  it("מזג עם פריט קיים creates a NEW VERSION on the target, not a new record", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const first = await workflow.submitProposal({
      observationHe: "פריט בסיס",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ title: "פריט בסיס לזיהוי מיזוג" }),
    });
    const base = await workflow.approve(first.id, TZACHI);
    const countAfterBase = (await stores.records.list()).length;

    const second = await workflow.submitProposal({
      observationHe: "תוספת",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ title: "תוספת מידע חדשה לגמרי", bodyMarkdown: "פרט חדש למיזוג" }),
    });
    const merged = await workflow.mergeWithExisting(second.id, base.id, TZACHI);
    expect(merged.id).toBe(base.id);
    expect(merged.version).toBe(2);
    expect(merged.bodyMarkdown).toContain("פרט חדש למיזוג");
    expect((await stores.records.list()).length).toBe(countAfterBase); // no new record
    const proposal = await stores.proposals.get(second.id);
    expect(proposal?.status).toBe("מוזג");
    const versions = (await stores.versions.list()).filter((v) => v.recordId === base.id);
    expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2]);
  });

  it("סמן כרגיש raises sensitivity and refuses to lower it", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    const marked = await workflow.markSensitive(proposal.id, TZACHI.deciderId, "רגיש");
    expect(marked.draft.sensitivity).toBe("רגיש");
    await expect(workflow.markSensitive(proposal.id, TZACHI.deciderId, "ציבורי")).rejects.toBeInstanceOf(
      MemoryWorkflowError,
    );
  });

  it("בטל הצעה cancels the engine approval and the proposal", async () => {
    const { stores, agents, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft(),
    });
    const cancelled = await workflow.cancelProposal(proposal.id, TZACHI.deciderId);
    expect(cancelled.status).toBe("בוטל");
    const approval = await agents.approvals.get(proposal.approvalId!);
    expect(approval?.status).toBe("נדחה"); // engine maps cancelled ⇒ "נדחה" + note
    await expect(workflow.approve(proposal.id, TZACHI)).rejects.toBeInstanceOf(MemoryWorkflowError);
  });

  it("sensitivity check warns when content suggests higher sensitivity", async () => {
    const { stores, workflow } = freshWorkflow();
    await seedSource(stores);
    const proposal = await workflow.submitProposal({
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({
        title: "פרטי קשר ישירים של איש קשר",
        bodyMarkdown: "טלפון ישיר של איש הקשר: 052-1234567",
        sensitivity: "פנימי",
      }),
    });
    expect(proposal.checks.sensitivityCheck.outcome).toBe("אזהרה");
  });
});
