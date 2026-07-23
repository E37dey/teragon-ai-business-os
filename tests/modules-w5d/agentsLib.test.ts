// W5-D — /agents fleet selectors: every number derives from real records.
import { describe, expect, it } from "vitest";
import type { Agent, AgentTask, Approval } from "@/domain/types";
import type { AgentErrorRecord, AgentEventRecord, AgentRun } from "@/domain/agents";
import { fleetRows, fleetSummary } from "@/modules/agents-ui/lib";

const TS = "2026-07-23T08:00:00.000Z";
const meta = { createdAt: TS, updatedAt: TS };

function agent(id: string, status: Agent["status"] = "פעיל"): Agent {
  return {
    id,
    ...meta,
    name: `סוכן ${id}`,
    purpose: "בדיקה",
    allowedTools: [],
    allowedDomains: [],
    prohibitedDomains: [],
    promptVersion: "v1",
    limits: { maxTasksPerDay: 1, maxActionsPerTask: 1, dailyBudgetILS: 0 },
    status,
  };
}

function task(id: string, agentId: string, status: AgentTask["status"]): AgentTask {
  return {
    id,
    ...meta,
    agentId,
    title: `משימה ${id}`,
    description: "",
    status,
    evidenceIds: [],
    approvalId: null,
  };
}

function run(id: string, specialists: string[], approvalIds: string[] = [], usage = 0): AgentRun {
  return {
    id,
    ...meta,
    goal: `יעד ${id}`,
    requestedById: "u-tzachi",
    classification: null,
    status: "הושלם",
    specialistAgentIds: specialists,
    taskIds: [],
    conflictIds: [],
    approvalIds,
    counters: { modelCalls: 1, transientRetries: 0, revisionCycles: 0, handoffs: 0 },
    limits: { maxRunDurationMs: 60000, maxUsageBudgetILS: 0 },
    usageSpentILS: usage,
    startedAt: TS,
    endedAt: TS,
    correlationId: id,
    demo: false,
  };
}

function taskEvent(seq: number, agentId: string, ok: boolean): AgentEventRecord {
  return {
    id: `ev-${seq}`,
    ...meta,
    runId: "run-1",
    seq,
    ts: TS,
    actor: agentId,
    type: ok ? "SpecialistTaskCompleted" : "SpecialistTaskFailed",
    event: ok
      ? ({
          type: "SpecialistTaskCompleted",
          taskId: "t-1",
          agentId,
          envelope: {} as never,
        } as never)
      : ({
          type: "SpecialistTaskFailed",
          taskId: "t-1",
          agentId,
          errorCode: "X",
          detailHe: "כשל",
        } as never),
  };
}

function approval(id: string, status: Approval["status"]): Approval {
  return {
    id,
    ...meta,
    subjectRef: "agent-run:run-1",
    requestedById: "ag-orchestrator",
    requestedAt: TS,
    status,
    decidedById: null,
    decidedAt: null,
    note: "בדיקה",
  };
}

describe("agents fleet selectors (5.10)", () => {
  it("derives queue, counts, last run/failure and pending approvals from records", () => {
    const rows = fleetRows({
      agents: [agent("ag-hunter"), agent("ag-idle")],
      tasks: [
        task("t-1", "ag-hunter", "רץ"),
        task("t-2", "ag-hunter", "בתור"),
        task("t-3", "ag-hunter", "הושלם"),
      ],
      runs: [run("run-1", ["ag-hunter"], ["ap-1"])],
      errors: [
        {
          id: "err-1",
          ...meta,
          runId: "run-1",
          agentId: "ag-hunter",
          code: "AGENT_TIMEOUT",
          detailHe: "חריגה",
          at: TS,
        } as AgentErrorRecord,
      ],
      events: [
        taskEvent(1, "ag-hunter", true),
        taskEvent(2, "ag-hunter", true),
        taskEvent(3, "ag-hunter", false),
      ],
      approvals: [approval("ap-1", "ממתין")],
    });
    const hunter = rows.find((r) => r.agent.id === "ag-hunter");
    expect(hunter?.queueSize).toBe(2);
    expect(hunter?.currentTask?.status).toMatch(/רץ|בתור/);
    expect(hunter?.counts).toEqual({ success: 2, failure: 1 });
    expect(hunter?.lastRun?.id).toBe("run-1");
    expect(hunter?.lastError?.code).toBe("AGENT_TIMEOUT");
    expect(hunter?.pendingApprovalCount).toBe(1);

    const idle = rows.find((r) => r.agent.id === "ag-idle");
    expect(idle?.queueSize).toBe(0);
    expect(idle?.currentTask).toBeNull();
    expect(idle?.counts).toEqual({ success: 0, failure: 0 });
    expect(idle?.lastRun).toBeNull();
    expect(idle?.pendingApprovalCount).toBe(0);
  });

  it("usage honesty: 0 spend is NOT presented as measured (absent ≠ 0)", () => {
    const rows = fleetRows({
      agents: [agent("ag-hunter")],
      tasks: [],
      runs: [run("run-1", ["ag-hunter"], [], 0)],
      errors: [],
      events: [],
      approvals: [],
    });
    expect(rows[0]?.measuredUsageILS).toBeNull();
  });

  it("usage honesty: measured spend > 0 is surfaced", () => {
    const rows = fleetRows({
      agents: [agent("ag-hunter")],
      tasks: [],
      runs: [run("run-1", ["ag-hunter"], [], 3)],
      errors: [],
      events: [],
      approvals: [],
    });
    expect(rows[0]?.measuredUsageILS).toBe(3);
  });

  it("joins the frozen definitions when the id is governed", () => {
    const rows = fleetRows({
      agents: [agent("ag-hunter"), agent("ag-unknown")],
      tasks: [],
      runs: [],
      errors: [],
      events: [],
      approvals: [],
    });
    expect(rows.find((r) => r.agent.id === "ag-hunter")?.definition?.codeName).toBe("Hunter");
    expect(rows.find((r) => r.agent.id === "ag-unknown")?.definition).toBeUndefined();
  });

  it("fleetSummary counts by status + pending approvals + active runs", () => {
    const summary = fleetSummary(
      [agent("a", "פעיל"), agent("b", "מושבת"), agent("c", "פעיל")],
      [approval("ap-1", "ממתין"), approval("ap-2", "אושר")],
      [{ ...run("r-1", []), status: "רץ" }, run("r-2", [])],
    );
    expect(summary.total).toBe(3);
    expect(summary.byStatus["פעיל"]).toBe(2);
    expect(summary.byStatus["מושבת"]).toBe(1);
    expect(summary.pendingApprovals).toBe(1);
    expect(summary.activeRuns).toBe(1);
  });
});
