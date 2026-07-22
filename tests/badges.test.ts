// Badge selectors — derived ONLY from data, verified against independent
// passes over the seed. Time-dependent selectors get a fixed `now`.
import { describe, expect, it } from "vitest";
import {
  agentTasksAwaitingApprovalCount,
  blockingSubmissionIssueCount,
  isOverdueTask,
  navBadges,
  openTicketCount,
  overdueOrUrgentTaskCount,
} from "@/domain/selectors";
import { AGENT_TASKS, SEED_ANCHOR, SERVICE_TICKETS, STAGE_GATES, TASKS } from "@/repositories/seed";
import type { Task } from "@/domain/types";

// fixed "now": one day after the seed anchor (deterministic regardless of runtime)
const NOW = new Date(`${SEED_ANCHOR}T12:00:00.000Z`);
NOW.setUTCDate(NOW.getUTCDate() + 1);

describe("openTicketCount", () => {
  it("matches an independent count of non-closed tickets", () => {
    const expected = SERVICE_TICKETS.filter(
      (t) => t.status !== "טופל" && t.status !== "נסגר",
    ).length;
    expect(openTicketCount(SERVICE_TICKETS)).toBe(expected);
    expect(openTicketCount(SERVICE_TICKETS)).toBeGreaterThan(0); // seed really has open tickets
  });

  it("empty data ⇒ 0 (and therefore no badge)", () => {
    expect(openTicketCount([])).toBe(0);
  });
});

describe("overdueOrUrgentTaskCount", () => {
  it("counts open tasks that are overdue OR urgent, once each", () => {
    const open = TASKS.filter((t) => t.status === "פתוחה" || t.status === "בתהליך");
    const expected = open.filter((t) => isOverdueTask(t, NOW) || t.priority === "גבוהה").length;
    expect(overdueOrUrgentTaskCount(TASKS, NOW)).toBe(expected);
  });

  it("a completed task is never counted, even if overdue and urgent", () => {
    const done: Task = {
      id: "task-x",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      title: "בדיקה",
      description: "",
      status: "הושלמה",
      priority: "גבוהה",
      due: "2026-01-02",
      ownerId: "u-1",
      relatedRef: null,
    };
    expect(overdueOrUrgentTaskCount([done], NOW)).toBe(0);
  });

  it("date-only due dates are overdue only after the END of that day", () => {
    const task: Task = {
      id: "task-y",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      title: "בדיקה",
      description: "",
      status: "פתוחה",
      priority: "נמוכה",
      due: "2026-07-22",
      ownerId: "u-1",
      relatedRef: null,
    };
    expect(isOverdueTask(task, new Date("2026-07-22T18:00:00.000Z"))).toBe(false);
    expect(isOverdueTask(task, new Date("2026-07-23T01:00:00.000Z"))).toBe(true);
  });
});

describe("blockingSubmissionIssueCount", () => {
  it("counts non-passed gates without evidence (seed has such gates)", () => {
    const expected = STAGE_GATES.filter(
      (g) => g.status !== "עבר" && g.evidenceIds.length === 0,
    ).length;
    expect(blockingSubmissionIssueCount(STAGE_GATES)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe("agentTasksAwaitingApprovalCount", () => {
  it("counts only 'ממתין לאישור' tasks", () => {
    const expected = AGENT_TASKS.filter((t) => t.status === "ממתין לאישור").length;
    expect(agentTasksAwaitingApprovalCount(AGENT_TASKS)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe("navBadges composite", () => {
  it("maps counts to route paths and omits zero-count routes", () => {
    const badges = navBadges(
      { tickets: SERVICE_TICKETS, tasks: TASKS, stageGates: STAGE_GATES, agentTasks: AGENT_TASKS },
      NOW,
    );
    expect(badges["/service"]).toBe(openTicketCount(SERVICE_TICKETS));
    expect(badges["/tasks"]).toBe(overdueOrUrgentTaskCount(TASKS, NOW));
    expect(badges["/submission"]).toBe(blockingSubmissionIssueCount(STAGE_GATES));
    expect(badges["/agents"]).toBe(agentTasksAwaitingApprovalCount(AGENT_TASKS));
  });

  it("zero everywhere ⇒ empty record (no badges rendered at all)", () => {
    expect(navBadges({ tickets: [], tasks: [], stageGates: [], agentTasks: [] }, NOW)).toEqual({});
  });
});
