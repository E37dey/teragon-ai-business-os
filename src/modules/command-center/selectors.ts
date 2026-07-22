// Wave 3 — Command Center pure selectors (module-local, unit tested).
// Every number the screen shows is derived here from repository data.
import type { AIRecommendation, Approval, Lead, Meeting, Quotation, Task } from "@/domain/types";
import { quotationTotal } from "@/domain/selectors";

/** Time-of-day greeting — the canonical identity is always "צחי". */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "בוקר טוב, צחי";
  if (hour >= 12 && hour < 17) return "צהריים טובים, צחי";
  return "ערב טוב, צחי";
}

export interface MonthRevenue {
  /** "YYYY-MM" */
  month: string;
  /** ₪ value of approved quotations created that month */
  approved: number;
  /** ₪ value of open quotations (טיוטה+נשלחה) created that month */
  open: number;
}

/** Revenue trend derived from quotations by creation month (never hardcoded). */
export function revenueByMonth(quotations: readonly Quotation[]): MonthRevenue[] {
  const map = new Map<string, MonthRevenue>();
  for (const q of quotations) {
    const month = q.createdAt.slice(0, 7);
    const bucket = map.get(month) ?? { month, approved: 0, open: 0 };
    const value = quotationTotal(q);
    if (q.status === "אושרה") bucket.approved += value;
    else if (q.status === "טיוטה" || q.status === "נשלחה") bucket.open += value;
    map.set(month, bucket);
  }
  return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

const OPEN_LEAD_STATUSES: ReadonlySet<string> = new Set([
  "חדש",
  "נוצר קשר",
  "קיבל פרטים",
  "ממתין לתשובה",
  "נשלחה הצעה",
  "במשא ומתן",
]);

/** Leads whose follow-up date is due (≤ today) and are still open, oldest first. */
export function followUpQueue(leads: readonly Lead[], todayIso: string): Lead[] {
  return leads
    .filter((l) => OPEN_LEAD_STATUSES.has(l.status) && l.followUp <= todayIso)
    .sort((a, b) => (a.followUp < b.followUp ? -1 : a.followUp > b.followUp ? 1 : 0));
}

export interface TimelineEntry {
  id: string;
  /** "HH:MM" for meetings, null for date-only tasks */
  time: string | null;
  title: string;
  kind: "משימה" | "פגישה";
  priority?: string;
}

/** Today's schedule: open tasks due today + meetings scheduled today, by time. */
export function todayTimeline(
  tasks: readonly Task[],
  meetings: readonly Meeting[],
  todayIso: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const t of tasks) {
    if ((t.status === "פתוחה" || t.status === "בתהליך") && t.due.slice(0, 10) === todayIso) {
      entries.push({ id: t.id, time: null, title: t.title, kind: "משימה", priority: t.priority });
    }
  }
  for (const m of meetings) {
    if (m.scheduledAt.slice(0, 10) === todayIso) {
      const d = new Date(m.scheduledAt);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      entries.push({ id: m.id, time, title: m.title, kind: "פגישה" });
    }
  }
  return entries.sort((a, b) => {
    if (a.time === null && b.time === null) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  });
}

/** Recommendations still awaiting a human decision (approval ממתין or none yet). */
export function pendingRecommendations(
  recs: readonly AIRecommendation[],
  approvals: readonly Approval[],
): AIRecommendation[] {
  const byId = new Map(approvals.map((a) => [a.id, a]));
  return recs.filter((r) => {
    if (!r.approvalRequired) return false;
    if (r.approvalId === null) return true;
    const approval = byId.get(r.approvalId);
    return approval === undefined || approval.status === "ממתין";
  });
}
