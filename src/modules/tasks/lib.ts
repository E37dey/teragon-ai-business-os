// Tasks module — pure derivations for the combined human+agent work queue.
// The domain TaskStatus has 4 values; the operational board needs 6 work
// states, so the extra states are persisted as a compact machine-readable
// marker inside `description` (module-local workaround; the proper
// `workState` field is an integration request). Unit-tested.
import type {
  AgentTask,
  AgentTaskStatus,
  ISODate,
  Meeting,
  Task,
  TaskStatus,
} from "@/domain/types";

export const WORK_STATES = [
  "לביצוע",
  "בביצוע",
  "ממתין ללקוח",
  "ממתין לאישור",
  "חסום",
  "הושלם",
] as const;
export type WorkState = (typeof WORK_STATES)[number];

export type OwnershipType = "משימה אנושית" | "משימת סוכן" | "משימה משותפת";

const STATE_MARKER = /\s*⟦מצב:([^⟧]+)⟧/;
const SHARED_MARKER = "⟦בעלות:משותפת⟧";

export interface ParsedMarkers {
  state: WorkState | null;
  shared: boolean;
  /** description without markers (what the UI shows) */
  clean: string;
}

export function parseMarkers(description: string): ParsedMarkers {
  let clean = description;
  let state: WorkState | null = null;
  const m = STATE_MARKER.exec(clean);
  if (m?.[1] && (WORK_STATES as readonly string[]).includes(m[1])) {
    state = m[1] as WorkState;
  }
  clean = clean.replace(STATE_MARKER, "");
  const shared = clean.includes(SHARED_MARKER);
  clean = clean.replace(SHARED_MARKER, "").trim();
  return { state, shared, clean };
}

/** Rebuild a description embedding the given markers. */
export function withMarkers(clean: string, state: WorkState | null, shared: boolean): string {
  const parts = [clean.trim()];
  // only waiting/blocked states need a marker — the rest map onto TaskStatus
  if (state === "ממתין ללקוח" || state === "ממתין לאישור" || state === "חסום") {
    parts.push(`⟦מצב:${state}⟧`);
  }
  if (shared) parts.push(SHARED_MARKER);
  return parts.filter(Boolean).join(" ");
}

/** Effective board state of a human task. */
export function taskWorkState(task: Task): WorkState {
  if (task.status === "הושלמה") return "הושלם";
  if (task.status === "בוטלה") return "הושלם";
  const { state } = parseMarkers(task.description);
  if (state) return state;
  return task.status === "בתהליך" ? "בביצוע" : "לביצוע";
}

/** The base TaskStatus a work state maps back onto. */
export function baseStatusFor(state: WorkState): TaskStatus {
  switch (state) {
    case "לביצוע":
      return "פתוחה";
    case "בביצוע":
      return "בתהליך";
    case "הושלם":
      return "הושלמה";
    default:
      return "בתהליך";
  }
}

/** Board state of an agent task (read-only mapping). */
export function agentTaskWorkState(status: AgentTaskStatus): WorkState {
  switch (status) {
    case "בתור":
      return "לביצוע";
    case "רץ":
    case "אושר":
      return "בביצוע";
    case "ממתין לאישור":
      return "ממתין לאישור";
    case "נדחה":
    case "נכשל":
      return "חסום";
    case "הושלם":
      return "הושלם";
  }
}

export function taskOwnership(task: Task): OwnershipType {
  return parseMarkers(task.description).shared ? "משימה משותפת" : "משימה אנושית";
}

export type WorkItem =
  | { kind: "human"; state: WorkState; task: Task }
  | { kind: "agent"; state: WorkState; agentTask: AgentTask };

export function buildWorkItems(
  tasks: readonly Task[],
  agentTasks: readonly AgentTask[],
): WorkItem[] {
  const humans: WorkItem[] = tasks
    .filter((t) => t.status !== "בוטלה")
    .map((t) => ({ kind: "human", state: taskWorkState(t), task: t }));
  const agents: WorkItem[] = agentTasks.map((a) => ({
    kind: "agent",
    state: agentTaskWorkState(a.status),
    agentTask: a,
  }));
  return [...humans, ...agents];
}

export function groupByState(items: readonly WorkItem[]): Record<WorkState, WorkItem[]> {
  const out: Record<WorkState, WorkItem[]> = {
    לביצוע: [],
    בביצוע: [],
    "ממתין ללקוח": [],
    "ממתין לאישור": [],
    חסום: [],
    הושלם: [],
  };
  for (const item of items) out[item.state].push(item);
  return out;
}

/** Overdue: human task with a past due date that is not done. */
export function isOverdue(task: Task, today: ISODate): boolean {
  const state = taskWorkState(task);
  return state !== "הושלם" && task.due.slice(0, 10) < today;
}

export function overdueTasks(tasks: readonly Task[], today: ISODate): Task[] {
  return tasks
    .filter((t) => t.status !== "בוטלה" && isOverdue(t, today))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function dueToday(tasks: readonly Task[], today: ISODate): Task[] {
  return tasks.filter(
    (t) => t.status !== "בוטלה" && taskWorkState(t) !== "הושלם" && t.due.slice(0, 10) === today,
  );
}

/** Meetings on a given day, sorted by start time. */
export function meetingsOn(meetings: readonly Meeting[], dayIso: ISODate): Meeting[] {
  return meetings
    .filter((m) => m.scheduledAt.slice(0, 10) === dayIso)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** Next `days` days (including today) that have meetings, as [day, meetings] pairs. */
export function meetingsByDay(
  meetings: readonly Meeting[],
  today: ISODate,
  days: number,
): [ISODate, Meeting[]][] {
  const out: [ISODate, Meeting[]][] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const day = d.toISOString().slice(0, 10);
    const list = meetingsOn(meetings, day);
    if (list.length > 0) out.push([day, list]);
  }
  return out;
}
