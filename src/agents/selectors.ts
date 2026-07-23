// TERAGON AI BUSINESS OS — pure selectors over persisted run records
// (Wave 5, W5-C). The UI collaboration graph derives ONLY from these —
// no ad-hoc state, no invented numbers. All functions are pure: records in,
// derived view out. Use collectRunRecords() (agentStores.ts) to gather input.
import type { AgentTask, Approval } from "@/domain/types";
import type { AgentEventRecord } from "@/domain/agents";
import type { RunRecords } from "@/repositories/agentStores";

// ---------------------------------------------------------------------------
// graph
// ---------------------------------------------------------------------------

export type RunGraphNodeKind = "run" | "agent" | "task" | "conflict" | "approval";

export interface RunGraphNode {
  id: string;
  kind: RunGraphNodeKind;
  labelHe: string;
  /** status text straight from the record (Hebrew) */
  status: string;
}

export type RunGraphEdgeKind = "dispatch" | "handoff" | "message" | "conflict" | "approval";

export interface RunGraphEdge {
  from: string;
  to: string;
  kind: RunGraphEdgeKind;
  labelHe: string;
}

export interface RunGraph {
  nodes: RunGraphNode[];
  edges: RunGraphEdge[];
}

/** Derive the collaboration graph of one run — records only. */
export function runGraph(records: RunRecords): RunGraph {
  const nodes: RunGraphNode[] = [];
  const edges: RunGraphEdge[] = [];
  const { run } = records;
  if (!run) return { nodes, edges };

  nodes.push({ id: run.id, kind: "run", labelHe: run.goal, status: run.status });

  const agentIds = new Set<string>(["ag-orchestrator", ...run.specialistAgentIds]);
  for (const t of records.tasks) agentIds.add(t.agentId);
  for (const agentId of [...agentIds].sort((a, b) => a.localeCompare(b))) {
    nodes.push({ id: agentId, kind: "agent", labelHe: agentId, status: "" });
  }

  for (const t of records.tasks) {
    nodes.push({ id: t.id, kind: "task", labelHe: t.title, status: t.status });
    edges.push({ from: t.agentId, to: t.id, kind: "dispatch", labelHe: "משימה" });
  }

  for (const h of records.handoffs) {
    edges.push({
      from: h.fromAgentId,
      to: h.toAgentId,
      kind: "handoff",
      labelHe: h.reason,
    });
  }

  for (const m of records.messages) {
    edges.push({
      from: m.fromAgentId,
      to: m.toAgentId ?? run.id,
      kind: "message",
      labelHe: m.content.slice(0, 60),
    });
  }

  for (const c of records.conflicts) {
    nodes.push({
      id: c.id,
      kind: "conflict",
      labelHe: c.description,
      status: c.resolution === null ? "ממתין להחלטה" : "הוחלט",
    });
    for (const agentId of c.agentIds) {
      edges.push({ from: agentId, to: c.id, kind: "conflict", labelHe: "צד בקונפליקט" });
    }
  }

  for (const a of records.approvals) {
    nodes.push({ id: a.id, kind: "approval", labelHe: a.note, status: a.status });
    edges.push({ from: run.id, to: a.id, kind: "approval", labelHe: "בקשת אישור" });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// timeline
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  seq: number;
  ts: string;
  actor: string;
  type: AgentEventRecord["type"];
  /** short Hebrew line for the UI */
  labelHe: string;
}

const EVENT_LABELS_HE: Record<AgentEventRecord["type"], string> = {
  AgentRunCreated: "הריצה נוצרה",
  AgentRunAuthorized: "הרשאות אומתו",
  TaskClassified: "המשימה סווגה",
  ContextSelected: "ההקשר נבחר",
  PlanCreated: "תוכנית נבנתה",
  SpecialistsSelected: "מומחים נבחרו",
  SpecialistTaskStarted: "משימת מומחה החלה",
  SpecialistTaskCompleted: "משימת מומחה הושלמה",
  SpecialistTaskFailed: "משימת מומחה נכשלה",
  HandoffOccurred: "בוצעה העברה",
  EvidenceVerified: "ראיות אומתו",
  ConflictDetected: "זוהה קונפליקט",
  ConflictResolved: "קונפליקט הוכרע",
  SynthesisCompleted: "סינתזה הושלמה",
  ApprovalRequested: "נדרש אישור",
  ApprovalDecided: "התקבלה החלטת אישור",
  ExecutionCompleted: "בוצעה פעולה מאושרת",
  AgentRunCompleted: "הריצה הושלמה",
  AgentRunCancelled: "הריצה בוטלה",
};

/** Ordered timeline of a run, one entry per persisted event. */
export function runTimeline(records: RunRecords): TimelineEntry[] {
  return [...records.events]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      seq: e.seq,
      ts: e.ts,
      actor: e.actor,
      type: e.type,
      labelHe: EVENT_LABELS_HE[e.type],
    }));
}

// ---------------------------------------------------------------------------
// queues / approvals / outcomes
// ---------------------------------------------------------------------------

const QUEUE_STATUSES: ReadonlySet<string> = new Set(["בתור", "רץ", "ממתין לאישור"]);

/** Per-agent queue sizes (tasks still in flight), derived from task records. */
export function agentQueueSizes(tasks: readonly AgentTask[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (!QUEUE_STATUSES.has(t.status)) continue;
    out[t.agentId] = (out[t.agentId] ?? 0) + 1;
  }
  return out;
}

/** Approvals still waiting for a human decision, oldest first. */
export function pendingApprovals(approvals: readonly Approval[]): Approval[] {
  return approvals
    .filter((a) => a.status === "ממתין")
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id));
}

export interface SuccessFailureCounts {
  success: number;
  failure: number;
}

/**
 * Success/failure counts for one agent, derived ONLY from persisted
 * SpecialistTaskCompleted / SpecialistTaskFailed events.
 */
export function successFailureCounts(
  events: readonly AgentEventRecord[],
  agentId: string,
): SuccessFailureCounts {
  let success = 0;
  let failure = 0;
  for (const record of events) {
    const e = record.event;
    if (e.type === "SpecialistTaskCompleted" && e.agentId === agentId) success += 1;
    if (e.type === "SpecialistTaskFailed" && e.agentId === agentId) failure += 1;
  }
  return { success, failure };
}
