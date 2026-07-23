// W5-D — module-local deterministic copilot ops: same input ⇒ same output,
// honest envelopes, evidence from real records only.
import { describe, expect, it } from "vitest";
import type { Customer, Enrollment, Lead, Quotation, ServiceTicket } from "@/domain/types";
import {
  quotationsNoResponseOp,
  recurringFaultsOp,
  stuckStudentsOp,
  unansweredCustomersOp,
} from "@/modules/ai-copilot/ops";

const TS = "2026-07-20T08:00:00.000Z";
const meta = { createdAt: TS, updatedAt: TS };

function lead(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    ...meta,
    name: `ליד ${id}`,
    phone: "",
    email: "",
    source: "אתר",
    interest: "רכישת מדפסת",
    status: "חדש",
    ownerId: "u-1",
    followUp: "2026-07-20",
    notes: "",
    history: [],
    ...overrides,
  };
}

function customer(id: string, overrides: Partial<Customer> = {}): Customer {
  return {
    id,
    ...meta,
    name: `לקוח ${id}`,
    type: "פרטי" as Customer["type"],
    phone: "",
    email: "",
    city: "",
    organizationId: null,
    printerSummary: "",
    courseNames: [],
    revenue: 0,
    contactState: "פעיל",
    review: null,
    status: "פעיל" as Customer["status"],
    ...overrides,
  };
}

function ticket(id: string, printer: string): ServiceTicket {
  return {
    id,
    ...meta,
    customerName: "לקוח",
    customerId: null,
    printer,
    issue: `תקלה ${id}`,
    description: "",
    priority: "בינונית",
    status: "חדש",
    openedAt: TS,
    ownerId: "u-1",
    solution: "",
  };
}

describe("copilot local ops (5.9)", () => {
  it("unansweredCustomersOp — deterministic, honest, cites the actual records", () => {
    const customers = [customer("cu-1", { contactState: "ממתין למענה" }), customer("cu-2")];
    const leads = [
      lead("l-1", { followUp: "2026-07-01" }),
      lead("l-2", { followUp: "2026-08-01" }),
    ];
    const a = unansweredCustomersOp(customers, leads, "2026-07-23");
    const b = unansweredCustomersOp(customers, leads, "2026-07-23");
    expect(a.recommendation).toBe(b.recommendation);
    expect(a.recommendation).toContain("לקוח cu-1");
    expect(a.recommendation).toContain("ליד l-1");
    expect(a.recommendation).not.toContain("ליד l-2");
    expect(a.provider).toBe("local-rules");
    expect(a.model).toBeNull();
    expect(a.usage.measured).toBe(false);
    expect(a.confidence.status).toBe("unavailable");
    const cited = a.evidence.map((e) => e.sourceId);
    expect(cited).toContain("cu-1");
    expect(cited).toContain("l-1");
  });

  it("quotationsNoResponseOp — only sent quotations count", () => {
    const q = (id: string, status: Quotation["status"]): Quotation => ({
      id,
      ...meta,
      customerName: "לקוח",
      customerId: null,
      title: `הצעה ${id}`,
      lines: [],
      discountPercent: 0,
      terms: "",
      validUntil: "2026-07-25",
      status,
      ownerId: "u-1",
    });
    const env = quotationsNoResponseOp(
      [q("q-1", "נשלחה"), q("q-2", "אושרה"), q("q-3", "טיוטה")],
      "2026-07-23",
    );
    expect(env.recommendation).toContain("הצעה q-1");
    expect(env.recommendation).not.toContain("הצעה q-2");
    expect(env.evidence).toHaveLength(1);
  });

  it("stuckStudentsOp — empty state is honest, not invented", () => {
    const env = stuckStudentsOp([]);
    expect(env.recommendation).toContain("אין תלמידים תקועים");
    expect(env.evidence).toHaveLength(0);
    expect(env.limitations.length).toBeGreaterThan(0);
  });

  it("stuckStudentsOp — flags blocked/overdue stages", () => {
    const enrollment: Enrollment = {
      id: "en-1",
      ...meta,
      studentId: "s-1",
      studentName: "תמר",
      courseId: "c-1",
      payment: "שולם",
      stages: [
        {
          stageId: "s1",
          status: "חסום / צריך עזרה",
          due: "2026-07-01",
          text: "",
          files: [],
          links: [],
          checklistDone: [],
          notes: [],
          help: "",
          updated: TS,
        },
      ],
    };
    const env = stuckStudentsOp([enrollment]);
    expect(env.recommendation).toContain("תמר");
    expect(env.evidence[0]?.sourceId).toBe("en-1");
  });

  it("recurringFaultsOp — groups by printer, repeats only", () => {
    const env = recurringFaultsOp([ticket("t-1", "X1"), ticket("t-2", "X1"), ticket("t-3", "Y2")]);
    expect(env.recommendation).toContain("X1 — 2 קריאות");
    expect(env.recommendation).not.toContain("Y2 —");
  });
});
