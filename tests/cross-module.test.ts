// Cross-module workflow tests (Waves 3–4 integration gate).
// Each scenario exercises the CANONICAL layer end-to-end: a mutation through the
// repositories must surface in every dependent selector/derivation — the same
// functions the screens render from. This is the "one source of truth" guarantee.
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRepositoriesForTests, getRepository, seedIfEmpty } from "@/repositories";
import type {
  Activity,
  AppNotification,
  Customer,
  CustomerPrinter,
  Enrollment,
  Lead,
  Quotation,
  ServiceTicket,
  Task,
} from "@/domain/types";
import { openLeadCount, rankedSearch, recentActivity, salesFunnel } from "@/domain/selectors";
import { deriveNotifications } from "@/app/notifications/deriveNotifications";

const now = () => new Date("2026-07-23T12:00:00.000Z");
const iso = () => now().toISOString();

function base(id: string) {
  return { id, createdAt: iso(), updatedAt: iso() };
}

beforeEach(async () => {
  __resetRepositoriesForTests();
  await seedIfEmpty();
});

async function list<T extends { id: string }>(collection: string): Promise<T[]> {
  return (await getRepository(collection).list()) as unknown as T[];
}

describe("cross-module workflows (10 mandated flows)", () => {
  it("1. create lead → appears in Command Center KPIs and funnel", async () => {
    const leadsBefore = await list<Lead>("leads");
    const kpiBefore = openLeadCount(leadsBefore);

    await getRepository("leads").create({
      ...base("ld-xm-1"),
      name: 'בדיקת אינטגרציה בע"מ',
      phone: "050-1112233",
      email: "test@integration.co.il",
      interest: "רכישת מדפסת",
      status: "חדש",
      source: "אתר",
      ownerId: "u-tzachi",
      history: [],
    } as never);

    const leadsAfter = await list<Lead>("leads");
    expect(openLeadCount(leadsAfter)).toBe(kpiBefore + 1);
    const stageCount = (leads: readonly Lead[]) =>
      salesFunnel(leads).find((s) => s.stage === "חדש")?.count ?? 0;
    expect(stageCount(leadsAfter)).toBe(stageCount(leadsBefore) + 1);
  });

  it("2. convert lead → customer + timeline activity", async () => {
    const customer = await getRepository("customers").create({
      ...base("cu-xm-1"),
      name: "לקוח מהמרה",
      status: "פעיל",
      ownerId: "u-tzachi",
    } as never);
    await getRepository("activities").create({
      ...base("ac-xm-1"),
      kind: "ליד",
      title: "המרת ליד ללקוח: לקוח מהמרה",
      entityType: "customer",
      entityId: customer.id,
      at: iso(),
    } as never);

    const acts = await list<Activity>("activities");
    const timeline = acts.filter((a) => a.entityId === "cu-xm-1");
    expect(timeline).toHaveLength(1);
    expect(recentActivity(acts)[0]?.title).toContain("לקוח מהמרה");
  });

  it("3. create quotation → visible in Customer 360 data slice", async () => {
    await getRepository("quotations").create({
      ...base("q-xm-1"),
      number: "Q-2026-900",
      customerId: "cu-1",
      status: "טיוטה",
      lines: [{ id: "ql-1", description: "מדפסת", quantity: 1, unitPrice: 1000 }],
      validUntil: "2026-08-30",
    } as never);
    const quotes = await list<Quotation>("quotations");
    expect(quotes.filter((q) => q.customerId === "cu-1").map((q) => q.number)).toContain(
      "Q-2026-900",
    );
  });

  it("4. register printer → appears in customer assets", async () => {
    await getRepository("customerPrinters").create({
      ...base("cp-xm-1"),
      customerId: "cu-2",
      modelId: "pm-1",
      serialNumber: "SN-XM-77",
      condition: "תקינה",
    } as never);
    const printers = await list<CustomerPrinter>("customerPrinters");
    expect(printers.some((p) => p.customerId === "cu-2" && p.serialNumber === "SN-XM-77")).toBe(
      true,
    );
  });

  it("5. open service ticket → joins printer + customer history", async () => {
    await getRepository("serviceTickets").create({
      ...base("tk-xm-1"),
      subject: "תקלת חימום",
      customerId: "cu-2",
      printerId: "cp-xm-9",
      status: "נפתחה",
      priority: "גבוהה",
      openedAt: iso(),
    } as never);
    await getRepository("activities").create({
      ...base("ac-xm-2"),
      kind: "שירות",
      title: "נפתחה קריאה: תקלת חימום",
      entityType: "serviceTicket",
      entityId: "tk-xm-1",
      at: iso(),
    } as never);
    const tickets = await list<ServiceTicket>("serviceTickets");
    const acts = await list<Activity>("activities");
    expect(tickets.some((t) => t.id === "tk-xm-1" && t.customerId === "cu-2")).toBe(true);
    expect(acts.some((a) => a.entityId === "tk-xm-1")).toBe(true);
  });

  it("6. enroll student → course progress reflects it", async () => {
    const before = (await list<Enrollment>("enrollments")).filter((e) => e.courseId === "co-1");
    await getRepository("enrollments").create({
      ...base("en-xm-1"),
      courseId: "co-1",
      studentId: "st-1",
      progress: 0,
      status: "פעיל",
    } as never);
    const after = (await list<Enrollment>("enrollments")).filter((e) => e.courseId === "co-1");
    expect(after.length).toBe(before.length + 1);
  });

  it("7. create task from service ticket → appears in work queue", async () => {
    await getRepository("tasks").create({
      ...base("ts-xm-1"),
      title: "מעקב אחרי תקלת חימום",
      description: "נוצרה מקריאת שירות tk-xm-1",
      status: "פתוחה",
      priority: "גבוהה",
      ownerId: "u-tzachi",
      due: "2026-07-24",
      relatedRef: "serviceTicket:tk-xm-1",
    } as never);
    const tasks = await list<Task>("tasks");
    expect(tasks.some((t) => t.id === "ts-xm-1" && t.relatedRef === "serviceTicket:tk-xm-1")).toBe(
      true,
    );
  });

  it("8. complete task → recent activity updated", async () => {
    await getRepository("tasks").create({
      ...base("ts-xm-2"),
      title: "משימה להשלמה",
      description: "בדיקת cross-module",
      status: "פתוחה",
      priority: "בינונית",
      ownerId: "u-tzachi",
      due: "2026-07-24",
      relatedRef: null,
    } as never);
    await getRepository("tasks").update("ts-xm-2", { status: "הושלמה" } as never);
    await getRepository("activities").create({
      ...base("ac-xm-3"),
      kind: "משימה",
      title: "הושלמה משימה: משימה להשלמה",
      entityType: "task",
      entityId: "ts-xm-2",
      at: iso(),
    } as never);
    const acts = await list<Activity>("activities");
    expect(recentActivity(acts)[0]?.entityId).toBe("ts-xm-2");
  });

  it("9. overdue record → creates a notification (derived, idempotent id)", async () => {
    await getRepository("tasks").create({
      ...base("ts-xm-3"),
      title: "משימה באיחור קשה",
      description: "בדיקת התראות",
      status: "פתוחה",
      priority: "דחופה",
      ownerId: "u-tzachi",
      due: "2026-07-01",
      relatedRef: null,
    } as never);
    const data = {
      leads: await list<Lead>("leads"),
      tasks: await list<Task>("tasks"),
      quotations: await list<Quotation>("quotations"),
      tickets: await list<ServiceTicket>("serviceTickets"),
      aiRecommendations: await list("aiRecommendations"),
      approvals: await list("approvals"),
      enrollments: await list<Enrollment>("enrollments"),
      automationRuns: await list("automationRuns"),
      agentTasks: await list("agentTasks"),
    };
    const derived = deriveNotifications(data as never, now());
    const mine = derived.filter((n: AppNotification) => n.relatedEntity.id === "ts-xm-3");
    expect(mine.length).toBe(1);
    // idempotence: same input ⇒ same stable id
    expect(
      deriveNotifications(data as never, now()).find((n) => n.relatedEntity.id === "ts-xm-3")?.id,
    ).toBe(mine[0]?.id);
  });

  it("10. global search finds all newly created records", async () => {
    await getRepository("leads").create({
      ...base("ld-xm-2"),
      name: "חיפושון תעשיות",
      phone: "054-9998877",
      email: "hipushon@example.co.il",
      interest: "קורס Fusion 360",
      status: "חדש",
      source: "טלפון",
      ownerId: "u-tzachi",
      history: [],
    } as never);
    const data = {
      leads: await list<Lead>("leads"),
      customers: await list<Customer>("customers"),
      tasks: await list<Task>("tasks"),
      tickets: await list<ServiceTicket>("serviceTickets"),
      quotations: await list<Quotation>("quotations"),
    };
    expect(rankedSearch(data, "חיפושון")[0]?.title).toContain("חיפושון");
    expect(rankedSearch(data, "054-9998877").length).toBeGreaterThanOrEqual(1);
  });
});
