// deriveNotifications — PURE generator: repository data + `now` ⇒ notification
// records for REAL seed/business conditions. Ids are stable per condition
// (e.g. "ntf-task-overdue-task-1") so the boot sync is idempotent: a refresh
// never duplicates a notification and read-state survives.
//
// Honesty notes:
// - Every notification points at a real entity + route; nothing is invented.
// - "מסמך עומד לפוג": the Document entity has no expiry field, so the honest
//   expiring-document condition is a quotation (a business document) whose
//   validUntil is within the next 7 days — derived, not fabricated.
// - "אוטומציה שנכשלה" appears only when a run really ended in "כישלון"
//   (the current seed has none ⇒ zero notifications of that type).
import type {
  AgentTask,
  AIRecommendation,
  AppNotification,
  Approval,
  AutomationRun,
  Enrollment,
  Lead,
  Quotation,
  ServiceTicket,
  Task,
  TicketPriority,
} from "@/domain/types";
import { isOverdueTask } from "@/domain/selectors";

export interface NotificationSourceData {
  leads: readonly Lead[];
  tasks: readonly Task[];
  quotations: readonly Quotation[];
  tickets: readonly ServiceTicket[];
  aiRecommendations: readonly AIRecommendation[];
  approvals: readonly Approval[];
  enrollments: readonly Enrollment[];
  automationRuns: readonly AutomationRun[];
  agentTasks: readonly AgentTask[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** lead counts as "ללא מענה" after this many days without any history entry */
export const LEAD_NO_REPLY_DAYS = 2;
/** enrollment counts as "ללא התקדמות" after this many days without a stage update */
export const STUDENT_STALLED_DAYS = 7;
/** quotation counts as "עומדת לפוג" within this many days before validUntil */
export const DOCUMENT_EXPIRY_WINDOW_DAYS = 7;
/** service SLA (days until first resolution) per priority */
export const TICKET_SLA_DAYS: Record<TicketPriority, number> = {
  גבוהה: 2,
  בינונית: 5,
  נמוכה: 10,
};

function toMs(iso: string): number {
  return iso.length === 10 ? new Date(`${iso}T23:59:59.999Z`).getTime() : new Date(iso).getTime();
}

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - toMs(iso)) / DAY_MS;
}

function stamp(entityUpdatedAt: string): { createdAt: string; updatedAt: string } {
  return { createdAt: entityUpdatedAt, updatedAt: entityUpdatedAt };
}

/**
 * Derive the full current notification set from real data. Deterministic:
 * same data + same `now` ⇒ identical result (stable ids, stable order).
 */
export function deriveNotifications(data: NotificationSourceData, now: Date): AppNotification[] {
  const out: AppNotification[] = [];

  // 1 — ליד חדש ללא מענה (no activity for > LEAD_NO_REPLY_DAYS days)
  for (const lead of data.leads) {
    if (lead.status !== "חדש") continue;
    const lastActivity =
      lead.history.length > 0
        ? lead.history.reduce(
            (max, h) => (h.date > max ? h.date : max),
            lead.history[0]?.date ?? lead.createdAt,
          )
        : lead.createdAt;
    if (daysSince(lastActivity, now) > LEAD_NO_REPLY_DAYS) {
      out.push({
        id: `ntf-lead-noreply-${lead.id}`,
        category: "מכירות",
        title: `ליד חדש ללא מענה: ${lead.name}`,
        body: `${lead.interest} · ללא פעילות מעל ${LEAD_NO_REPLY_DAYS} ימים`,
        relatedEntity: { type: "lead", id: lead.id, route: "/crm" },
        read: false,
        severity: "אזהרה",
        ownerId: lead.ownerId,
        ...stamp(lead.updatedAt),
      });
    }
  }

  // 2 — משימה באיחור
  for (const task of data.tasks) {
    if (isOverdueTask(task, now)) {
      out.push({
        id: `ntf-task-overdue-${task.id}`,
        category: "משימות",
        title: `משימה באיחור: ${task.title}`,
        body: `תאריך יעד ${task.due} עבר והמשימה עדיין ${task.status}`,
        relatedEntity: { type: "task", id: task.id, route: "/tasks" },
        read: false,
        severity: task.priority === "גבוהה" ? "דחוף" : "אזהרה",
        ownerId: task.ownerId,
        ...stamp(task.updatedAt),
      });
    }
  }

  // 3 — הצעת מחיר ממתינה לאישור (נשלחה ולא הוכרעה)
  for (const q of data.quotations) {
    if (q.status === "נשלחה") {
      out.push({
        id: `ntf-quote-pending-${q.id}`,
        category: "מכירות",
        title: `הצעת מחיר ממתינה לאישור: ${q.title}`,
        body: `${q.customerName} · בתוקף עד ${q.validUntil}`,
        relatedEntity: { type: "quotation", id: q.id, route: "/sales" },
        read: false,
        severity: "מידע",
        ownerId: q.ownerId,
        ...stamp(q.updatedAt),
      });
    }
  }

  // 4 — קריאת שירות חורגת מ-SLA
  for (const t of data.tickets) {
    if (t.status === "טופל" || t.status === "נסגר") continue;
    if (daysSince(t.openedAt, now) > TICKET_SLA_DAYS[t.priority]) {
      out.push({
        id: `ntf-ticket-sla-${t.id}`,
        category: "שירות",
        title: `קריאת שירות חורגת מ-SLA: ${t.customerName}`,
        body: `${t.issue} · עדיפות ${t.priority} · נפתחה ${t.openedAt}`,
        relatedEntity: { type: "serviceTicket", id: t.id, route: "/service" },
        read: false,
        severity: "דחוף",
        ownerId: t.ownerId,
        ...stamp(t.updatedAt),
      });
    }
  }

  // 5 — המלצת AI ממתינה לאישור
  const approvalById = new Map(data.approvals.map((a) => [a.id, a]));
  for (const rec of data.aiRecommendations) {
    if (!rec.approvalRequired) continue;
    const approval = rec.approvalId ? approvalById.get(rec.approvalId) : undefined;
    const pending = approval === undefined || approval.status === "ממתין";
    if (pending) {
      out.push({
        id: `ntf-airec-pending-${rec.id}`,
        category: "סוכני AI",
        title: `המלצת AI ממתינה לאישור: ${rec.title}`,
        body: rec.reason,
        relatedEntity: { type: "aiRecommendation", id: rec.id, route: "/agents" },
        read: false,
        severity: "אזהרה",
        ownerId: null,
        ...stamp(rec.updatedAt),
      });
    }
  }

  // 6 — מסמך (הצעת מחיר) עומד לפוג בתוך חלון של 7 ימים
  for (const q of data.quotations) {
    if (q.status !== "טיוטה" && q.status !== "נשלחה") continue;
    const untilMs = toMs(q.validUntil) - now.getTime();
    if (untilMs > 0 && untilMs <= DOCUMENT_EXPIRY_WINDOW_DAYS * DAY_MS) {
      out.push({
        id: `ntf-quote-expiring-${q.id}`,
        category: "מסמכים",
        title: `הצעת מחיר עומדת לפוג: ${q.title}`,
        body: `${q.customerName} · תוקף עד ${q.validUntil}`,
        relatedEntity: { type: "quotation", id: q.id, route: "/sales" },
        read: false,
        severity: "אזהרה",
        ownerId: q.ownerId,
        ...stamp(q.updatedAt),
      });
    }
  }

  // 7 — תלמיד ללא התקדמות (או חסום)
  for (const en of data.enrollments) {
    if (en.stages.length === 0) continue;
    const allApproved = en.stages.every((s) => s.status === "אושר" || s.status === "לא התחיל");
    const started = en.stages.some((s) => s.status !== "לא התחיל");
    if (!started || allApproved) {
      // never started or everything approved so far — nothing stalled to report
      continue;
    }
    const blocked = en.stages.some((s) => s.status === "חסום / צריך עזרה");
    const lastUpdate = en.stages.reduce(
      (max, s) => (s.updated > max ? s.updated : max),
      en.stages[0]?.updated ?? en.updatedAt,
    );
    const stalled = daysSince(lastUpdate, now) > STUDENT_STALLED_DAYS;
    if (blocked || stalled) {
      out.push({
        id: `ntf-student-stalled-${en.id}`,
        category: "למידה",
        title: blocked
          ? `תלמיד/ה חסום/ה וזקוק/ה לעזרה: ${en.studentName}`
          : `תלמיד/ה ללא התקדמות: ${en.studentName}`,
        body: blocked
          ? "שלב מסומן 'חסום / צריך עזרה' — נדרשת התערבות מדריך"
          : `אין עדכון שלב מאז ${lastUpdate}`,
        relatedEntity: { type: "enrollment", id: en.id, route: "/courses" },
        read: false,
        severity: blocked ? "דחוף" : "אזהרה",
        ownerId: null,
        ...stamp(en.updatedAt),
      });
    }
  }

  // 8 — אוטומציה שנכשלה
  for (const run of data.automationRuns) {
    if (run.outcome === "כישלון") {
      out.push({
        id: `ntf-automation-failed-${run.id}`,
        category: "אוטומציות",
        title: "אוטומציה נכשלה",
        body: `ריצה ${run.id} הסתיימה בכישלון (הופעלה על ידי ${run.triggeredBy})`,
        relatedEntity: { type: "automationRun", id: run.id, route: "/automations" },
        read: false,
        severity: "דחוף",
        ownerId: null,
        ...stamp(run.updatedAt),
      });
    }
  }

  // deterministic order: severity (דחוף → מידע), then id
  const sevOrder: Record<AppNotification["severity"], number> = { דחוף: 0, אזהרה: 1, מידע: 2 };
  out.sort((a, b) => {
    const s = sevOrder[a.severity] - sevOrder[b.severity];
    if (s !== 0) return s;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return out;
}
