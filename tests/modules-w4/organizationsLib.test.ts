// Wave 4 — organizations module: org↔customer linkage, open items, engagement.
import { describe, expect, it } from "vitest";
import type { Customer, Organization, Quotation, ServiceTicket, Task } from "@/domain/types";
import { orgCustomers, orgEngagement, orgOpenItems } from "@/modules/organizations/lib";

const ORG: Organization = {
  id: "org-x",
  name: "ארגון בדיקה",
  type: "בית ספר",
  phone: "",
  email: "",
  city: "",
  notes: "",
  status: "פעיל",
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-07-01T08:00:00.000Z",
};

function customer(patch: Partial<Customer>): Customer {
  return {
    id: "cu-x",
    name: "לקוח",
    type: "בית ספר",
    phone: "",
    email: "",
    city: "",
    organizationId: null,
    printerSummary: "",
    courseNames: [],
    revenue: 0,
    contactState: "פעיל",
    review: null,
    status: "פעיל",
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
    ...patch,
  };
}

describe("orgCustomers", () => {
  it("links by organizationId or exact name", () => {
    const list = [
      customer({ id: "a", organizationId: "org-x" }),
      customer({ id: "b", name: "ארגון בדיקה" }),
      customer({ id: "c" }),
    ];
    expect(orgCustomers(ORG, list).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("orgOpenItems", () => {
  const customers = [customer({ id: "a", organizationId: "org-x" })];
  const ticket = (patch: Partial<ServiceTicket>): ServiceTicket => ({
    id: "t-x",
    customerName: "לקוח",
    customerId: "a",
    printer: "",
    issue: "",
    description: "",
    priority: "נמוכה",
    status: "חדש",
    openedAt: "2026-07-20",
    ownerId: "u-ran",
    solution: "",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...patch,
  });
  const quote = (patch: Partial<Quotation>): Quotation => ({
    id: "q-x",
    customerName: "לקוח",
    customerId: "a",
    title: "הצעה",
    lines: [],
    discountPercent: 0,
    terms: "",
    validUntil: "2026-08-01",
    status: "נשלחה",
    ownerId: "u-maya",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...patch,
  });
  const t = (patch: Partial<Task>): Task => ({
    id: "task-x",
    title: "משימה",
    description: "",
    status: "פתוחה",
    priority: "נמוכה",
    due: "2026-07-25",
    ownerId: "u-maya",
    relatedRef: "customer:a",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    ...patch,
  });

  it("counts open tickets, related open tasks and open quotations", () => {
    const items = orgOpenItems(
      ORG,
      customers,
      [ticket({}), ticket({ id: "t2", status: "נסגר" })],
      [t({}), t({ id: "task2", status: "הושלמה" }), t({ id: "task3", relatedRef: null })],
      [quote({}), quote({ id: "q2", status: "אושרה" })],
    );
    expect(items.tickets).toHaveLength(1);
    expect(items.tasks).toHaveLength(1);
    expect(items.quotations).toHaveLength(1);
    expect(items.total).toBe(3);
  });
});

describe("orgEngagement", () => {
  it("sums members, printers and revenue", () => {
    const customers = [
      customer({ id: "a", organizationId: "org-x", revenue: 1000 }),
      customer({ id: "b", organizationId: "org-x", revenue: 500 }),
      customer({ id: "c", revenue: 999 }),
    ];
    const printers = [
      {
        id: "cp-1",
        customerId: "a",
        printerModelId: "pm-1",
        serialNumber: "SN",
        purchasedAt: "2026-01-01",
        underWarranty: true,
        notes: "",
        createdAt: "2026-01-01T08:00:00.000Z",
        updatedAt: "2026-01-01T08:00:00.000Z",
      },
    ];
    const e = orgEngagement(ORG, customers, printers, [], [], [], []);
    expect(e.customers).toBe(2);
    expect(e.printers).toBe(1);
    expect(e.revenue).toBe(1500);
    expect(e.openItems).toBe(0);
  });
});
