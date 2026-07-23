// W5-C — deterministic demo scenario, end-to-end through the REAL engine
// (LocalRulesProvider via the Mode-A registry): records exist, idempotent
// re-run, Hunter/Fixer conflict present, approval pending, audit complete.
import { describe, expect, it } from "vitest";
import { DEMO_GOAL_HE, DEMO_RUN_ID, runDemoScenario } from "@/agents/demoScenario";
import { collectRunRecords } from "@/repositories/agentStores";
import { runGraph, runTimeline } from "@/agents/selectors";
import { resolveConflict } from "@/agents/conflicts";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { freshStores, makeClock } from "./helpers";

describe("demo scenario — לקוח עסקי מבקש מדפסת לחומרים הנדסיים", () => {
  it("creates a real run: 3 specialist tasks, evidence, conflict, pending approval", async () => {
    const stores = freshStores();
    const result = await runDemoScenario({ stores, clock: makeClock() });
    expect(result.created).toBe(true);
    expect(result.runId).toBe(DEMO_RUN_ID);

    const run = result.run;
    expect(run.goal).toBe(DEMO_GOAL_HE);
    expect(run.demo).toBe(true);
    expect(run.classification).toBe("רכישת מדפסת");
    expect(run.status).toBe("ממתין לאישור");
    expect(run.specialistAgentIds).toEqual(["ag-hunter", "ag-wiki", "ag-fixer"]);
    expect(run.taskIds).toHaveLength(3);
    // Mode A honesty: the rules engine spends nothing
    expect(run.usageSpentILS).toBe(0);
    expect(run.counters.modelCalls).toBe(3);

    // tasks are real records with evidence pointing at real seed records
    const records = await collectRunRecords(stores, DEMO_RUN_ID);
    expect(records.tasks).toHaveLength(3);
    for (const t of records.tasks) expect(t.status).toBe("הושלם");
    const evidence = (await stores.evidence.list()).filter((e) =>
      e.subjectRef.startsWith(`agent-task:${DEMO_RUN_ID}-task-`),
    );
    expect(evidence.length).toBeGreaterThan(0);
    const cited = new Set(evidence.map((e) => e.sourceRef));
    expect(cited.has("pm-3")).toBe(true); // Bambu Lab P1S from the catalogue
    expect(cited.has("rec-2")).toBe(true); // approved warping knowledge

    // the deterministic Hunter/Fixer conflict on the recommended model
    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0];
    expect(conflict?.agentIds).toEqual(["ag-hunter", "ag-fixer"]);
    expect(conflict?.description).toContain("Bambu Lab P1S");
    expect(conflict?.resolution).toBeNull();

    // the pending human approval — the orchestrator never decides alone
    expect(result.approval?.status).toBe("ממתין");
    expect(result.approval?.subjectRef).toBe(`agent-run:${DEMO_RUN_ID}`);

    // messages flowed through the coordination room
    expect(records.messages.length).toBeGreaterThanOrEqual(6);
    // provider honesty: envelopes came from the local rules engine
    for (const e of records.events) {
      if (e.event.type === "SpecialistTaskCompleted") {
        expect(e.event.envelope.provider).toBe("local-rules");
        expect(e.event.envelope.model).toBeNull();
        expect(e.event.envelope.usage.measured).toBe(false);
      }
    }
  });

  it("is idempotent — a re-run returns the existing records untouched", async () => {
    const stores = freshStores();
    const first = await runDemoScenario({ stores, clock: makeClock() });
    expect(first.created).toBe(true);
    const eventsBefore = (await stores.events.list()).filter((e) => e.runId === DEMO_RUN_ID);
    const tasksBefore = (await stores.tasks.list()).length;
    const approvalsBefore = (await stores.approvals.list()).length;

    const second = await runDemoScenario({ stores, clock: makeClock() });
    expect(second.created).toBe(false);
    expect(second.runId).toBe(DEMO_RUN_ID);
    expect(second.run.updatedAt).toBe(first.run.updatedAt);
    expect(second.conflicts.map((c) => c.id)).toEqual(first.conflicts.map((c) => c.id));
    expect(second.approval?.id).toBe(first.approval?.id);

    const eventsAfter = (await stores.events.list()).filter((e) => e.runId === DEMO_RUN_ID);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
    expect((await stores.tasks.list()).length).toBe(tasksBefore);
    expect((await stores.approvals.list()).length).toBe(approvalsBefore);
  });

  it("the UI graph and timeline derive fully from the persisted records", async () => {
    const stores = freshStores();
    await runDemoScenario({ stores, clock: makeClock() });
    const records = await collectRunRecords(stores, DEMO_RUN_ID);
    const graph = runGraph(records);
    const nodeIds = graph.nodes.map((n) => n.id);
    for (const id of ["ag-orchestrator", "ag-hunter", "ag-wiki", "ag-fixer", DEMO_RUN_ID]) {
      expect(nodeIds).toContain(id);
    }
    const conflictNode = graph.nodes.find((n) => n.kind === "conflict");
    expect(conflictNode?.status).toBe("ממתין להחלטה");
    const approvalNode = graph.nodes.find((n) => n.kind === "approval");
    expect(approvalNode?.status).toBe("ממתין");

    const timeline = runTimeline(records);
    const types = timeline.map((t) => t.type);
    for (const expected of [
      "AgentRunCreated",
      "TaskClassified",
      "PlanCreated",
      "SpecialistsSelected",
      "SpecialistTaskCompleted",
      "EvidenceVerified",
      "ConflictDetected",
      "SynthesisCompleted",
      "ApprovalRequested",
    ]) {
      expect(types).toContain(expected);
    }
    // parked at the approval gate — no completion event yet
    expect(types).not.toContain("AgentRunCompleted");
  });

  it("human path to closure: resolve the conflict, approve, and the run completes", async () => {
    const stores = freshStores();
    const clock = makeClock();
    const result = await runDemoScenario({ stores, clock });
    const conflictId = result.conflicts[0]?.id as string;
    await resolveConflict(stores, clock, {
      runId: DEMO_RUN_ID,
      conflictId,
      action: "אשר חריגה",
      resolvedById: "u-tzachi",
      noteHe: "ההמלצה תישלח עם גילוי נאות על קריאות השירות",
    });
    const engine = new ApprovalEngine({ stores, clock });
    await engine.decide({
      runId: DEMO_RUN_ID,
      approvalId: result.approval?.id as string,
      kind: "approve",
      decidedById: "u-tzachi",
    });
    // recommendation-only approval ⇒ the run finalizes on decision
    const run = await stores.runs.get(DEMO_RUN_ID);
    expect(run?.status).toBe("הושלם");
    const events = (await stores.events.list()).filter((e) => e.runId === DEMO_RUN_ID);
    expect(events.some((e) => e.type === "ConflictResolved")).toBe(true);
    expect(events.some((e) => e.type === "ApprovalDecided")).toBe(true);
    expect(events.some((e) => e.type === "AgentRunCompleted")).toBe(true);
  });

  it("audit completeness — every state change of the demo run is audited", async () => {
    const stores = freshStores();
    await runDemoScenario({ stores, clock: makeClock() });
    const audits = (await stores.audit.list()).filter((a) =>
      a.id.startsWith(`${DEMO_RUN_ID}-aud-`),
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("run.create");
    expect(actions).toContain("conflict.detect");
    expect(actions).toContain("approval.request");
    for (const a of audits) {
      expect(a.correlationId).toBe(DEMO_RUN_ID);
      expect(a.at).toBeTruthy();
      expect(a.actor).toBeTruthy();
    }
  });
});
