// Organizations module — pure derivations: org↔customer linkage, open items,
// engagement summary, department grouping from contact roles. Unit-tested.
import type {
  Contact,
  Customer,
  CustomerPrinter,
  Document,
  Enrollment,
  Meeting,
  Organization,
  Quotation,
  ServiceTicket,
  SupportRequest,
  Task,
} from "@/domain/types";

/** Customers that belong to an organization (by organizationId or exact name). */
export function orgCustomers(org: Organization, customers: readonly Customer[]): Customer[] {
  return customers.filter((c) => c.organizationId === org.id || c.name === org.name);
}

const OPEN_TICKET: ReadonlySet<string> = new Set(["חדש", "בבדיקה", "ממתין ללקוח", "ממתין לחלק"]);
const OPEN_TASK: ReadonlySet<string> = new Set(["פתוחה", "בתהליך"]);
const OPEN_QUOTE: ReadonlySet<string> = new Set(["טיוטה", "נשלחה"]);

export interface OrgOpenItems {
  tickets: ServiceTicket[];
  tasks: Task[];
  quotations: Quotation[];
  total: number;
}

/** Everything currently open for the organization's customers. */
export function orgOpenItems(
  org: Organization,
  customers: readonly Customer[],
  tickets: readonly ServiceTicket[],
  tasks: readonly Task[],
  quotations: readonly Quotation[],
): OrgOpenItems {
  const ids = new Set(orgCustomers(org, customers).map((c) => c.id));
  const names = new Set(orgCustomers(org, customers).map((c) => c.name));
  const t = tickets.filter(
    (x) =>
      OPEN_TICKET.has(x.status) &&
      (x.customerId ? ids.has(x.customerId) : names.has(x.customerName)),
  );
  const openTasks = tasks.filter((x) => {
    if (!OPEN_TASK.has(x.status) || !x.relatedRef) return false;
    const ref = x.relatedRef;
    return [...ids].some((id) => ref.endsWith(`:${id}`));
  });
  const q = quotations.filter(
    (x) =>
      OPEN_QUOTE.has(x.status) &&
      ((x.customerId && ids.has(x.customerId)) || names.has(x.customerName)),
  );
  return {
    tickets: t,
    tasks: openTasks,
    quotations: q,
    total: t.length + openTasks.length + q.length,
  };
}

export interface OrgEngagement {
  org: Organization;
  customers: number;
  printers: number;
  enrollments: number;
  openItems: number;
  revenue: number;
}

export function orgEngagement(
  org: Organization,
  customers: readonly Customer[],
  printers: readonly CustomerPrinter[],
  enrollments: readonly Enrollment[],
  tickets: readonly ServiceTicket[],
  tasks: readonly Task[],
  quotations: readonly Quotation[],
): OrgEngagement {
  const members = orgCustomers(org, customers);
  const ids = new Set(members.map((c) => c.id));
  const printerCount = printers.filter((p) => ids.has(p.customerId)).length;
  // enrollments are linked to students, not customers — count by name match (module-local best effort)
  const names = new Set(members.map((c) => c.name));
  const enrollCount = enrollments.filter((e) => names.has(e.studentName)).length;
  const revenue = members.reduce((sum, c) => sum + c.revenue, 0);
  return {
    org,
    customers: members.length,
    printers: printerCount,
    enrollments: enrollCount,
    openItems: orgOpenItems(org, customers, tickets, tasks, quotations).total,
    revenue,
  };
}

/** Contacts of the org's customers, grouped by their role field ("departments"). */
export function contactsByDepartment(
  org: Organization,
  customers: readonly Customer[],
  contacts: readonly Contact[],
): Map<string, Contact[]> {
  const ids = new Set(orgCustomers(org, customers).map((c) => c.id));
  const grouped = new Map<string, Contact[]>();
  for (const c of contacts) {
    if (!ids.has(c.customerId)) continue;
    const dept = c.role.trim() || "כללי";
    const list = grouped.get(dept) ?? [];
    list.push(c);
    grouped.set(dept, list);
  }
  return grouped;
}

/** Documents visible for the org (course docs of enrolled students are out of scope). */
export function orgDocuments(
  org: Organization,
  customers: readonly Customer[],
  documents: readonly Document[],
): Document[] {
  void org;
  void customers;
  // Documents have no org linkage in the domain — only generally-visible documents
  // are shown (integration request: add relatedRef to Document).
  return documents.filter((d) => d.visible);
}

/** Support requests are user-scoped in the domain — org linkage is an integration request. */
export function orgSupportAgreementNote(): string {
  return "הסכמי תמיכה ברמת ארגון אינם קיימים עדיין בדומיין — נדרשת הרחבת SupportRequest (בקשת אינטגרציה W4).";
}

/** Meetings related to the org's customers. */
export function orgMeetings(
  org: Organization,
  customers: readonly Customer[],
  meetings: readonly Meeting[],
): Meeting[] {
  const ids = new Set(orgCustomers(org, customers).map((c) => c.id));
  return meetings.filter((m) => {
    if (!m.relatedRef) return false;
    return [...ids].some((id) => m.relatedRef?.endsWith(`:${id}`));
  });
}

export const DEMO_ORG_NAME = "בית ספר שבילי העמק";

/** SupportRequest open check (shared with rail counts). */
export function isOpenSupport(sr: SupportRequest): boolean {
  return sr.status !== "נסגרה";
}
