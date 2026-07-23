// W5-D — pure selectors for the /agents fleet screen (unit tested).
// Everything derives from REAL records + the frozen W5-C definitions.
// Honesty: usage is shown ONLY when measured (absent ≠ 0 ⇒ "טרם נמדד").
import type { Agent, AgentTask, Approval } from "@/domain/types";
import type { AgentErrorRecord, AgentEventRecord, AgentRun } from "@/domain/agents";
import {
  agentQueueSizes,
  getAgentDefinition,
  pendingApprovals,
  successFailureCounts,
  type AgentDefinition,
  type SuccessFailureCounts,
} from "@/agents";

export interface AgentFleetRow {
  agent: Agent;
  /** frozen W5-C definition (undefined for non-governed agents) */
  definition: AgentDefinition | undefined;
  /** the newest in-flight task (בתור/רץ/ממתין לאישור), null when idle */
  currentTask: AgentTask | null;
  queueSize: number;
  counts: SuccessFailureCounts;
  lastRun: AgentRun | null;
  lastError: AgentErrorRecord | null;
  pendingApprovalCount: number;
  /** measured spend across the agent's runs; null ⇒ never measured */
  measuredUsageILS: number | null;
}

const IN_FLIGHT: ReadonlySet<string> = new Set(["בתור", "רץ", "ממתין לאישור"]);

function agentParticipates(run: AgentRun, agentId: string): boolean {
  return agentId === "ag-orchestrator" || run.specialistAgentIds.includes(agentId);
}

export interface FleetInputs {
  agents: readonly Agent[];
  tasks: readonly AgentTask[];
  runs: readonly AgentRun[];
  errors: readonly AgentErrorRecord[];
  events: readonly AgentEventRecord[];
  approvals: readonly Approval[];
}

/** Derive one row per agent — real records only, no invented numbers. */
export function fleetRows(inputs: FleetInputs): AgentFleetRow[] {
  const queues = agentQueueSizes([...inputs.tasks]);
  const pending = pendingApprovals([...inputs.approvals]);
  const pendingIds = new Set(pending.map((a) => a.id));
  return [...inputs.agents]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((agent) => {
      const inFlight = inputs.tasks
        .filter((t) => t.agentId === agent.id && IN_FLIGHT.has(t.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
      const myRuns = inputs.runs
        .filter((r) => agentParticipates(r, agent.id))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
      const myErrors = inputs.errors
        .filter((e) => e.agentId === agent.id)
        .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
      const myPending = myRuns.filter((r) => r.approvalIds.some((id) => pendingIds.has(id)));
      // measured spend only: run.usageSpentILS accumulates measured cost alone,
      // but a 0 does NOT mean "measured 0" — only >0 proves measurement happened.
      const measuredTotal = myRuns.reduce((sum, r) => sum + r.usageSpentILS, 0);
      return {
        agent,
        definition: getAgentDefinition(agent.id),
        currentTask: inFlight[0] ?? null,
        queueSize: queues[agent.id] ?? 0,
        counts: successFailureCounts(inputs.events, agent.id),
        lastRun: myRuns[0] ?? null,
        lastError: myErrors[0] ?? null,
        pendingApprovalCount: myPending.reduce(
          (n, r) => n + r.approvalIds.filter((id) => pendingIds.has(id)).length,
          0,
        ),
        measuredUsageILS: measuredTotal > 0 ? measuredTotal : null,
      };
    });
}

/** Fleet-level summary for the rail. */
export interface FleetSummary {
  total: number;
  byStatus: Record<string, number>;
  pendingApprovals: number;
  activeRuns: number;
}

export function fleetSummary(
  agents: readonly Agent[],
  approvals: readonly Approval[],
  runs: readonly AgentRun[],
): FleetSummary {
  const byStatus: Record<string, number> = {};
  for (const a of agents) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  return {
    total: agents.length,
    byStatus,
    pendingApprovals: pendingApprovals([...approvals]).length,
    activeRuns: runs.filter((r) => r.status === "רץ" || r.status === "ממתין לאישור").length,
  };
}
