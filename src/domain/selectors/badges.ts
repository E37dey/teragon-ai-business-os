// Nav badge selectors — PURE derivations over repository data. The shell nav
// renders a badge ONLY when the derived count is > 0 (zero ⇒ no badge, never a
// fake "0"). No hardcoded numbers anywhere: every count is recomputed from the
// arrays each call, and time-dependent selectors take `now` explicitly so unit
// tests are deterministic.
import type { AgentTask, ISODate, ServiceTicket, StageGate, Task } from "../types";

/** Ticket statuses that mean "still open" (everything except טופל / נסגר). */
const CLOSED_TICKET_STATUSES: readonly ServiceTicket["status"][] = ["טופל", "נסגר"];

/** שירות ותיקונים — count of open service tickets. */
export function openTicketCount(tickets: readonly ServiceTicket[]): number {
  return tickets.filter((t) => !CLOSED_TICKET_STATUSES.includes(t.status)).length;
}

/** A task still requiring work (not completed / cancelled). */
function isOpenTask(task: Task): boolean {
  return task.status === "פתוחה" || task.status === "בתהליך";
}

/** ISO date-or-datetime → epoch ms at end of that calendar day for date-only values. */
function dueMs(due: ISODate): number {
  // date-only "YYYY-MM-DD" is due until the END of that day (23:59:59.999Z)
  return due.length === 10 ? new Date(`${due}T23:59:59.999Z`).getTime() : new Date(due).getTime();
}

/** True when the task's due date has passed relative to `now` and it is still open. */
export function isOverdueTask(task: Task, now: Date): boolean {
  return isOpenTask(task) && dueMs(task.due) < now.getTime();
}

/**
 * משימות ופגישות — overdue OR urgent (priority "גבוהה") open tasks.
 * A task matching both conditions is counted once.
 */
export function overdueOrUrgentTaskCount(tasks: readonly Task[], now: Date): number {
  return tasks.filter((t) => isOpenTask(t) && (isOverdueTask(t, now) || t.priority === "גבוהה"))
    .length;
}

/**
 * מרכז ההגשה — blocking submission issues: stage gates that have NOT passed and
 * carry no evidence at all (a gate cannot be honestly presented without evidence).
 */
export function blockingSubmissionIssueCount(gates: readonly StageGate[]): number {
  return gates.filter((g) => g.status !== "עבר" && g.evidenceIds.length === 0).length;
}

/** סוכני AI — agent tasks currently awaiting human approval ("ממתין לאישור"). */
export function agentTasksAwaitingApprovalCount(agentTasks: readonly AgentTask[]): number {
  return agentTasks.filter((t) => t.status === "ממתין לאישור").length;
}

export interface NavBadgeData {
  tickets: readonly ServiceTicket[];
  tasks: readonly Task[];
  stageGates: readonly StageGate[];
  agentTasks: readonly AgentTask[];
}

/**
 * Composite: route path → badge count. Only routes with count > 0 appear —
 * the nav renders no badge for absent keys.
 */
export function navBadges(data: NavBadgeData, now: Date): Record<string, number> {
  const counts: Record<string, number> = {};
  const service = openTicketCount(data.tickets);
  if (service > 0) counts["/service"] = service;
  const tasks = overdueOrUrgentTaskCount(data.tasks, now);
  if (tasks > 0) counts["/tasks"] = tasks;
  const submission = blockingSubmissionIssueCount(data.stageGates);
  if (submission > 0) counts["/submission"] = submission;
  const agents = agentTasksAwaitingApprovalCount(data.agentTasks);
  if (agents > 0) counts["/agents"] = agents;
  return counts;
}
