import { describe, expect, it } from "vitest";
import {
  followUpQueue,
  greetingForHour,
  pendingRecommendations,
  revenueByMonth,
  todayTimeline,
} from "@/modules/command-center/selectors";
import type { AIRecommendation, Approval, Lead, Meeting, Quotation, Task } from "@/domain/types";

const base = { createdAt: "2026-07-01T08:00:00.000Z", updatedAt: "2026-07-01T08:00:00.000Z" };

function lead(id: string, status: Lead["status"], followUp: string): Lead {
  return {
    id,
    ...base,
    name: id,
    phone: "",
    email: "",
    source: "אתר",
    interest: "",
    status,
    ownerId: "u-1",
    followUp,
    notes: "",
    history: [],
  };
}

describe("greetingForHour — adapts to time of day, always צחי", () => {
  it("morning", () => expect(greetingForHour(8)).toBe("בוקר טוב, צחי"));
  it("noon", () => expect(greetingForHour(13)).toBe("צהריים טובים, צחי"));
  it("evening", () => expect(greetingForHour(20)).toBe("ערב טוב, צחי"));
  it("night is evening greeting", () => expect(greetingForHour(2)).toBe("ערב טוב, צחי"));
});

describe("revenueByMonth — derived from quotations", () => {
  const quote = (
    id: string,
    createdAt: string,
    status: Quotation["status"],
    price: number,
  ): Quotation => ({
    id,
    createdAt,
    updatedAt: createdAt,
    customerName: "x",
    customerId: null,
    title: "t",
    lines: [{ id: `${id}-1`, description: "d", quantity: 1, unitPrice: price, productId: null }],
    discountPercent: 0,
    terms: "",
    validUntil: "2026-08-01",
    status,
    ownerId: "u-1",
  });

  it("buckets approved vs open by creation month, sorted", () => {
    const months = revenueByMonth([
      quote("q1", "2026-06-10T08:00:00.000Z", "אושרה", 1000),
      quote("q2", "2026-07-01T08:00:00.000Z", "נשלחה", 500),
      quote("q3", "2026-07-05T08:00:00.000Z", "אושרה", 700),
      quote("q4", "2026-07-06T08:00:00.000Z", "נדחתה", 999),
    ]);
    expect(months.map((m) => m.month)).toEqual(["2026-06", "2026-07"]);
    expect(months[1]?.approved).toBe(700);
    expect(months[1]?.open).toBe(500);
  });
});

describe("followUpQueue", () => {
  it("returns only open leads due today or earlier, oldest first", () => {
    const q = followUpQueue(
      [
        lead("a", "חדש", "2026-07-22"),
        lead("b", "נוצר קשר", "2026-07-20"),
        lead("c", "נסגר כלקוח", "2026-07-01"),
        lead("d", "לא רלוונטי", "2026-07-01"),
        lead("e", "חדש", "2026-07-25"),
      ],
      "2026-07-22",
    );
    expect(q.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("todayTimeline", () => {
  it("merges today's open tasks and meetings sorted by time", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        ...base,
        title: "משימה",
        description: "",
        status: "פתוחה",
        priority: "גבוהה",
        due: "2026-07-22",
        ownerId: "u",
        relatedRef: null,
      },
      {
        id: "t2",
        ...base,
        title: "הושלמה",
        description: "",
        status: "הושלמה",
        priority: "נמוכה",
        due: "2026-07-22",
        ownerId: "u",
        relatedRef: null,
      },
    ];
    const meetings: Meeting[] = [
      {
        id: "m1",
        ...base,
        title: "פגישה",
        scheduledAt: "2026-07-22T09:30:00.000Z",
        durationMinutes: 30,
        location: "זום",
        participantIds: [],
        agenda: "",
        relatedRef: null,
      },
    ];
    const entries = todayTimeline(tasks, meetings, "2026-07-22");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe("פגישה");
    expect(entries[1]?.id).toBe("t1"); // completed task excluded, date-only last
  });
});

describe("pendingRecommendations", () => {
  const rec = (id: string, approvalId: string | null, required = true): AIRecommendation => ({
    id,
    ...base,
    agentId: "ag",
    title: id,
    reason: "r",
    evidenceIds: [],
    confidenceMethod: null,
    nextAction: "n",
    approvalRequired: required,
    approvalId,
    entityRef: null,
  });
  const approval = (id: string, status: Approval["status"]): Approval => ({
    id,
    ...base,
    subjectRef: "s",
    requestedById: "ag",
    requestedAt: base.createdAt,
    status,
    decidedById: null,
    decidedAt: null,
    note: "",
  });

  it("keeps only approval-required recs whose approval is still pending", () => {
    const result = pendingRecommendations(
      [rec("r1", "ap1"), rec("r2", "ap2"), rec("r3", null), rec("r4", "ap1", false)],
      [approval("ap1", "ממתין"), approval("ap2", "אושר")],
    );
    expect(result.map((r) => r.id)).toEqual(["r1", "r3"]);
  });
});
