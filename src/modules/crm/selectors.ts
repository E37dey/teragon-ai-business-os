// Wave 3 — CRM pure selectors + filter model (module-local, unit tested).
import type { Lead, LeadStatus } from "@/domain/types";

export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = [
  "חדש",
  "נוצר קשר",
  "קיבל פרטים",
  "ממתין לתשובה",
  "נשלחה הצעה",
  "במשא ומתן",
];

const OPEN_SET: ReadonlySet<string> = new Set(OPEN_LEAD_STATUSES);

export interface LeadFilters {
  status: LeadStatus | "הכול";
  ownerId: string | "הכול";
  source: string | "הכול";
  text: string;
}

export const EMPTY_FILTERS: LeadFilters = {
  status: "הכול",
  ownerId: "הכול",
  source: "הכול",
  text: "",
};

/** Apply the CRM filter model to the raw leads collection (pure). */
export function filterLeads(leads: readonly Lead[], f: LeadFilters): Lead[] {
  const text = f.text.trim();
  return leads.filter((l) => {
    if (f.status !== "הכול" && l.status !== f.status) return false;
    if (f.ownerId !== "הכול" && l.ownerId !== f.ownerId) return false;
    if (f.source !== "הכול" && l.source !== f.source) return false;
    if (text) {
      const hay = `${l.name} ${l.phone} ${l.email} ${l.interest} ${l.notes}`;
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

/** decided-cohort conversion: won / (won + irrelevant), null when nothing decided. */
export function conversionRate(leads: readonly Lead[]): number | null {
  const won = leads.filter((l) => l.status === "נסגר כלקוח").length;
  const lost = leads.filter((l) => l.status === "לא רלוונטי").length;
  const decided = won + lost;
  return decided === 0 ? null : Math.round((won / decided) * 100);
}

/** leads created within the last 7 days (inclusive of today). */
export function newThisWeek(leads: readonly Lead[], todayIso: string): number {
  const from = new Date(`${todayIso}T00:00:00`);
  from.setDate(from.getDate() - 6);
  const fromIso = from.toISOString().slice(0, 10);
  return leads.filter((l) => l.createdAt.slice(0, 10) >= fromIso).length;
}

/** open leads in advanced stages, most advanced first — the "hottest" list. */
export function hottestLeads(leads: readonly Lead[], limit = 5): Lead[] {
  const rank: Record<string, number> = {
    "במשא ומתן": 0,
    "נשלחה הצעה": 1,
    "ממתין לתשובה": 2,
    "קיבל פרטים": 3,
  };
  return leads
    .filter((l) => l.status in rank)
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
    .slice(0, limit);
}

export interface AgingLead {
  lead: Lead;
  daysOverdue: number;
}

/** open leads whose follow-up date already passed, most overdue first. */
export function agingAlerts(leads: readonly Lead[], todayIso: string): AgingLead[] {
  const base = new Date(`${todayIso}T00:00:00`).getTime();
  return leads
    .filter((l) => OPEN_SET.has(l.status) && l.followUp < todayIso)
    .map((lead) => ({
      lead,
      daysOverdue: Math.round(
        (base - new Date(`${lead.followUp}T00:00:00`).getTime()) / 86_400_000,
      ),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** distinct lead sources present in the data (for the filter select). */
export function leadSources(leads: readonly Lead[]): string[] {
  return [...new Set(leads.map((l) => l.source))].sort();
}
