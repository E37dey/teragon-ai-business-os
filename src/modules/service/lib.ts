// Service module — pure derivations: SLA math, status journey, deterministic
// initial-diagnosis rules, typed repair-action prefixes. Unit-tested.
import type {
  ISODate,
  RepairAction,
  ServiceTicket,
  TicketPriority,
  TicketStatus,
} from "@/domain/types";

export const DIAGNOSIS_DISCLAIMER = "המלצה ראשונית — נדרש אימות מקצועי";
export const RULES_ENGINE_LABEL = "מנוע מקומי מבוסס כללים";

/** SLA target (calendar days to resolution) per priority — module policy. */
export const SLA_TARGET_DAYS: Record<TicketPriority, number> = {
  גבוהה: 2,
  בינונית: 4,
  נמוכה: 7,
};

/** Whole days between two ISO dates (date-only precision, never negative). */
export function daysBetween(fromIso: ISODate, toIso: ISODate): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export type SlaLevel = "תקין" | "בסיכון" | "חריגה";

export interface SlaInfo {
  elapsedDays: number;
  targetDays: number;
  /** elapsed / target (2 decimals) */
  ratio: number;
  level: SlaLevel;
  closed: boolean;
}

const CLOSED_STATUSES: ReadonlySet<TicketStatus> = new Set(["טופל", "נסגר"]);

/**
 * Real elapsed time vs the priority target. For closed tickets the clock stops
 * at updatedAt (the last transition we actually recorded — honest, not ideal;
 * a dedicated closedAt field is an integration request).
 */
export function slaInfo(ticket: ServiceTicket, today: ISODate): SlaInfo {
  const closed = CLOSED_STATUSES.has(ticket.status);
  const end = closed ? ticket.updatedAt.slice(0, 10) : today;
  const elapsedDays = daysBetween(ticket.openedAt, end);
  const targetDays = SLA_TARGET_DAYS[ticket.priority];
  const ratio = Math.round((elapsedDays / targetDays) * 100) / 100;
  const level: SlaLevel = ratio > 1 ? "חריגה" : ratio >= 0.75 ? "בסיכון" : "תקין";
  return { elapsedDays, targetDays, ratio, level, closed };
}

/** Open tickets at risk or breaching, worst first. */
export function slaRiskQueue(
  tickets: readonly ServiceTicket[],
  today: ISODate,
): { ticket: ServiceTicket; sla: SlaInfo }[] {
  return tickets
    .filter((t) => !CLOSED_STATUSES.has(t.status))
    .map((t) => ({ ticket: t, sla: slaInfo(t, today) }))
    .filter((e) => e.sla.level !== "תקין")
    .sort((a, b) => b.sla.ratio - a.sla.ratio);
}

// ── status journey (Stepper) ────────────────────────────────────────────────
export const JOURNEY_STEPS = [
  "נפתחה",
  "אבחון",
  "בתיקון",
  "בדיקת איכות",
  "הושלמה",
  "נסגרה",
] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

/**
 * Map the domain TicketStatus onto the 6-step service journey.
 * "בדיקת איכות" is derived: a ticket at "טופל" moves past it only once a
 * quality-check repair action was recorded (hasQualityCheck).
 */
export function journeyStep(status: TicketStatus, hasQualityCheck: boolean): JourneyStep {
  switch (status) {
    case "חדש":
      return "נפתחה";
    case "בבדיקה":
      return "אבחון";
    case "ממתין ללקוח":
    case "ממתין לחלק":
      return "בתיקון";
    case "טופל":
      return hasQualityCheck ? "הושלמה" : "בדיקת איכות";
    case "נסגר":
      return "נסגרה";
  }
}

/** Allowed next domain statuses from the current one (workbench buttons). */
export function allowedTransitions(status: TicketStatus): TicketStatus[] {
  switch (status) {
    case "חדש":
      return ["בבדיקה"];
    case "בבדיקה":
      return ["ממתין ללקוח", "ממתין לחלק", "טופל"];
    case "ממתין ללקוח":
      return ["בבדיקה", "טופל"];
    case "ממתין לחלק":
      return ["בבדיקה", "טופל"];
    case "טופל":
      return ["נסגר"];
    case "נסגר":
      return [];
  }
}

// ── typed repair-action prefixes (local workaround for missing ticket fields) ─
export type ActionKind = "אבחון" | "חלק" | "בדיקה" | "בדיקת איכות" | "הנחיות ללקוח" | "תיקון";

export const ACTION_KINDS: readonly ActionKind[] = [
  "אבחון",
  "תיקון",
  "חלק",
  "בדיקה",
  "בדיקת איכות",
  "הנחיות ללקוח",
];

export function actionKindOf(description: string): ActionKind | null {
  for (const kind of ACTION_KINDS) {
    if (description.startsWith(`${kind}: `)) return kind;
  }
  return null;
}

export function makeActionDescription(kind: ActionKind, text: string): string {
  return `${kind}: ${text}`;
}

export function hasQualityCheck(actions: readonly RepairAction[], ticketId: string): boolean {
  return actions.some(
    (a) => a.ticketId === ticketId && actionKindOf(a.description) === "בדיקת איכות",
  );
}

export function partsCostTotal(actions: readonly RepairAction[], ticketId: string): number {
  return actions.filter((a) => a.ticketId === ticketId).reduce((sum, a) => sum + a.partsCost, 0);
}

// ── deterministic initial diagnosis (rules, not a model) ────────────────────
export interface DiagnosisSuggestion {
  cause: string;
  checks: string[];
  /** which rule fired — transparency, not an invented confidence */
  rule: string;
}

const DIAGNOSIS_RULES: readonly {
  pattern: RegExp;
  rule: string;
  cause: string;
  checks: string[];
}[] = [
  {
    pattern: /נדבק|מתקלפ|וורפינג|מתנתק/,
    rule: "הידבקות-שכבה-ראשונה",
    cause: "בעיית הידבקות למשטח (First-layer adhesion)",
    checks: ["כיול גובה מיטה (Z-offset)", "ניקוי משטח באלכוהול", "טמפ' מיטה 60-70°", "Brim/Raft"],
  },
  {
    pattern: /סתימ|לא יוצא|clog/i,
    rule: "סתימת-ראש",
    cause: "סתימה בנתיב הפילמנט / Hotend",
    checks: ["Cold pull", "בדיקת גלגל שיניים באקסטרודר", "טמפ' התכה לפי חומר", "החלפת פייה"],
  },
  {
    pattern: /רעש|תנוע|ציר|חגור/,
    rule: "מכניקה-צירים",
    cause: "בעיה מכנית בצירים / חגורות",
    checks: ["מתיחת חגורות", "שימון מסילות", "בדיקת גלגלות", "הידוק ברגים"],
  },
  {
    pattern: /תוכנה|slicer|סלייסר|קורס|פרופיל/i,
    rule: "תוכנה-סלייסר",
    cause: "בעיית תוכנה / פרופיל סלייסר",
    checks: ["עדכון גרסת סלייסר", "שחזור פרופיל ברירת מחדל", "בדיקת קובץ קלט", "קבצי לוג"],
  },
  {
    pattern: /כיול|מידות|דיוק/,
    rule: "כיול-מידות",
    cause: "סטיית כיול (מידות לא מדויקות)",
    checks: ["כיול E-steps", "כיול Flow", 'קוביית בדיקה 20 מ"מ', "בדיקת סטיית צירים"],
  },
];

/**
 * Deterministic keyword rules over issue+description. Same input ⇒ same output.
 * Always presented with DIAGNOSIS_DISCLAIMER — never as a verified diagnosis.
 */
export function suggestDiagnosis(issue: string, description: string): DiagnosisSuggestion {
  const text = `${issue} ${description}`;
  for (const r of DIAGNOSIS_RULES) {
    if (r.pattern.test(text)) return { cause: r.cause, checks: r.checks, rule: r.rule };
  }
  return {
    cause: "לא זוהה דפוס מוכר — נדרש אבחון ידני",
    checks: ["שיחת בירור עם הלקוח", "בקשת תמונות/וידאו", "בדיקה פיזית של המדפסת"],
    rule: "ברירת-מחדל",
  };
}

/** Open-ticket count per technician (ownerId). */
export function technicianLoad(tickets: readonly ServiceTicket[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const t of tickets) {
    if (CLOSED_STATUSES.has(t.status)) continue;
    load.set(t.ownerId, (load.get(t.ownerId) ?? 0) + 1);
  }
  return load;
}

/** Open tickets grouped by priority (for the rail). */
export function openByPriority(tickets: readonly ServiceTicket[]): Record<TicketPriority, number> {
  const out: Record<TicketPriority, number> = { גבוהה: 0, בינונית: 0, נמוכה: 0 };
  for (const t of tickets) {
    if (!CLOSED_STATUSES.has(t.status)) out[t.priority] += 1;
  }
  return out;
}

export function isClosedStatus(status: TicketStatus): boolean {
  return CLOSED_STATUSES.has(status);
}
