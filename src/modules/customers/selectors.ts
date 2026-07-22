// Wave 3 — Customer-360 pure selectors (module-local, unit tested).
import type {
  Activity,
  Customer,
  MemoryRecord,
  Quotation,
  ServiceTicket,
  Task,
} from "@/domain/types";

export interface CustomerTimelineEntry {
  id: string;
  at: string;
  kind: "פעילות" | "קריאת שירות" | "הצעת מחיר";
  text: string;
}

/** entity refs that belong to this customer (for activity matching). */
export function customerEntityRefs(
  customer: Customer,
  tickets: readonly ServiceTicket[],
  quotations: readonly Quotation[],
): Set<string> {
  const refs = new Set<string>([`customer:${customer.id}`]);
  for (const t of tickets) if (t.customerId === customer.id) refs.add(`ticket:${t.id}`);
  for (const q of quotations) if (q.customerId === customer.id) refs.add(`quotation:${q.id}`);
  return refs;
}

/** merged chronological timeline: activities + ticket openings + quotations, newest first. */
export function customerTimeline(
  customer: Customer,
  activities: readonly Activity[],
  tickets: readonly ServiceTicket[],
  quotations: readonly Quotation[],
): CustomerTimelineEntry[] {
  const refs = customerEntityRefs(customer, tickets, quotations);
  const entries: CustomerTimelineEntry[] = [];
  for (const a of activities) {
    if (a.entityRef !== null && refs.has(a.entityRef)) {
      entries.push({ id: `act-${a.id}`, at: a.at, kind: "פעילות", text: a.text });
    }
  }
  for (const t of tickets) {
    if (t.customerId === customer.id) {
      entries.push({
        id: `tk-${t.id}`,
        at: t.openedAt,
        kind: "קריאת שירות",
        text: `נפתחה קריאה: ${t.issue} (${t.printer}) — ${t.status}`,
      });
    }
  }
  for (const q of quotations) {
    if (q.customerId === customer.id) {
      entries.push({
        id: `qt-${q.id}`,
        at: q.createdAt,
        kind: "הצעת מחיר",
        text: `הצעת מחיר «${q.title}» — ${q.status}`,
      });
    }
  }
  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** memory records that reference the customer (frontmatter.customer, links or text). */
export function memoryForCustomer(
  customer: Customer,
  records: readonly MemoryRecord[],
): MemoryRecord[] {
  return records.filter((m) => {
    if (m.frontmatter["customer"] === customer.name) return true;
    if (m.links.includes(customer.name)) return true;
    return m.markdown.includes(customer.name) || m.title.includes(customer.name);
  });
}

/** open tasks whose relatedRef points at this customer or its entities. */
export function tasksForCustomer(
  customer: Customer,
  tasks: readonly Task[],
  tickets: readonly ServiceTicket[],
  quotations: readonly Quotation[],
): Task[] {
  const refs = customerEntityRefs(customer, tickets, quotations);
  return tasks.filter((t) => t.relatedRef !== null && refs.has(t.relatedRef));
}

export interface CustomerOpenItems {
  openTickets: number;
  openQuotes: number;
  openTasks: number;
}

export function customerOpenItems(
  customer: Customer,
  tickets: readonly ServiceTicket[],
  quotations: readonly Quotation[],
  tasks: readonly Task[],
): CustomerOpenItems {
  const closedTickets = new Set(["טופל", "נסגר"]);
  const openTickets = tickets.filter(
    (t) => t.customerId === customer.id && !closedTickets.has(t.status),
  ).length;
  const openQuotes = quotations.filter(
    (q) => q.customerId === customer.id && (q.status === "טיוטה" || q.status === "נשלחה"),
  ).length;
  const openTasks = tasksForCustomer(customer, tasks, tickets, quotations).filter(
    (t) => t.status === "פתוחה" || t.status === "בתהליך",
  ).length;
  return { openTickets, openQuotes, openTasks };
}
