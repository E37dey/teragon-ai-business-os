// W5-C — event persistence (every lifecycle step emits its event, in order)
// and the pure selectors that derive the UI graph ONLY from records.
import { describe, expect, it } from "vitest";
import { AgentOrchestrator, type PlannedStep } from "@/agents/orchestrator";
import { AGENT_RUN_EVENT_TYPES } from "@/domain/agents";
import { collectRunRecords } from "@/repositories/agentStores";
import {
  agentQueueSizes,
  pendingApprovals,
  runGraph,
  runTimeline,
  successFailureCounts,
} from "@/agents/selectors";
import { freshStores, makeClock, makeEnvelope, makeFakeProvider, makeRegistry } from "./helpers";

const STEP: PlannedStep = {
  agentId: "ag-hunter",
  operation: "summarize.weekly-leads",
  domain: "leads",
  titleHe: "סיכום לידים",
};

async function runMinimal(runId = "r-ev") {
  const stores = freshStores();
  const provider = makeFakeProvider(() => makeEnvelope());
  const orchestrator = new AgentOrchestrator({
    stores,
    registry: makeRegistry(provider),
    clock: makeClock(),
  });
  const result = await orchestrator.startRun({
    goal: "יעד בדיקת אירועים",
    requestedById: "u-tzachi",
    runId,
    plan: [STEP],
  });
  return { stores, orchestrator, result };
}

describe("event catalog", () => {
  it("exactly 19 event types, AgentRunCreated … AgentRunCancelled", () => {
    expect(AGENT_RUN_EVENT_TYPES).toHaveLength(19);
    expect(AGENT_RUN_EVENT_TYPES[0]).toBe("AgentRunCreated");
    expect(AGENT_RUN_EVENT_TYPES[18]).toBe("AgentRunCancelled");
    expect(new Set(AGENT_RUN_EVENT_TYPES).size).toBe(19);
  });
});

describe("lifecycle event persistence", () => {
  it("a successful run persists every step's event in order", async () => {
    const { stores } = await runMinimal();
    const events = (await stores.events.list())
      .filter((e) => e.runId === "r-ev")
      .sort((a, b) => a.seq - b.seq);
    expect(events.map((e) => e.type)).toEqual([
      "AgentRunCreated",
      "AgentRunAuthorized",
      "TaskClassified",
      "ContextSelected",
      "PlanCreated",
      "SpecialistsSelected",
      "HandoffOccurred",
      "SpecialistTaskStarted",
      "SpecialistTaskCompleted",
      "EvidenceVerified",
      "SynthesisCompleted",
      "AgentRunCompleted",
    ]);
    // monotonic seq, injected clock, actor on every record
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i];
      expect(e?.seq).toBe(i + 1);
      expect(e?.ts).toMatch(/^2026-07-23T/);
      expect(e?.actor).toBeTruthy();
    }
    // the specialist envelope is persisted inside its completion event
    const completed = events.find((e) => e.type === "SpecialistTaskCompleted");
    expect(completed?.event).toMatchObject({
      type: "SpecialistTaskCompleted",
      agentId: "ag-hunter",
    });
  });

  it("audit completeness: run creation and completion are audited", async () => {
    const { stores } = await runMinimal("r-audit");
    const audits = (await stores.audit.list()).filter((a) => a.id.startsWith("r-audit-aud-"));
    expect(audits.some((a) => a.action === "run.create")).toBe(true);
    expect(audits.some((a) => a.action === "run.complete")).toBe(true);
    for (const a of audits) {
      expect(a.correlationId).toBe("r-audit");
      expect(a.details.length).toBeGreaterThan(0);
    }
  });
});

describe("pure selectors — records in, derived view out", () => {
  it("runGraph derives nodes/edges only from persisted records", async () => {
    const { stores } = await runMinimal("r-graph");
    const records = await collectRunRecords(stores, "r-graph");
    const graph = runGraph(records);
    const nodeIds = graph.nodes.map((n) => n.id);
    expect(nodeIds).toContain("r-graph"); // run node
    expect(nodeIds).toContain("ag-orchestrator");
    expect(nodeIds).toContain("ag-hunter");
    expect(nodeIds).toContain("r-graph-task-1"); // task node
    // dispatch edge agent→task, handoff edge orchestrator→hunter
    expect(
      graph.edges.some((e) => e.kind === "dispatch" && e.from === "ag-hunter" && e.to === "r-graph-task-1"),
    ).toBe(true);
    expect(
      graph.edges.some((e) => e.kind === "handoff" && e.from === "ag-orchestrator" && e.to === "ag-hunter"),
    ).toBe(true);
    expect(graph.edges.some((e) => e.kind === "message")).toBe(true);
  });

  it("runGraph of a missing run is empty (no invented data)", async () => {
    const stores = freshStores();
    const records = await collectRunRecords(stores, "r-missing");
    expect(runGraph(records)).toEqual({ nodes: [], edges: [] });
  });

  it("runTimeline is ordered and labeled in Hebrew", async () => {
    const { stores } = await runMinimal("r-tl");
    const records = await collectRunRecords(stores, "r-tl");
    const timeline = runTimeline(records);
    expect(timeline).toHaveLength(12);
    expect(timeline[0]).toMatchObject({ seq: 1, type: "AgentRunCreated", labelHe: "הריצה נוצרה" });
    expect(timeline[timeline.length - 1]).toMatchObject({ type: "AgentRunCompleted" });
    for (let i = 1; i < timeline.length; i += 1) {
      expect((timeline[i]?.seq ?? 0) > (timeline[i - 1]?.seq ?? 0)).toBe(true);
    }
  });

  it("agentQueueSizes counts only in-flight tasks", async () => {
    const { stores } = await runMinimal("r-q");
    const records = await collectRunRecords(stores, "r-q");
    // the single task completed ⇒ empty queues
    expect(agentQueueSizes(records.tasks)).toEqual({});
    expect(
      agentQueueSizes([
        ...records.tasks,
        { ...(records.tasks[0] as (typeof records.tasks)[number]), id: "x-1", status: "בתור" },
        { ...(records.tasks[0] as (typeof records.tasks)[number]), id: "x-2", status: "רץ" },
      ]),
    ).toEqual({ "ag-hunter": 2 });
  });

  it("pendingApprovals + successFailureCounts derive from records only", async () => {
    const { stores } = await runMinimal("r-sf");
    const records = await collectRunRecords(stores, "r-sf");
    expect(pendingApprovals(records.approvals)).toEqual([]);
    expect(successFailureCounts(records.events, "ag-hunter")).toEqual({ success: 1, failure: 0 });
    expect(successFailureCounts(records.events, "ag-wiki")).toEqual({ success: 0, failure: 0 });
  });
});
