// Pure dashboard KPI selectors — the no-hardcoded-KPI guarantee: every number the
// dashboard shows is derived here from repository data. No constants, no Math.random.
import type {
  Approval,
  Automation,
  AutomationRun,
  Customer,
  Enrollment,
  Lead,
  LeadStatus,
  Quotation,
  ServiceTicket,
  TicketPriority,
} from "../types";
import { LEAD_FUNNEL_ORDER } from "../types";

// ---------- leads ----------

export function leadsByStage(leads: readonly Lead[]): Record<LeadStatus, number> {
  const counts = {} as Record<LeadStatus, number>;
  for (const stage of [...LEAD_FUNNEL_ORDER, "לא רלוונטי" as const]) counts[stage] = 0;
  for (const lead of leads) counts[lead.status] = (counts[lead.status] ?? 0) + 1;
  return counts;
}

/** leads that are neither closed-won nor irrelevant */
export function openLeadCount(leads: readonly Lead[]): number {
  return leads.filter((l) => l.status !== "נסגר כלקוח" && l.status !== "לא רלוונטי").length;
}

// ---------- tickets ----------

const CLOSED_TICKET_STATUSES: ReadonlySet<string> = new Set(["טופל", "נסגר"]);

export function openTickets(tickets: readonly ServiceTicket[]): ServiceTicket[] {
  return tickets.filter((t) => !CLOSED_TICKET_STATUSES.has(t.status));
}

export function openTicketsByPriority(
  tickets: readonly ServiceTicket[],
): Record<TicketPriority, number> {
  const counts: Record<TicketPriority, number> = { גבוהה: 0, בינונית: 0, נמוכה: 0 };
  for (const t of openTickets(tickets)) counts[t.priority] += 1;
  return counts;
}

// ---------- quotations / revenue ----------

/** subtotal of a quotation's lines before discount */
export function quotationSubtotal(q: Quotation): number {
  return q.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

/** total after discount */
export function quotationTotal(q: Quotation): number {
  return Math.round(quotationSubtotal(q) * (1 - q.discountPercent / 100));
}

export interface RevenuePipeline {
  /** sum of open quotations (טיוטה + נשלחה) after discount */
  openValue: number;
  /** sum of approved quotations after discount */
  approvedValue: number;
  openCount: number;
  approvedCount: number;
  byStatus: Record<string, { count: number; value: number }>;
}

export function revenuePipeline(quotations: readonly Quotation[]): RevenuePipeline {
  const byStatus: Record<string, { count: number; value: number }> = {};
  let openValue = 0;
  let approvedValue = 0;
  let openCount = 0;
  let approvedCount = 0;
  for (const q of quotations) {
    const value = quotationTotal(q);
    const bucket = (byStatus[q.status] ??= { count: 0, value: 0 });
    bucket.count += 1;
    bucket.value += value;
    if (q.status === "טיוטה" || q.status === "נשלחה") {
      openValue += value;
      openCount += 1;
    } else if (q.status === "אושרה") {
      approvedValue += value;
      approvedCount += 1;
    }
  }
  return { openValue, approvedValue, openCount, approvedCount, byStatus };
}

/** cumulative customer revenue (₪) */
export function totalRevenue(customers: readonly Customer[]): number {
  return customers.reduce((sum, c) => sum + c.revenue, 0);
}

// ---------- learning ----------

export interface CourseCompletion {
  /** stage-progress records across all enrollments with stages */
  totalStages: number;
  approvedStages: number;
  /** 0-100, null when there is nothing to measure (never invented) */
  completionPercent: number | null;
  blockedStudents: number;
  awaitingInstructor: number;
}

export function courseCompletion(enrollments: readonly Enrollment[]): CourseCompletion {
  let totalStages = 0;
  let approvedStages = 0;
  let blockedStudents = 0;
  let awaitingInstructor = 0;
  for (const en of enrollments) {
    totalStages += en.stages.length;
    for (const s of en.stages) {
      if (s.status === "אושר") approvedStages += 1;
      if (s.status === "ממתין לאישור מדריך" || s.status === "הוגש לבדיקה") awaitingInstructor += 1;
    }
    if (en.stages.some((s) => s.status === "חסום / צריך עזרה")) blockedStudents += 1;
  }
  return {
    totalStages,
    approvedStages,
    completionPercent: totalStages === 0 ? null : Math.round((approvedStages / totalStages) * 100),
    blockedStudents,
    awaitingInstructor,
  };
}

// ---------- governance / automations ----------

export function pendingApprovals(approvals: readonly Approval[]): Approval[] {
  return approvals.filter((a) => a.status === "ממתין");
}

export interface AutomationSuccess {
  totalRuns: number;
  successfulRuns: number;
  /** 0-100, null when no runs recorded ("טרם נמדד") */
  successPercent: number | null;
  enabledAutomations: number;
}

export function automationSuccessRate(
  automations: readonly Automation[],
  runs: readonly AutomationRun[],
): AutomationSuccess {
  const finished = runs.filter((r) => r.outcome !== null);
  const successful = finished.filter((r) => r.outcome === "הצלחה").length;
  return {
    totalRuns: finished.length,
    successfulRuns: successful,
    successPercent: finished.length === 0 ? null : Math.round((successful / finished.length) * 100),
    enabledAutomations: automations.filter((a) => a.enabled).length,
  };
}

// ---------- composite ----------

export interface DashboardKpis {
  leadsByStage: Record<LeadStatus, number>;
  openLeads: number;
  openTicketsByPriority: Record<TicketPriority, number>;
  openTicketCount: number;
  pipeline: RevenuePipeline;
  totalRevenue: number;
  courseCompletion: CourseCompletion;
  pendingApprovalCount: number;
}

export function dashboardKpis(input: {
  leads: readonly Lead[];
  tickets: readonly ServiceTicket[];
  quotations: readonly Quotation[];
  customers: readonly Customer[];
  enrollments: readonly Enrollment[];
  approvals: readonly Approval[];
}): DashboardKpis {
  const open = openTickets(input.tickets);
  return {
    leadsByStage: leadsByStage(input.leads),
    openLeads: openLeadCount(input.leads),
    openTicketsByPriority: openTicketsByPriority(input.tickets),
    openTicketCount: open.length,
    pipeline: revenuePipeline(input.quotations),
    totalRevenue: totalRevenue(input.customers),
    courseCompletion: courseCompletion(input.enrollments),
    pendingApprovalCount: pendingApprovals(input.approvals).length,
  };
}
