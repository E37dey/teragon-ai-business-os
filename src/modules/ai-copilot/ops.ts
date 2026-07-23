// W5-D — module-local deterministic Copilot operations (Phase 5.9).
// These cover mapped commands the LocalRulesProvider does not implement yet
// (src/ai is not W5-D territory). Every op is a pure function over real
// records and produces a fully honest EnvelopeV2: provider "local-rules",
// model null, usage unmeasured, confidence "טרם נמדד", limitations disclosed.
// Migration note: docs/integration-requests-w5d.md lists which ops should
// move into LocalRulesProvider proper.
import type {
  Course,
  Customer,
  Enrollment,
  ISODate,
  Lead,
  Quotation,
  ServiceTicket,
} from "@/domain/types";
import type { AIResponseEnvelopeV2, EvidenceItem } from "@/domain/ai/envelope";
import { unavailableConfidence } from "@/domain/ai/envelope";

export interface LocalOpDeps {
  now?: () => ISODate;
  idFactory?: (n: number) => string;
}

let seq = 0;

const MODULE_LIMITATIONS = [
  "מנוע כללים מקומי ודטרמיניסטי — לא מודל שפה; אותו קלט מחזיר תמיד אותו פלט",
  "פעולה מקומית של מודול ה-Copilot — מועמדת למעבר ל-LocalRulesProvider (ראו integration-requests-w5d)",
];

function makeEnvelope(
  operation: string,
  fields: {
    recommendation: string;
    reason: string;
    evidence: EvidenceItem[];
    nextStep: string;
    limitations?: string[];
    confidenceMethod: string;
    confidenceSignals?: string[];
    approvalRequired?: boolean;
  },
  deps: LocalOpDeps,
): AIResponseEnvelopeV2 {
  seq += 1;
  const id = (deps.idFactory ?? ((n: number) => `copilot-env-${n}`))(seq);
  const createdAt = (deps.now ?? (() => new Date().toISOString()))();
  return {
    id,
    requestId: `${id}-req`,
    correlationId: `${id}-corr`,
    provider: "local-rules",
    model: null,
    createdAt,
    operation,
    recommendation: fields.recommendation,
    reason: fields.reason,
    evidence: fields.evidence,
    confidence: unavailableConfidence(fields.confidenceMethod, fields.confidenceSignals ?? []),
    nextStep: fields.nextStep,
    limitations: [...MODULE_LIMITATIONS, ...(fields.limitations ?? [])],
    approval: fields.approvalRequired
      ? { required: true, state: "pending", requestedAt: createdAt }
      : { required: false, state: "not_required" },
    usage: { measured: false },
    status: "הצלחה",
  };
}

function entityEvidence(
  record: { id: string; updatedAt: ISODate },
  title: string,
  excerpt: string,
  method: string,
): EvidenceItem {
  return {
    sourceType: "entity",
    sourceId: record.id,
    title,
    relevantExcerpt: excerpt,
    relevanceMethod: method,
    verified: true,
    lastUpdated: record.updatedAt,
  };
}

const OPEN_LEAD_STATUSES: ReadonlySet<string> = new Set([
  "חדש",
  "נוצר קשר",
  "קיבל פרטים",
  "ממתין לתשובה",
  "נשלחה הצעה",
  "במשא ומתן",
]);

/** copilot.unanswered-customers — customers awaiting a reply + overdue leads. */
export function unansweredCustomersOp(
  customers: readonly Customer[],
  leads: readonly Lead[],
  todayIso: string,
  deps: LocalOpDeps = {},
): AIResponseEnvelopeV2 {
  const waiting = [...customers]
    .filter((c) => c.contactState === "ממתין למענה")
    .sort((a, b) => a.id.localeCompare(b.id));
  const overdue = [...leads]
    .filter((l) => OPEN_LEAD_STATUSES.has(l.status) && l.followUp <= todayIso)
    .sort((a, b) => a.followUp.localeCompare(b.followUp) || a.id.localeCompare(b.id));
  const parts: string[] = [];
  if (waiting.length > 0) {
    parts.push(
      `${waiting.length} לקוחות במצב "ממתין למענה": ${waiting.map((c) => c.name).join(", ")}`,
    );
  }
  if (overdue.length > 0) {
    parts.push(
      `${overdue.length} לידים פתוחים שמועד המעקב שלהם עבר: ${overdue.map((l) => l.name).join(", ")}`,
    );
  }
  const recommendation =
    parts.length === 0 ? "אין כרגע לקוחות או לידים שממתינים למענה." : parts.join(". ") + ".";
  return makeEnvelope(
    "copilot.unanswered-customers",
    {
      recommendation,
      reason:
        "סינון דטרמיניסטי: לקוחות עם contactState=ממתין למענה + לידים פתוחים עם followUp שעבר.",
      evidence: [
        ...waiting
          .slice(0, 5)
          .map((c) =>
            entityEvidence(c, `לקוח: ${c.name}`, `מצב קשר: "${c.contactState}"`, "contactState"),
          ),
        ...overdue
          .slice(0, 5)
          .map((l) =>
            entityEvidence(l, `ליד: ${l.name}`, `מעקב מתוכנן: ${l.followUp}`, "followUp ≤ היום"),
          ),
      ],
      nextStep: parts.length === 0 ? "אין פעולה נדרשת" : "לתעדף חזרה ללקוחות הממתינים עוד היום",
      confidenceMethod: "סינון בינארי — אין מדד ביטחון למדוד",
      confidenceSignals: [`נסרקו ${customers.length} לקוחות ו-${leads.length} לידים`],
    },
    deps,
  );
}

/** copilot.quotations-no-response — sent quotations still awaiting an answer. */
export function quotationsNoResponseOp(
  quotations: readonly Quotation[],
  todayIso: string,
  deps: LocalOpDeps = {},
): AIResponseEnvelopeV2 {
  const sent = [...quotations]
    .filter((q) => q.status === "נשלחה")
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil) || a.id.localeCompare(b.id));
  const expiringSoon = sent.filter((q) => q.validUntil <= todayIso);
  const recommendation =
    sent.length === 0
      ? "אין הצעות מחיר שנשלחו וממתינות לתגובה."
      : `${sent.length} הצעות נשלחו וטרם נענו: ${sent
          .map((q) => `«${q.title}» ל-${q.customerName} (בתוקף עד ${q.validUntil})`)
          .join(" · ")}.` +
        (expiringSoon.length > 0 ? ` שימו לב: ${expiringSoon.length} מהן כבר פגות תוקף.` : "");
  return makeEnvelope(
    "copilot.quotations-no-response",
    {
      recommendation,
      reason: 'סינון דטרמיניסטי של הצעות בסטטוס "נשלחה" — נשלחו ולא התקבלה עליהן החלטה.',
      evidence: sent
        .slice(0, 8)
        .map((q) =>
          entityEvidence(
            q,
            `הצעה: ${q.title}`,
            `סטטוס "נשלחה", בתוקף עד ${q.validUntil}`,
            'status === "נשלחה"',
          ),
        ),
      nextStep: sent.length === 0 ? "אין פעולה נדרשת" : "לתאם שיחת מעקב על ההצעות שקרובות לפוג",
      confidenceMethod: "סינון בינארי — אין מדד ביטחון למדוד",
      confidenceSignals: [`נסרקו ${quotations.length} הצעות`],
    },
    deps,
  );
}

/** copilot.stuck-students — enrollments with blocked / overdue / fix-needed stages. */
export function stuckStudentsOp(
  enrollments: readonly Enrollment[],
  deps: LocalOpDeps = {},
): AIResponseEnvelopeV2 {
  const STUCK: ReadonlySet<string> = new Set(["חסום / צריך עזרה", "באיחור", "נדרש תיקון"]);
  const stuck = [...enrollments]
    .map((e) => ({
      enrollment: e,
      stages: e.stages.filter((s) => STUCK.has(s.status)),
    }))
    .filter((x) => x.stages.length > 0)
    .sort((a, b) => a.enrollment.id.localeCompare(b.enrollment.id));
  const recommendation =
    stuck.length === 0
      ? "אין תלמידים תקועים — כל השלבים מתקדמים כסדרם."
      : `${stuck.length} תלמידים אינם מתקדמים: ${stuck
          .map(
            (x) =>
              `${x.enrollment.studentName} (${x.stages.map((s) => `${s.stageId}: ${s.status}`).join(", ")})`,
          )
          .join(" · ")}.`;
  return makeEnvelope(
    "copilot.stuck-students",
    {
      recommendation,
      reason: 'סינון דטרמיניסטי של שלבי למידה בסטטוס "חסום / צריך עזרה", "באיחור" או "נדרש תיקון".',
      evidence: stuck
        .slice(0, 8)
        .map((x) =>
          entityEvidence(
            x.enrollment,
            `הרשמה: ${x.enrollment.studentName}`,
            x.stages.map((s) => `${s.stageId} — ${s.status}`).join("; "),
            "סטטוס שלב בקבוצת התקיעות",
          ),
        ),
      nextStep: stuck.length === 0 ? "אין פעולה נדרשת" : "להעביר למדריך רשימת התערבות לפי תלמיד",
      confidenceMethod: "סינון בינארי — אין מדד ביטחון למדוד",
      confidenceSignals: [`נסרקו ${enrollments.length} הרשמות`],
    },
    deps,
  );
}

/** copilot.recurring-faults — tickets grouped by printer model, repeats only. */
export function recurringFaultsOp(
  tickets: readonly ServiceTicket[],
  deps: LocalOpDeps = {},
): AIResponseEnvelopeV2 {
  const byPrinter = new Map<string, ServiceTicket[]>();
  for (const t of tickets) {
    const list = byPrinter.get(t.printer) ?? [];
    list.push(t);
    byPrinter.set(t.printer, list);
  }
  const recurring = [...byPrinter.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "he"));
  const recommendation =
    recurring.length === 0
      ? "לא נמצאו תקלות חוזרות — אף דגם לא צבר יותר מקריאה אחת."
      : `תקלות חוזרות לפי דגם: ${recurring
          .map(([printer, list]) => `${printer} — ${list.length} קריאות`)
          .join(" · ")}.`;
  return makeEnvelope(
    "copilot.recurring-faults",
    {
      recommendation,
      reason: "קיבוץ דטרמיניסטי של קריאות שירות לפי שדה הדגם וספירת דגמים עם 2 קריאות ומעלה.",
      evidence: recurring
        .flatMap(([, list]) => list)
        .slice(0, 8)
        .map((t) =>
          entityEvidence(
            t,
            `קריאה: ${t.issue}`,
            `דגם ${t.printer}, סטטוס "${t.status}"`,
            "שייכת לדגם עם קריאות חוזרות",
          ),
        ),
      nextStep:
        recurring.length === 0
          ? "אין פעולה נדרשת"
          : "לבחון עם סוכן הידע האם קיימת רשומת פתרון קבועה לדגמים החוזרים",
      confidenceMethod: "ספירה ישירה — אין מדד ביטחון למדוד",
      confidenceSignals: [`נסרקו ${tickets.length} קריאות על ${byPrinter.size} דגמים`],
    },
    deps,
  );
}

/** copilot.course-fit-scan — customers matching open advanced courses. */
export function courseFitScanOp(
  customers: readonly Customer[],
  courses: readonly Course[],
  deps: LocalOpDeps = {},
): AIResponseEnvelopeV2 {
  const open = courses.filter((c) => c.status === "פתוח להרשמה" || c.status === "פעיל");
  const matches = [...customers]
    .filter((cu) => cu.courseNames.length > 0)
    .map((cu) => ({
      customer: cu,
      candidates: open.filter((c) => !cu.courseNames.includes(c.name)),
    }))
    .filter((x) => x.candidates.length > 0)
    .sort((a, b) => a.customer.id.localeCompare(b.customer.id));
  const recommendation =
    matches.length === 0
      ? "לא נמצאו לקוחות בוגרי קורס שמתאים להם קורס פתוח נוסף."
      : `${matches.length} לקוחות שכבר למדו קורס ומתאימים לקורס מתקדם: ${matches
          .map((x) => `${x.customer.name} → ${x.candidates.map((c) => `«${c.name}»`).join(", ")}`)
          .join(" · ")}.`;
  return makeEnvelope(
    "copilot.course-fit-scan",
    {
      recommendation,
      reason: "סינון דטרמיניסטי: לקוחות עם קורס קודם, מול קורסים פתוחים/פעילים שאינם ברשימתם.",
      evidence: matches
        .slice(0, 6)
        .map((x) =>
          entityEvidence(
            x.customer,
            `לקוח: ${x.customer.name}`,
            `קורסים קיימים: ${x.customer.courseNames.join(", ")}`,
            "בוגר קורס עם קורס פתוח מתאים",
          ),
        ),
      nextStep:
        matches.length === 0
          ? "לעדכן כשייפתח קורס המשך"
          : "להכין פנייה מותאמת — כל שליחה מחייבת אישור אנושי",
      confidenceMethod: "סינון בינארי — אין מדד ביטחון למדוד",
      confidenceSignals: [`נסרקו ${customers.length} לקוחות מול ${open.length} קורסים פתוחים`],
    },
    deps,
  );
}
