// S13.5 (PR E) — bounded, human-controlled agent loop: proves the loop is NOT
// autonomous (every transition is an explicit call; no step chains into the next),
// reuses the existing engine, enforces the approval gate, is stoppable, fails
// closed, and produces a complete trace. Max 4 steps, max 1 mutation.
import { beforeEach, describe, expect, it } from "vitest";
import {
  LOOP_MAX_STEPS,
  approveMutation,
  initialLoop,
  isTerminal,
  rejectMutation,
  runFixerProposal,
  runHunter,
  runOrchestrator,
  stageApproval,
  startLoop,
  stopLoop,
} from "@/modules/ai-workspace/agentLoop";
import { AGENT_ACTIONS, __resetAgentActionStore, appliedCorrectionCount } from "@/agents/actions";

const CTX = { now: "2026-08-08T00:00:00.000Z", loopId: "loop-1", orgId: "org-1" } as const;

beforeEach(() => __resetAgentActionStore());

describe("bounded agent loop — state machine", () => {
  it("starts IDLE with maximumSteps === 4 and no steps run", () => {
    const s = initialLoop(CTX);
    expect(s.status).toBe("IDLE");
    expect(s.maximumSteps).toBe(LOOP_MAX_STEPS);
    expect(LOOP_MAX_STEPS).toBe(4);
    expect(s.currentStep).toBe(0);
    expect(s.stepResults).toEqual([]);
  });

  it("starting the loop PLANS it but runs NO agent (Hunter not auto-executed)", () => {
    const s = startLoop(initialLoop(CTX), CTX);
    expect(s.status).toBe("PLANNED");
    expect(s.stepResults.length).toBe(0); // nothing executed on start
    expect(appliedCorrectionCount()).toBe(0);
  });

  it("NO AUTONOMY: each step requires an explicit call; none chains into the next", () => {
    let s = startLoop(initialLoop(CTX), CTX);
    // Step 1 — Hunter runs; Fixer is NOT invoked as a side effect.
    s = runHunter(s, CTX);
    expect(s.status).toBe("WAITING_FOR_USER");
    expect(s.currentStep).toBe(1);
    expect(s.stepResults.map((r) => r.agentId)).toEqual(["ag-hunter"]); // ONLY Hunter
    expect(appliedCorrectionCount()).toBe(0);
    // Step 2 — Fixer proposal; approval is NOT auto-invoked.
    s = runFixerProposal(s, CTX);
    expect(s.currentStep).toBe(2);
    expect(s.stepResults.map((r) => r.actionId)).toEqual(["hunter.incomplete-customers", "fixer.propose-correction"]);
    expect(appliedCorrectionCount()).toBe(0); // proposal never mutates
    // Step 3 stage — awaiting_approval; still NO mutation.
    s = stageApproval(s, CTX);
    expect(s.status).toBe("AWAITING_APPROVAL");
    expect(appliedCorrectionCount()).toBe(0);
    // Approve — mutation applies once; Orchestrator is NOT auto-run.
    s = approveMutation(s, CTX);
    expect(appliedCorrectionCount()).toBe(1);
    expect(s.status).toBe("WAITING_FOR_USER");
    expect(s.stepResults.some((r) => r.step === 4)).toBe(false); // step 4 not chained
    // Step 4 — Orchestrator runs only on explicit call → COMPLETED.
    s = runOrchestrator(s, CTX);
    expect(s.status).toBe("COMPLETED");
    expect(s.currentStep).toBe(4);
  });

  it("step order is fixed: out-of-order calls are no-ops (guards)", () => {
    const planned = startLoop(initialLoop(CTX), CTX);
    expect(runFixerProposal(planned, CTX)).toEqual(planned); // can't propose before Hunter
    expect(runOrchestrator(planned, CTX)).toEqual(planned); // can't summarize before approval
    expect(approveMutation(planned, CTX)).toEqual(planned); // can't approve before staging
  });

  it("currentStep never exceeds 4 and terminal states cannot continue", () => {
    let s = startLoop(initialLoop(CTX), CTX);
    s = runOrchestrator(runHunter(s, CTX), CTX); // orchestrator no-op at step 1
    s = runFixerProposal(runHunter(startLoop(initialLoop(CTX), CTX), CTX), CTX);
    s = approveMutation(stageApproval(s, CTX), CTX);
    s = runOrchestrator(s, CTX);
    expect(s.status).toBe("COMPLETED");
    expect(s.currentStep).toBe(4);
    // terminal: further transitions are no-ops
    expect(runOrchestrator(s, CTX)).toEqual(s);
    expect(stopLoop(s, CTX)).toEqual(s);
    expect(isTerminal(s.status)).toBe(true);
  });
});

describe("bounded agent loop — approval, stop, fail-closed", () => {
  function toAwaiting() {
    return stageApproval(runFixerProposal(runHunter(startLoop(initialLoop(CTX), CTX), CTX), CTX), CTX);
  }

  it("mutation is impossible before approval; approve applies exactly once; duplicate blocked", () => {
    const awaiting = toAwaiting();
    expect(appliedCorrectionCount()).toBe(0); // staged, not applied
    const approved = approveMutation(awaiting, CTX);
    expect(appliedCorrectionCount()).toBe(1); // applied once
    // a second approve is a no-op (status is no longer AWAITING_APPROVAL)
    expect(approveMutation(approved, CTX)).toEqual(approved);
    expect(appliedCorrectionCount()).toBe(1); // duplicate blocked
  });

  it("reject ends the loop with no mutation", () => {
    const rejected = rejectMutation(toAwaiting(), CTX);
    expect(rejected.status).toBe("REJECTED");
    expect(appliedCorrectionCount()).toBe(0); // reject never mutates
  });

  it("stop is available at active stages, halts continuation, and never rolls back an applied mutation", () => {
    // stop mid-flight
    const stopped = stopLoop(runHunter(startLoop(initialLoop(CTX), CTX), CTX), CTX);
    expect(stopped.status).toBe("STOPPED");
    expect(runFixerProposal(stopped, CTX)).toEqual(stopped); // no further step after stop
    // stop AFTER an approved mutation → mutation is NOT rolled back
    const approved = approveMutation(toAwaiting(), CTX);
    expect(appliedCorrectionCount()).toBe(1);
    const stoppedAfter = stopLoop(approved, CTX);
    expect(stoppedAfter.status).toBe("STOPPED");
    expect(appliedCorrectionCount()).toBe(1); // still applied — no false rollback
  });

  it("fail-closed: missing organization context blocks the loop", () => {
    const blocked = startLoop(initialLoop(CTX), { ...CTX, orgId: "" });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.stopReason).toContain("ארגון");
    expect(runHunter(blocked, CTX)).toEqual(blocked); // no continuation from a blocked state
  });
});

describe("bounded agent loop — trace + engine reuse", () => {
  it("produces one trace entry per completed step with preserved correlationIds and evidence counts", () => {
    let s = startLoop(initialLoop(CTX), CTX);
    s = runOrchestrator(approveMutation(stageApproval(runFixerProposal(runHunter(s, CTX), CTX), CTX), CTX), CTX);
    expect(s.status).toBe("COMPLETED");
    expect(s.stepResults.map((r) => r.step)).toEqual([1, 2, 3, 4]);
    for (const r of s.stepResults) {
      expect(r.correlationId).toMatch(/./);
      expect(typeof r.evidenceCount).toBe("number");
      // trace carries no raw payload — only summary/status/counts/ids
      expect(Object.keys(r).sort()).toEqual(["actionId", "agentId", "at", "correlationId", "evidenceCount", "status", "step", "summary"].sort());
    }
    // every stepwise engine call recorded a correlationId (incl. the staging call)
    expect(s.correlationIds.length).toBe(5);
  });

  it("reuses ONLY existing registered agent actions (no second registry)", () => {
    const known = new Set(AGENT_ACTIONS.map((a) => a.id));
    let s = startLoop(initialLoop(CTX), CTX);
    s = runOrchestrator(approveMutation(stageApproval(runFixerProposal(runHunter(s, CTX), CTX), CTX), CTX), CTX);
    for (const r of s.stepResults) expect(known.has(r.actionId), r.actionId).toBe(true);
  });
});
