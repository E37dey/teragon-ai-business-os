// Quick-create actions — validated writes through the canonical repositories.
// Every action: zod-validates the full entity, persists via getRepository,
// then invalidates the affected TanStack Query collections so nav badges,
// notifications and global search update immediately. Fully unit-testable
// (no React imports here).
import { z } from "zod";
import type { Customer, Lead, Meeting, Quotation, ServiceTicket, Task } from "@/domain/types";
import {
  customerSchema,
  leadSchema,
  meetingSchema,
  quotationSchema,
  serviceTicketSchema,
  taskSchema,
} from "@/domain/schemas";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID } from "@/repositories/seed";
import { invalidateCollections } from "@/app/data/hooks";
import type { CollectionKey } from "@/repositories";

function nowIso(): string {
  return new Date().toISOString();
}

function stamp(): { createdAt: string; updatedAt: string } {
  const at = nowIso();
  return { createdAt: at, updatedAt: at };
}

async function freshId(collection: CollectionKey, prefix: string): Promise<string> {
  const existing = await getRepository(collection).list();
  return nextId(
    prefix,
    existing.map((e) => e.id),
  );
}

// ---------- input schemas (Hebrew errors, form-facing) ----------

export const leadInputSchema = z.object({
  name: z.string().min(1, "שם הליד הוא שדה חובה"),
  phone: z.string().min(1, "טלפון הוא שדה חובה"),
  email: z.string(),
  source: z.string().min(1, "מקור הוא שדה חובה"),
  interest: z.string().min(1, "תחום עניין הוא שדה חובה"),
  notes: z.string(),
});
export type LeadInput = z.infer<typeof leadInputSchema>;

export const customerInputSchema = z.object({
  name: z.string().min(1, "שם הלקוח הוא שדה חובה"),
  type: z.enum(["פרטי", "עסק", "בית ספר", "ארגון"]),
  phone: z.string().min(1, "טלפון הוא שדה חובה"),
  email: z.string(),
  city: z.string(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const taskInputSchema = z.object({
  title: z.string().min(1, "כותרת המשימה היא שדה חובה"),
  description: z.string(),
  priority: z.enum(["גבוהה", "בינונית", "נמוכה"]),
  due: z.string().min(1, "תאריך יעד הוא שדה חובה"),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const meetingInputSchema = z.object({
  title: z.string().min(1, "כותרת הפגישה היא שדה חובה"),
  scheduledAt: z.string().min(1, "מועד הפגישה הוא שדה חובה"),
  durationMinutes: z.number().positive("משך הפגישה חייב להיות חיובי"),
  location: z.string().min(1, "מיקום הוא שדה חובה"),
  agenda: z.string(),
});
export type MeetingInput = z.infer<typeof meetingInputSchema>;

export const ticketInputSchema = z.object({
  customerName: z.string().min(1, "שם הלקוח הוא שדה חובה"),
  printer: z.string().min(1, "דגם מדפסת הוא שדה חובה"),
  issue: z.string().min(1, "תיאור התקלה הוא שדה חובה"),
  description: z.string(),
  priority: z.enum(["גבוהה", "בינונית", "נמוכה"]),
});
export type TicketInput = z.infer<typeof ticketInputSchema>;

export const quotationInputSchema = z.object({
  customerName: z.string().min(1, "שם הלקוח הוא שדה חובה"),
  title: z.string().min(1, "כותרת ההצעה היא שדה חובה"),
  lineDescription: z.string().min(1, "תיאור השורה הוא שדה חובה"),
  quantity: z.number().positive("כמות חייבת להיות חיובית"),
  unitPrice: z.number().min(0, "מחיר לא יכול להיות שלילי"),
  validUntil: z.string().min(1, "תוקף ההצעה הוא שדה חובה"),
});
export type QuotationInput = z.infer<typeof quotationInputSchema>;

// ---------- actions ----------

export async function createLead(input: LeadInput): Promise<Lead> {
  const id = await freshId("leads", "l");
  const lead = leadSchema.parse({
    id,
    ...stamp(),
    name: input.name,
    phone: input.phone,
    email: input.email,
    source: input.source,
    interest: input.interest,
    status: "חדש",
    ownerId: CEO_USER_ID,
    followUp: nowIso().slice(0, 10),
    notes: input.notes,
    history: [{ date: nowIso().slice(0, 10), text: "נוצר ידנית דרך יצירה מהירה" }],
  } satisfies Lead);
  await getRepository<Lead>("leads").create(lead);
  await invalidateCollections(["leads", "notifications"]);
  return lead;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const id = await freshId("customers", "cu");
  const customer = customerSchema.parse({
    id,
    ...stamp(),
    name: input.name,
    type: input.type,
    phone: input.phone,
    email: input.email,
    city: input.city,
    organizationId: null,
    printerSummary: "",
    courseNames: [],
    revenue: 0,
    contactState: "פעיל",
    review: null,
    status: "פעיל",
  } satisfies Customer);
  await getRepository<Customer>("customers").create(customer);
  await invalidateCollections(["customers"]);
  return customer;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const id = await freshId("tasks", "task");
  const task = taskSchema.parse({
    id,
    ...stamp(),
    title: input.title,
    description: input.description,
    status: "פתוחה",
    priority: input.priority,
    due: input.due,
    ownerId: CEO_USER_ID,
    relatedRef: null,
  } satisfies Task);
  await getRepository<Task>("tasks").create(task);
  await invalidateCollections(["tasks", "notifications"]);
  return task;
}

export async function createMeeting(input: MeetingInput): Promise<Meeting> {
  const id = await freshId("meetings", "m");
  const meeting = meetingSchema.parse({
    id,
    ...stamp(),
    title: input.title,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    location: input.location,
    participantIds: [CEO_USER_ID],
    agenda: input.agenda,
    relatedRef: null,
  } satisfies Meeting);
  await getRepository<Meeting>("meetings").create(meeting);
  await invalidateCollections(["meetings"]);
  return meeting;
}

export async function createTicket(input: TicketInput): Promise<ServiceTicket> {
  const id = await freshId("serviceTickets", "t");
  const ticket = serviceTicketSchema.parse({
    id,
    ...stamp(),
    customerName: input.customerName,
    customerId: null,
    printer: input.printer,
    issue: input.issue,
    description: input.description,
    priority: input.priority,
    status: "חדש",
    openedAt: nowIso().slice(0, 10),
    ownerId: CEO_USER_ID,
    solution: "",
  } satisfies ServiceTicket);
  await getRepository<ServiceTicket>("serviceTickets").create(ticket);
  await invalidateCollections(["serviceTickets", "notifications"]);
  return ticket;
}

export async function createQuotation(input: QuotationInput): Promise<Quotation> {
  const id = await freshId("quotations", "q");
  const quotation = quotationSchema.parse({
    id,
    ...stamp(),
    customerName: input.customerName,
    customerId: null,
    title: input.title,
    lines: [
      {
        id: `${id}-1`,
        description: input.lineDescription,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        productId: null,
      },
    ],
    discountPercent: 0,
    terms: "",
    validUntil: input.validUntil,
    status: "טיוטה",
    ownerId: CEO_USER_ID,
  } satisfies Quotation);
  await getRepository<Quotation>("quotations").create(quotation);
  await invalidateCollections(["quotations", "notifications"]);
  return quotation;
}
