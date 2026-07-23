// W5-E functional integration — Phase 5.16 flows 2 + 3, end-to-end through the
// REAL engine stack: seeded InMemory repositories → LocalRulesProvider →
// AgentOrchestrator (approval gate) → ApprovalEngine (injected external
// handler creates a Task) → verification → pure dashboard selectors.
//   flow 2: recommendation → approve → execute → Task created → selectors reflect
//   flow 3: reject with reason → NO mutation + audit + execution stays blocked
import { describe, expect, it } from "vitest";
import type { Task } from "@/domain/types";
import type { ExecutionPayload } from "@/domain/agents";
import {
  LocalRulesProvider,
  repositoryDataAccess,
} from "@/ai/providers/LocalRulesProvider";
import { ProviderRegistry } from "@/ai/providers/registry";
import { AgentOrchestrator } from "@/agents/orchestrator";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { AgentGovernanceError } from "@/agents/errors";
import { collectRunRecords, type AgentStores } from "@/repositories/agentStores";
import { pendingApprovals, runGraph, runTimeline } from "@/agents/selectors";
import { freshStores, makeClock } from "../helpers";

const RUN_ID = "it-appr-run-1";
const TASK_ID = "t-w5e-followup-1";

/** Real engine rig: local rules provider over the seeded repositories,
 *  approval engine with an INJECTED external handler that creates a Task. */
function makeRig(stores: AgentStores) {
  const clock = makeClock();
  const local = new LocalRulesProvider(repositoryDataAccess(), {
    now: clock,
    idFactory: (n) => `it-appr-env-${n}`,
  });
  const registry = new ProviderRegistry(
    { remoteEnabled: false, localFallbackPermitted: true },
    { remote: local, local },
  );
  const approvalEngine = new ApprovalEngine({
    stores,
    clock,
    externalHandlers: {
      "customer-message": async (payload) => {
        // the injected W5-D-style handler: create a REAL follow-up Task record
        const ts = clock();
        await stores.collection<Task>("tasks").create({
          id: TASK_ID,
          createdAt: ts,
          updatedAt: ts,
          title: `מעקב מאושר: ${payload.descriptionHe}`,
          description: String(payload.data["draft"] ?? ""),
          status: "פתוחה",
          priority: "גבוהה",
          dueDate: "2026-07-25",
          assigneeId: "user-1",
          relatedTo: String(payload.data["leadRef"] ?? ""),
        } as unknown as Task);
        return { resultRef: `tasks:${TASK_ID}`, detailHe: `נוצרה משימת מעקב ${TASK_ID}` };
      },
    },
  });
  const orchestrator = new AgentOrchestrator({ stores, registry, approvalEngine, clock });
  return { clock, orchestrator, approvalEngine };
}

const APPROVAL_PAYLOAD: ExecutionPayload = {
  kind: "external",
  action: "customer-message",
  descriptionHe: "שליחת טיוטת פולואו-אפ לליד לאחר אישור",
  data: { draft: "טיוטת מעקב שאושרה על ידי אדם", leadRef: "leads:l-1" },
};

async function startGatedRun(orchestrator: AgentOrchestrator) {
  // Nexa drafts a follow-up (an OUTBOUND draft ⇒ envelope.approval.required)
  return orchestrator.startRun({
    goal: "טיוטת פולואו-אפ לליד חדש עם אישור אנושי",
    requestedById: "u-tzachi",
    runId: RUN_ID,
    plan: [
      {
        agentId: "ag-nexa",
        operation: "recommend.follow-up",
        domain: "leads",
        titleHe: "טיוטת מעקב לליד l-1",
        relatedEntities: [{ type: "lead", id: "l-1" }],
      },
    ],
    approval: {
      action: "customer-message",
      executionPayload: APPROVAL_PAYLOAD,
      previewHe: "שליחת טיוטת המעקב לליד l-1 — לאחר אישור בלבד",
    },
  });
}

describe("flow 2 — approved action: approve → execute → Task created → verified → selectors reflect", () => {
  it("runs the full lifecycle with a real Task mutation only AFTER human approval", async () => {
    const stores = freshStores();
    const { orchestrator, approvalEngine } = makeRig(stores);
    const result = await startGatedRun(orchestrator);

    // the run PARKED at the human gate — nothing executed yet
    expect(result.run.status).toBe("ממתין לאישור");
    expect(result.approval?.status).toBe("ממתין");
    expect(result.outputs[0]?.envelope.approval.required).toBe(true);
    expect(await stores.collection<Task>("tasks").get(TASK_ID)).toBeUndefined();

    // dashboard selector BEFORE the decision: the approval is pending
    const before = await collectRunRecords(stores, RUN_ID);
    expect(pendingApprovals(before.approvals)).toHaveLength(1);

    // human approves
    const approvalId = result.approval?.id as string;
    await approvalEngine.decide({
      runId: RUN_ID,
      approvalId,
      kind: "approve",
      decidedById: "u-tzachi",
    });
    expect(await approvalEngine.workflowState(RUN_ID, approvalId)).toBe("approved");

    // execute — the INJECTED handler creates the Task record
    const exec = await approvalEngine.execute(RUN_ID, approvalId, "u-tzachi");
    expect(exec.outcome).toBe("הצלחה");
    expect(exec.resultRef).toBe(`tasks:${TASK_ID}`);
    const created = await stores.collection<Task>("tasks").get(TASK_ID);
    expect(created).toBeDefined();
    expect(created?.title).toContain("מעקב מאושר");

    // verification: derived workflow state + honest rollback declaration
    expect(await approvalEngine.workflowState(RUN_ID, approvalId)).toBe("executed");
    expect(exec.inverse).toMatchObject({ kind: "unsupported" });

    // the run finalized after all approvals were decided + executed
    const run = await stores.runs.get(RUN_ID);
    expect(run?.status).toBe("הושלם");

    // dashboard selectors reflect the persisted truth
    const after = await collectRunRecords(stores, RUN_ID);
    expect(pendingApprovals(after.approvals)).toHaveLength(0);
    const graph = runGraph(after);
    const approvalNode = graph.nodes.find((n) => n.kind === "approval");
    expect(approvalNode?.status).toBe("אושר");
    const types = runTimeline(after).map((t) => t.type);
    expect(types).toContain("ApprovalRequested");
    expect(types).toContain("ApprovalDecided");
    expect(types).toContain("ExecutionCompleted");
    expect(types).toContain("AgentRunCompleted");

    // audit trail covers request → decision → execution
    const audits = await stores.audit.list();
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("approval.request");
    expect(actions).toContain("approval.approved");
    expect(actions).toContain("approval.execute");
  });
});

describe("flow 3 — rejected action: NO mutation + audit + execution blocked", () => {
  it("reject with reason leaves the data untouched and blocks execution forever", async () => {
    const stores = freshStores();
    const { orchestrator, approvalEngine } = makeRig(stores);
    const result = await startGatedRun(orchestrator);
    const approvalId = result.approval?.id as string;

    // reject REQUIRES a reason
    await expect(
      approvalEngine.decide({
        runId: RUN_ID,
        approvalId,
        kind: "reject",
        decidedById: "u-tzachi",
      }),
    ).rejects.toThrowError(AgentGovernanceError);

    await approvalEngine.decide({
      runId: RUN_ID,
      approvalId,
      kind: "reject",
      decidedById: "u-tzachi",
      noteHe: "הנוסח אינו מתאים ללקוח — אין לשלוח",
    });

    // NO mutation happened
    expect(await stores.collection<Task>("tasks").get(TASK_ID)).toBeUndefined();

    // the rejection is audited with the reason
    const audits = await stores.audit.list();
    const reject = audits.find((a) => a.action === "approval.rejected");
    expect(reject).toBeDefined();
    expect(reject?.details).toContain("הנוסח אינו מתאים ללקוח");

    // execution is blocked forever — structured error, still no mutation
    await expect(approvalEngine.execute(RUN_ID, approvalId, "u-tzachi")).rejects.toMatchObject({
      code: "AGENT_EXECUTION_WITHOUT_APPROVAL",
    });
    expect(await stores.collection<Task>("tasks").get(TASK_ID)).toBeUndefined();

    // the run still finalizes (nothing left pending) — honestly, without execution
    expect((await stores.runs.get(RUN_ID))?.status).toBe("הושלם");
    const events = (await stores.events.list()).filter((e) => e.runId === RUN_ID);
    expect(events.some((e) => e.type === "ExecutionCompleted")).toBe(false);
  });
});
