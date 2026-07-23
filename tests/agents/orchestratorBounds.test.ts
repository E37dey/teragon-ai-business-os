// W5-C — planner bounds + loop prevention: every limit is enforced with a
// structured stop (AgentGovernanceError), never an open loop.
import { describe, expect, it } from "vitest";
import { AIError } from "@/ai/contracts/AIProvider";
import { AgentOrchestrator, type PlannedStep } from "@/agents/orchestrator";
import { AgentGovernanceError } from "@/agents/errors";
import { AGENT_HARD_LIMITS } from "@/agents/limits";
import {
  freshStores,
  makeClock,
  makeEnvelope,
  makeEvidence,
  makeFakeProvider,
  makeRegistry,
  type FakeBehavior,
} from "./helpers";

const SIMPLE_STEP: PlannedStep = {
  agentId: "ag-nexa",
  operation: "summarize.weekly-leads",
  domain: "leads",
  titleHe: "סיכום לידים",
};

function makeOrchestrator(behavior: FakeBehavior = () => makeEnvelope()) {
  const stores = freshStores();
  const provider = makeFakeProvider(behavior);
  const orchestrator = new AgentOrchestrator({
    stores,
    registry: makeRegistry(provider),
    clock: makeClock(),
  });
  return { stores, provider, orchestrator };
}

describe("specialist bound (≤4)", () => {
  it("a 5-specialist plan is stopped with a structured limit error", async () => {
    const { stores, orchestrator } = makeOrchestrator();
    const plan: PlannedStep[] = [
      { agentId: "ag-hunter", operation: "summarize.weekly-leads", domain: "leads", titleHe: "א" },
      { agentId: "ag-nexa", operation: "summarize.weekly-leads", domain: "leads", titleHe: "ב" },
      { agentId: "ag-fixer", operation: "summarize.weekly-leads", domain: "serviceTickets", titleHe: "ג" },
      { agentId: "ag-mentor", operation: "summarize.weekly-leads", domain: "courses", titleHe: "ד" },
      { agentId: "ag-wiki", operation: "summarize.weekly-leads", domain: "knowledgeNotes", titleHe: "ה" },
    ];
    let caught: unknown = null;
    try {
      await orchestrator.startRun({ goal: "יעד בדיקה", requestedById: "u-1", runId: "r-spec", plan });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AgentGovernanceError);
    const e = caught as AgentGovernanceError;
    expect(e.code).toBe("AGENT_LIMIT_EXCEEDED");
    expect(e.limit).toMatchObject({ name: "maxSpecialists", max: 4, attempted: 5 });
    // run cancelled with kind "מגבלה" + error record persisted
    const run = await stores.runs.get("r-spec");
    expect(run?.status).toBe("בוטל");
    const events = (await stores.events.list()).filter((ev) => ev.runId === "r-spec");
    const cancelled = events.find((ev) => ev.type === "AgentRunCancelled");
    expect(cancelled?.event).toMatchObject({ type: "AgentRunCancelled", kind: "מגבלה" });
    const errors = (await stores.errors.list()).filter((er) => er.runId === "r-spec");
    expect(errors).toHaveLength(1);
  });

  it("permission is checked per planned step — Hunter cannot work on tickets", async () => {
    const { orchestrator } = makeOrchestrator();
    const plan: PlannedStep[] = [
      { agentId: "ag-hunter", operation: "summarize.weekly-leads", domain: "serviceTickets", titleHe: "אסור" },
    ];
    await expect(
      orchestrator.startRun({ goal: "יעד", requestedById: "u-1", runId: "r-perm", plan }),
    ).rejects.toMatchObject({ code: "AGENT_PERMISSION_DENIED" });
  });
});

describe("model-call bound (≤8 per run)", () => {
  it("the 9th provider call is refused BEFORE it happens", async () => {
    // every 3rd call succeeds — each task burns 3 calls (2 recoverable
    // failures + 1 success), so task 3 needs calls 7,8,9 and call 9 is blocked
    const { stores, provider, orchestrator } = makeOrchestrator((_req, i) => {
      if (i % 3 !== 0) throw new AIError("AI_PROVIDER_UNAVAILABLE", { recoverable: true });
      return makeEnvelope();
    });
    const plan: PlannedStep[] = [
      { ...SIMPLE_STEP, titleHe: "1" },
      { ...SIMPLE_STEP, agentId: "ag-hunter", titleHe: "2" },
      { ...SIMPLE_STEP, agentId: "ag-wiki", operation: "summarize.weekly-leads", domain: "knowledgeNotes", titleHe: "3" },
    ];
    let caught: unknown = null;
    try {
      await orchestrator.startRun({ goal: "יעד", requestedById: "u-1", runId: "r-calls", plan });
    } catch (err) {
      caught = err;
    }
    const e = caught as AgentGovernanceError;
    expect(e).toBeInstanceOf(AgentGovernanceError);
    expect(e.limit?.name).toBe("maxModelCallsPerRun");
    expect(e.limit?.max).toBe(AGENT_HARD_LIMITS.maxModelCallsPerRun);
    // the provider was invoked exactly 8 times — the 9th was blocked up front
    expect(provider.calls).toBe(8);
    const run = await stores.runs.get("r-calls");
    expect(run?.counters.modelCalls).toBe(8);
    expect(run?.status).toBe("בוטל");
  });
});

describe("transient retries bound (≤2)", () => {
  it("recoverable provider errors retry twice, then stop structurally", async () => {
    const { stores, provider, orchestrator } = makeOrchestrator(() => {
      throw new AIError("AI_PROVIDER_UNAVAILABLE", { recoverable: true });
    });
    let caught: unknown = null;
    try {
      await orchestrator.startRun({
        goal: "יעד",
        requestedById: "u-1",
        runId: "r-retry",
        plan: [SIMPLE_STEP],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AIError);
    expect(provider.calls).toBe(1 + AGENT_HARD_LIMITS.maxTransientRetries);
    const run = await stores.runs.get("r-retry");
    expect(run?.counters.transientRetries).toBe(2);
    expect(run?.status).toBe("נכשל");
    const events = (await stores.events.list()).filter((ev) => ev.runId === "r-retry");
    expect(events.some((ev) => ev.type === "SpecialistTaskFailed")).toBe(true);
    expect(
      events.find((ev) => ev.type === "AgentRunCancelled")?.event,
    ).toMatchObject({ kind: "שגיאה" });
  });

  it("non-recoverable errors fail immediately (no retry)", async () => {
    const { provider, orchestrator } = makeOrchestrator(() => {
      throw new AIError("AI_PERMISSION_DENIED", { recoverable: false });
    });
    await expect(
      orchestrator.startRun({ goal: "יעד", requestedById: "u-1", runId: "r-hard", plan: [SIMPLE_STEP] }),
    ).rejects.toBeInstanceOf(AIError);
    expect(provider.calls).toBe(1);
  });
});

describe("revision-cycle bound (≤2)", () => {
  it("persistently unverified evidence stops after 2 revision cycles", async () => {
    const { stores, provider, orchestrator } = makeOrchestrator(() =>
      makeEnvelope({ evidence: [makeEvidence({ verified: false, sourceId: "ghost-1" })] }),
    );
    let caught: unknown = null;
    try {
      await orchestrator.startRun({
        goal: "יעד",
        requestedById: "u-1",
        runId: "r-rev",
        plan: [SIMPLE_STEP],
      });
    } catch (err) {
      caught = err;
    }
    const e = caught as AgentGovernanceError;
    expect(e).toBeInstanceOf(AgentGovernanceError);
    expect(e.code).toBe("AGENT_LIMIT_EXCEEDED");
    expect(e.limit?.name).toBe("maxRevisionCycles");
    // first attempt + 2 revisions = 3 provider calls
    expect(provider.calls).toBe(1 + AGENT_HARD_LIMITS.maxRevisionCycles);
    const run = await stores.runs.get("r-rev");
    expect(run?.counters.revisionCycles).toBe(2);
    // the unverified citation is recorded honestly in EvidenceVerified
    const events = (await stores.events.list()).filter((ev) => ev.runId === "r-rev");
    const verified = events.find((ev) => ev.type === "EvidenceVerified");
    expect(verified?.event).toMatchObject({ type: "EvidenceVerified", missing: ["ghost-1"] });
  });
});

describe("run duration bound", () => {
  it("a run that outlives maxRunDurationMs is cancelled with AGENT_TIMEOUT", async () => {
    const stores = freshStores();
    const provider = makeFakeProvider(() => makeEnvelope());
    // clock advances 30s per observation; limit is 45s ⇒ trips mid-lifecycle
    const orchestrator = new AgentOrchestrator({
      stores,
      registry: makeRegistry(provider),
      clock: makeClock("2026-07-23T08:00:00.000Z", 30_000),
    });
    let caught: unknown = null;
    try {
      await orchestrator.startRun({
        goal: "יעד",
        requestedById: "u-1",
        runId: "r-time",
        plan: [SIMPLE_STEP],
        limits: { maxRunDurationMs: 45_000 },
      });
    } catch (err) {
      caught = err;
    }
    const e = caught as AgentGovernanceError;
    expect(e).toBeInstanceOf(AgentGovernanceError);
    expect(e.code).toBe("AGENT_TIMEOUT");
    const run = await stores.runs.get("r-time");
    expect(run?.status).toBe("בוטל");
  });
});

describe("handoff depth + loop prevention", () => {
  async function completedRunWithTask() {
    const { stores, orchestrator } = makeOrchestrator(() =>
      makeEnvelope({ recommendation: "תוצאה" }),
    );
    const result = await orchestrator.startRun({
      goal: "יעד",
      requestedById: "u-1",
      runId: "r-ho",
      plan: [{ ...SIMPLE_STEP, agentId: "ag-hunter" }],
    });
    const taskId = result.run.taskIds[0] as string;
    return { stores, orchestrator, taskId };
  }

  it("cyclic handoff A→B→A is blocked (AGENT_LOOP_DETECTED)", async () => {
    const { orchestrator, taskId } = await completedRunWithTask();
    // dispatch already recorded orchestrator→hunter (depth 1)
    await orchestrator.requestHandoff("r-ho", taskId, "ag-hunter", "ag-wiki", "צריך ידע", "הקשר");
    await expect(
      orchestrator.requestHandoff("r-ho", taskId, "ag-wiki", "ag-hunter", "חזרה", "הקשר"),
    ).rejects.toMatchObject({ code: "AGENT_LOOP_DETECTED" });
  });

  it("handoff chains deeper than 3 are stopped structurally", async () => {
    const { orchestrator, taskId } = await completedRunWithTask();
    await orchestrator.requestHandoff("r-ho", taskId, "ag-hunter", "ag-wiki", "העברה 2", "הקשר");
    await orchestrator.requestHandoff("r-ho", taskId, "ag-wiki", "ag-mentor", "העברה 3", "הקשר");
    let caught: unknown = null;
    try {
      await orchestrator.requestHandoff("r-ho", taskId, "ag-mentor", "ag-nexa", "העברה 4", "הקשר");
    } catch (err) {
      caught = err;
    }
    const e = caught as AgentGovernanceError;
    expect(e).toBeInstanceOf(AgentGovernanceError);
    expect(e.limit?.name).toBe("maxHandoffDepth");
    expect(e.limit?.max).toBe(AGENT_HARD_LIMITS.maxHandoffDepth);
  });

  it("handoffs to unknown agents are denied", async () => {
    const { orchestrator, taskId } = await completedRunWithTask();
    await expect(
      orchestrator.requestHandoff("r-ho", taskId, "ag-hunter", "ag-rogue", "אין", "אין"),
    ).rejects.toMatchObject({ code: "AGENT_PERMISSION_DENIED" });
  });
});

describe("user cancellation", () => {
  it("a pending-approval run can be cancelled by the user (kind משתמש)", async () => {
    const { stores, orchestrator } = makeOrchestrator(() =>
      makeEnvelope({ approval: { required: true, state: "pending" } }),
    );
    const result = await orchestrator.startRun({
      goal: "יעד",
      requestedById: "u-1",
      runId: "r-cancel",
      plan: [SIMPLE_STEP],
    });
    expect(result.run.status).toBe("ממתין לאישור");
    const run = await orchestrator.cancelRun("r-cancel", "u-1", "התחרטתי");
    expect(run.status).toBe("בוטל");
    const events = (await stores.events.list()).filter((ev) => ev.runId === "r-cancel");
    expect(events.find((ev) => ev.type === "AgentRunCancelled")?.event).toMatchObject({
      kind: "משתמש",
      reasonHe: "התחרטתי",
    });
    // a finished run cannot be cancelled again
    await expect(orchestrator.cancelRun("r-cancel", "u-1", "שוב")).rejects.toMatchObject({
      code: "AGENT_APPROVAL_STATE_INVALID",
    });
  });
});
