// Wave 4 — service module derivations: SLA math, journey mapping, diagnosis rules.
import { describe, expect, it } from "vitest";
import type { RepairAction, ServiceTicket } from "@/domain/types";
import {
  allowedTransitions,
  daysBetween,
  hasQualityCheck,
  journeyStep,
  makeActionDescription,
  actionKindOf,
  openByPriority,
  partsCostTotal,
  slaInfo,
  slaRiskQueue,
  suggestDiagnosis,
  technicianLoad,
} from "@/modules/service/lib";

function ticket(patch: Partial<ServiceTicket>): ServiceTicket {
  return {
    id: "t-x",
    customerName: "בדיקה",
    customerId: null,
    printer: "Bambu Lab A1",
    issue: "תקלה",
    description: "",
    priority: "בינונית",
    status: "חדש",
    openedAt: "2026-07-20",
    ownerId: "u-ran",
    solution: "",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...patch,
  };
}

function action(patch: Partial<RepairAction>): RepairAction {
  return {
    id: "ra-x",
    ticketId: "t-x",
    description: "תיקון: משהו",
    performedById: "u-ran",
    performedAt: "2026-07-21",
    partsCost: 0,
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z",
    ...patch,
  };
}

describe("daysBetween", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysBetween("2026-07-20", "2026-07-22")).toBe(2);
    expect(daysBetween("2026-07-22", "2026-07-20")).toBe(0);
    expect(daysBetween("2026-07-22", "2026-07-22")).toBe(0);
  });
});

describe("slaInfo — real elapsed vs priority target", () => {
  it("open high-priority ticket beyond 2 days is a breach", () => {
    const s = slaInfo(ticket({ priority: "גבוהה", openedAt: "2026-07-19" }), "2026-07-22");
    expect(s.targetDays).toBe(2);
    expect(s.elapsedDays).toBe(3);
    expect(s.level).toBe("חריגה");
  });
  it("ratio >= 0.75 but <= 1 is at-risk", () => {
    const s = slaInfo(ticket({ priority: "נמוכה", openedAt: "2026-07-16" }), "2026-07-22");
    expect(s.targetDays).toBe(7);
    expect(s.elapsedDays).toBe(6);
    expect(s.level).toBe("בסיכון");
  });
  it("fresh ticket is fine", () => {
    const s = slaInfo(ticket({ priority: "בינונית", openedAt: "2026-07-22" }), "2026-07-22");
    expect(s.level).toBe("תקין");
    expect(s.elapsedDays).toBe(0);
  });
  it("closed ticket stops the clock at updatedAt", () => {
    const s = slaInfo(
      ticket({ status: "נסגר", openedAt: "2026-07-01", updatedAt: "2026-07-02T10:00:00.000Z" }),
      "2026-07-22",
    );
    expect(s.closed).toBe(true);
    expect(s.elapsedDays).toBe(1);
    expect(s.level).toBe("תקין");
  });
});

describe("slaRiskQueue", () => {
  it("returns only open at-risk/breaching tickets, worst first", () => {
    const list = [
      ticket({ id: "a", priority: "גבוהה", openedAt: "2026-07-15" }), // breach
      ticket({ id: "b", priority: "בינונית", openedAt: "2026-07-19" }), // risk (3/4)
      ticket({ id: "c", priority: "נמוכה", openedAt: "2026-07-22" }), // fine
      ticket({ id: "d", status: "נסגר", priority: "גבוהה", openedAt: "2026-07-01" }), // closed
    ];
    const q = slaRiskQueue(list, "2026-07-22");
    expect(q.map((e) => e.ticket.id)).toEqual(["a", "b"]);
  });
});

describe("journeyStep — 6-step service journey", () => {
  it("maps the domain statuses", () => {
    expect(journeyStep("חדש", false)).toBe("נפתחה");
    expect(journeyStep("בבדיקה", false)).toBe("אבחון");
    expect(journeyStep("ממתין לחלק", false)).toBe("בתיקון");
    expect(journeyStep("ממתין ללקוח", false)).toBe("בתיקון");
    expect(journeyStep("נסגר", true)).toBe("נסגרה");
  });
  it("quality check gates the הושלמה step", () => {
    expect(journeyStep("טופל", false)).toBe("בדיקת איכות");
    expect(journeyStep("טופל", true)).toBe("הושלמה");
  });
});

describe("allowedTransitions", () => {
  it("closed tickets have no transitions", () => {
    expect(allowedTransitions("נסגר")).toEqual([]);
  });
  it("טופל can only close", () => {
    expect(allowedTransitions("טופל")).toEqual(["נסגר"]);
  });
});

describe("repair-action prefixes", () => {
  it("round-trips kinds", () => {
    const d = makeActionDescription("בדיקת איכות", "הכול תקין");
    expect(actionKindOf(d)).toBe("בדיקת איכות");
    expect(actionKindOf("סתם טקסט")).toBeNull();
  });
  it("hasQualityCheck finds only the right ticket", () => {
    const actions = [
      action({ ticketId: "t-1", description: makeActionDescription("בדיקת איכות", "עבר") }),
      action({ id: "ra-2", ticketId: "t-2", description: makeActionDescription("אבחון", "..") }),
    ];
    expect(hasQualityCheck(actions, "t-1")).toBe(true);
    expect(hasQualityCheck(actions, "t-2")).toBe(false);
  });
  it("partsCostTotal sums per ticket", () => {
    const actions = [
      action({ id: "1", ticketId: "t-1", partsCost: 85 }),
      action({ id: "2", ticketId: "t-1", partsCost: 15 }),
      action({ id: "3", ticketId: "t-2", partsCost: 999 }),
    ];
    expect(partsCostTotal(actions, "t-1")).toBe(100);
  });
});

describe("suggestDiagnosis — deterministic rules", () => {
  it("same input gives same output", () => {
    const a = suggestDiagnosis("שכבה ראשונה לא נדבקת", "מתקלפת מהמשטח");
    const b = suggestDiagnosis("שכבה ראשונה לא נדבקת", "מתקלפת מהמשטח");
    expect(a).toEqual(b);
    expect(a.rule).toBe("הידבקות-שכבה-ראשונה");
  });
  it("clog keywords hit the clog rule", () => {
    expect(suggestDiagnosis("סתימה בראש הדפסה", "").rule).toBe("סתימת-ראש");
  });
  it("unknown text falls back honestly", () => {
    const d = suggestDiagnosis("אבגד", "הוזח");
    expect(d.rule).toBe("ברירת-מחדל");
    expect(d.cause).toContain("נדרש אבחון ידני");
  });
});

describe("technicianLoad / openByPriority", () => {
  it("counts only open tickets", () => {
    const list = [
      ticket({ id: "a", ownerId: "u-ran", status: "חדש", priority: "גבוהה" }),
      ticket({ id: "b", ownerId: "u-ran", status: "בבדיקה", priority: "נמוכה" }),
      ticket({ id: "c", ownerId: "u-oren", status: "נסגר", priority: "גבוהה" }),
    ];
    expect(technicianLoad(list).get("u-ran")).toBe(2);
    expect(technicianLoad(list).has("u-oren")).toBe(false);
    expect(openByPriority(list)).toEqual({ גבוהה: 1, בינונית: 0, נמוכה: 1 });
  });
});
