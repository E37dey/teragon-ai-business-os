import { describe, expect, it } from "vitest";
import {
  customerOpenItems,
  customerTimeline,
  memoryForCustomer,
  tasksForCustomer,
} from "@/modules/customers/selectors";
import type {
  Activity,
  Customer,
  MemoryRecord,
  Quotation,
  ServiceTicket,
  Task,
} from "@/domain/types";

const base = { createdAt: "2026-07-01T08:00:00.000Z", updatedAt: "2026-07-01T08:00:00.000Z" };

const customer: Customer = {
  id: "cu-1",
  ...base,
  name: "סטודיו דגש",
  type: "עסק",
  phone: "",
  email: "",
  city: "תל אביב",
  organizationId: null,
  printerSummary: "",
  courseNames: [],
  revenue: 1000,
  contactState: "פעיל",
  review: null,
  status: "פעיל",
};

const ticket: ServiceTicket = {
  id: "t-1",
  ...base,
  customerName: "סטודיו דגש",
  customerId: "cu-1",
  printer: "P1S",
  issue: "תקלה",
  description: "",
  priority: "גבוהה",
  status: "בבדיקה",
  openedAt: "2026-07-10",
  ownerId: "u-1",
  solution: "",
};

const quote: Quotation = {
  id: "q-1",
  createdAt: "2026-07-15T08:00:00.000Z",
  updatedAt: "2026-07-15T08:00:00.000Z",
  customerName: "סטודיו דגש",
  customerId: "cu-1",
  title: "ליווי",
  lines: [{ id: "q-1-1", description: "x", quantity: 1, unitPrice: 100, productId: null }],
  discountPercent: 0,
  terms: "",
  validUntil: "2026-08-01",
  status: "נשלחה",
  ownerId: "u-1",
};

const activities: Activity[] = [
  {
    id: "act-1",
    ...base,
    kind: "קריאת שירות",
    text: "עדכון קריאה",
    actorId: "u-1",
    entityRef: "ticket:t-1",
    at: "2026-07-11T09:00:00.000Z",
  },
  {
    id: "act-2",
    ...base,
    kind: "ליד",
    text: "לא קשור",
    actorId: "u-1",
    entityRef: "lead:l-9",
    at: "2026-07-12T09:00:00.000Z",
  },
];

describe("customerTimeline", () => {
  it("merges related activities + tickets + quotations, newest first", () => {
    const t = customerTimeline(customer, activities, [ticket], [quote]);
    expect(t.map((e) => e.id)).toEqual(["qt-q-1", "act-act-1", "tk-t-1"]);
    expect(t.find((e) => e.text.includes("לא קשור"))).toBeUndefined();
  });
});

describe("memoryForCustomer", () => {
  const mem = (id: string, overrides: Partial<MemoryRecord>): MemoryRecord => ({
    id,
    ...base,
    title: "רשומה",
    markdown: "",
    frontmatter: {},
    folder: "",
    tags: [],
    links: [],
    ...overrides,
  });

  it("matches by frontmatter.customer, links or text", () => {
    const records = [
      mem("m1", { frontmatter: { customer: "סטודיו דגש" } }),
      mem("m2", { links: ["סטודיו דגש"] }),
      mem("m3", { markdown: "פגישה עם סטודיו דגש בתל אביב" }),
      mem("m4", { markdown: "לא קשור" }),
    ];
    expect(memoryForCustomer(customer, records).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("tasksForCustomer + customerOpenItems", () => {
  const task: Task = {
    id: "task-1",
    ...base,
    title: "מעקב",
    description: "",
    status: "פתוחה",
    priority: "בינונית",
    due: "2026-07-25",
    ownerId: "u-1",
    relatedRef: "quotation:q-1",
  };

  it("finds tasks pointing at the customer's entities", () => {
    const found = tasksForCustomer(customer, [task], [ticket], [quote]);
    expect(found.map((t) => t.id)).toEqual(["task-1"]);
  });

  it("open items count tickets/quotes/tasks honestly", () => {
    const items = customerOpenItems(customer, [ticket], [quote], [task]);
    expect(items).toEqual({ openTickets: 1, openQuotes: 1, openTasks: 1 });
  });
});
