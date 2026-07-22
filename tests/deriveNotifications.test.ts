// deriveNotifications — every notification maps to a REAL data condition,
// ids are stable (idempotent boot), and each record passes the zod schema.
import { describe, expect, it } from "vitest";
import {
  deriveNotifications,
  type NotificationSourceData,
} from "@/app/notifications/deriveNotifications";
import { notificationSchema } from "@/domain/schemas";
import {
  AGENT_TASKS,
  AI_RECOMMENDATIONS,
  APPROVALS,
  AUTOMATION_RUNS,
  ENROLLMENTS,
  LEADS,
  QUOTATIONS,
  SEED_ANCHOR,
  SERVICE_TICKETS,
  TASKS,
} from "@/repositories/seed";

const DATA: NotificationSourceData = {
  leads: LEADS,
  tasks: TASKS,
  quotations: QUOTATIONS,
  tickets: SERVICE_TICKETS,
  aiRecommendations: AI_RECOMMENDATIONS,
  approvals: APPROVALS,
  enrollments: ENROLLMENTS,
  automationRuns: AUTOMATION_RUNS,
  agentTasks: AGENT_TASKS,
};

// three days after the anchor — overdue tasks and stale leads clearly exist
const NOW = new Date(`${SEED_ANCHOR}T12:00:00.000Z`);
NOW.setUTCDate(NOW.getUTCDate() + 3);

describe("deriveNotifications", () => {
  const result = deriveNotifications(DATA, NOW);

  it("is deterministic and idempotent (same input ⇒ identical output)", () => {
    expect(deriveNotifications(DATA, NOW)).toEqual(result);
  });

  it("ids are unique and stable per condition", () => {
    const ids = result.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("ntf-")).toBe(true);
  });

  it("every record passes the zod schema", () => {
    for (const n of result) {
      expect(() => notificationSchema.parse(n)).not.toThrow();
    }
  });

  it("overdue tasks produce notifications matching an independent pass", () => {
    const overdueIds = result
      .filter((n) => n.id.startsWith("ntf-task-overdue-"))
      .map((n) => n.relatedEntity.id)
      .sort();
    const expected = TASKS.filter(
      (t) =>
        (t.status === "פתוחה" || t.status === "בתהליך") &&
        new Date(`${t.due}T23:59:59.999Z`).getTime() < NOW.getTime(),
    )
      .map((t) => t.id)
      .sort();
    expect(overdueIds).toEqual(expected);
    expect(overdueIds.length).toBeGreaterThan(0);
  });

  it("quotations awaiting approval (נשלחה) produce notifications", () => {
    const pending = result.filter((n) => n.id.startsWith("ntf-quote-pending-"));
    expect(pending.length).toBe(QUOTATIONS.filter((q) => q.status === "נשלחה").length);
  });

  it("AI recommendation awaiting approval produces a notification", () => {
    const rec = result.find((n) => n.id === "ntf-airec-pending-rec-1");
    expect(rec).toBeDefined();
    expect(rec?.relatedEntity.route).toBe("/agents");
  });

  it("blocked student (חסום / צריך עזרה) produces an urgent notification", () => {
    const blocked = result.find((n) => n.id === "ntf-student-stalled-en-5");
    expect(blocked).toBeDefined();
    expect(blocked?.severity).toBe("דחוף");
  });

  it("no failed automation runs in the seed ⇒ zero failure notifications (honest)", () => {
    expect(result.some((n) => n.id.startsWith("ntf-automation-failed-"))).toBe(false);
  });

  it("failed automation run DOES produce a notification", () => {
    const failed = deriveNotifications(
      {
        ...DATA,
        automationRuns: [
          {
            id: "ar-x",
            createdAt: "2026-07-20",
            updatedAt: "2026-07-20",
            automationId: "auto-1",
            startedAt: "2026-07-20T07:00:00.000Z",
            endedAt: "2026-07-20T07:01:00.000Z",
            outcome: "כישלון",
            stepsLog: ["שלב נכשל"],
            triggeredBy: "מתזמן",
          },
        ],
      },
      NOW,
    );
    expect(failed.some((n) => n.id === "ntf-automation-failed-ar-x")).toBe(true);
  });

  it("SLA breach: only open tickets past their per-priority SLA", () => {
    const slaIds = result
      .filter((n) => n.id.startsWith("ntf-ticket-sla-"))
      .map((n) => n.relatedEntity.id);
    for (const id of slaIds) {
      const t = SERVICE_TICKETS.find((x) => x.id === id);
      expect(t).toBeDefined();
      expect(t?.status !== "טופל" && t?.status !== "נסגר").toBe(true);
    }
  });

  it("every notification points at a real related entity + route", () => {
    for (const n of result) {
      expect(n.relatedEntity.id.length).toBeGreaterThan(0);
      expect(n.relatedEntity.route.startsWith("/")).toBe(true);
    }
  });
});
