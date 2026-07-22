// Wave 4 — tasks module: 6-state mapping, markers, overdue, meetings grouping.
import { describe, expect, it } from "vitest";
import type { AgentTask, Meeting, Task } from "@/domain/types";
import {
  agentTaskWorkState,
  baseStatusFor,
  buildWorkItems,
  dueToday,
  groupByState,
  isOverdue,
  meetingsByDay,
  meetingsOn,
  overdueTasks,
  parseMarkers,
  taskOwnership,
  taskWorkState,
  withMarkers,
} from "@/modules/tasks/lib";

function task(patch: Partial<Task>): Task {
  return {
    id: "task-x",
    title: "משימה",
    description: "",
    status: "פתוחה",
    priority: "בינונית",
    due: "2026-07-25",
    ownerId: "u-maya",
    relatedRef: null,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...patch,
  };
}

function agentTask(patch: Partial<AgentTask>): AgentTask {
  return {
    id: "at-x",
    agentId: "ag-hunter",
    title: "משימת סוכן",
    description: "",
    status: "בתור",
    evidenceIds: [],
    approvalId: null,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...patch,
  };
}

describe("markers", () => {
  it("round-trip waiting state + shared ownership", () => {
    const d = withMarkers("לתאם עם הלקוח", "ממתין ללקוח", true);
    const p = parseMarkers(d);
    expect(p.state).toBe("ממתין ללקוח");
    expect(p.shared).toBe(true);
    expect(p.clean).toBe("לתאם עם הלקוח");
  });
  it("board states that map to TaskStatus need no marker", () => {
    expect(withMarkers("רגיל", "בביצוע", false)).toBe("רגיל");
    expect(parseMarkers("רגיל").state).toBeNull();
  });
});

describe("taskWorkState", () => {
  it("maps base statuses", () => {
    expect(taskWorkState(task({ status: "פתוחה" }))).toBe("לביצוע");
    expect(taskWorkState(task({ status: "בתהליך" }))).toBe("בביצוע");
    expect(taskWorkState(task({ status: "הושלמה" }))).toBe("הושלם");
  });
  it("marker overrides for waiting/blocked states", () => {
    const t = task({ status: "בתהליך", description: withMarkers("x", "חסום", false) });
    expect(taskWorkState(t)).toBe("חסום");
  });
  it("done wins over any marker", () => {
    const t = task({ status: "הושלמה", description: withMarkers("x", "חסום", false) });
    expect(taskWorkState(t)).toBe("הושלם");
  });
});

describe("baseStatusFor", () => {
  it("waiting/blocked states persist as בתהליך", () => {
    expect(baseStatusFor("ממתין לאישור")).toBe("בתהליך");
    expect(baseStatusFor("לביצוע")).toBe("פתוחה");
    expect(baseStatusFor("הושלם")).toBe("הושלמה");
  });
});

describe("agentTaskWorkState", () => {
  it("maps the agent statuses onto board states", () => {
    expect(agentTaskWorkState("בתור")).toBe("לביצוע");
    expect(agentTaskWorkState("רץ")).toBe("בביצוע");
    expect(agentTaskWorkState("ממתין לאישור")).toBe("ממתין לאישור");
    expect(agentTaskWorkState("נכשל")).toBe("חסום");
    expect(agentTaskWorkState("הושלם")).toBe("הושלם");
  });
});

describe("ownership", () => {
  it("shared marker makes a task משותפת", () => {
    expect(taskOwnership(task({}))).toBe("משימה אנושית");
    expect(taskOwnership(task({ description: withMarkers("x", null, true) }))).toBe("משימה משותפת");
  });
});

describe("buildWorkItems / groupByState", () => {
  it("combines human tasks and agent tasks, drops cancelled", () => {
    const items = buildWorkItems(
      [task({ id: "a" }), task({ id: "b", status: "בוטלה" })],
      [agentTask({ id: "c", status: "ממתין לאישור" })],
    );
    expect(items).toHaveLength(2);
    const grouped = groupByState(items);
    expect(grouped["לביצוע"]).toHaveLength(1);
    expect(grouped["ממתין לאישור"]).toHaveLength(1);
  });
});

describe("overdue / today", () => {
  const today = "2026-07-22";
  it("overdue = past due and not done", () => {
    expect(isOverdue(task({ due: "2026-07-20" }), today)).toBe(true);
    expect(isOverdue(task({ due: "2026-07-20", status: "הושלמה" }), today)).toBe(false);
    expect(isOverdue(task({ due: "2026-07-22" }), today)).toBe(false);
  });
  it("queues sort and filter correctly", () => {
    const list = [
      task({ id: "a", due: "2026-07-21" }),
      task({ id: "b", due: "2026-07-10" }),
      task({ id: "c", due: "2026-07-22" }),
    ];
    expect(overdueTasks(list, today).map((t) => t.id)).toEqual(["b", "a"]);
    expect(dueToday(list, today).map((t) => t.id)).toEqual(["c"]);
  });
});

describe("meetings", () => {
  const meeting = (id: string, at: string): Meeting => ({
    id,
    title: id,
    scheduledAt: at,
    durationMinutes: 30,
    location: "זום",
    participantIds: [],
    agenda: "",
    relatedRef: null,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
  });
  it("meetingsOn filters and sorts by hour", () => {
    const list = [
      meeting("late", "2026-07-22T15:00:00.000Z"),
      meeting("early", "2026-07-22T08:00:00.000Z"),
      meeting("other", "2026-07-23T08:00:00.000Z"),
    ];
    expect(meetingsOn(list, "2026-07-22").map((m) => m.id)).toEqual(["early", "late"]);
  });
  it("meetingsByDay returns only days with meetings inside the window", () => {
    const list = [
      meeting("a", "2026-07-22T08:00:00.000Z"),
      meeting("b", "2026-07-24T08:00:00.000Z"),
      meeting("c", "2026-08-15T08:00:00.000Z"), // outside the 7-day window
    ];
    const days = meetingsByDay(list, "2026-07-22", 7);
    expect(days.map(([d]) => d)).toEqual(["2026-07-22", "2026-07-24"]);
  });
});
