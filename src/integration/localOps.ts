// W6-E — RELOCATION PREP (Phase 6.16): the 5 module-local Copilot ops (W5-D,
// src/modules/ai-copilot/ops.ts) + the 6 automation-planning ops (W5-D,
// src/modules/automations/planOps.ts) extracted VERBATIM as pure functions,
// with a registration manifest. The Integration Lead moves these into
// LocalRulesProvider (src/ai is not W6-E territory); until then the original
// module files re-export from here, so no behavior or test changes.
// Every op stays deterministic and produces an honest EnvelopeV2:
// provider "local-rules", model null, usage unmeasured, confidence "טרם נמדד".
import type {
  Automation,
  AutomationRun,
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

// ---------------------------------------------------------------------------
// shared plumbing
// ---------------------------------------------------------------------------

export interface LocalOpDeps {
  now?: () => ISODate;
  idFactory?: (n: number) => string;
}

/** kept as a distinct alias — the automations module imports this name */
export type PlanOpDeps = LocalOpDeps;

interface EnvelopeFields {
  recommendation: string;
  reason: string;
  evidence: EvidenceItem[];
  nextStep: string;
  limitations?: string[];
  confidenceMethod: string;
  confidenceSignals?: string[];
  approvalRequired?: boolean;
}

function buildEnvelope(
  operation: string,
  fields: EnvelopeFields,
  deps: LocalOpDeps,
  seq: number,
  defaultPrefix: string,
  baseLimitations: readonly string[],
): AIResponseEnvelopeV2 {
  const id = (deps.idFactory ?? ((n: number) => `${defaultPrefix}-${n}`))(seq);
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
    limitations: [...baseLimitations, ...(fields.limitations ?? [])],
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

// ---------------------------------------------------------------------------
// Copilot ops (formerly src/modules/ai-copilot/ops.ts)
// ---------------------------------------------------------------------------

let copilotSeq = 0;

const MODULE_LIMITATIONS = [
  "מנוע כללים מקומי ודטרמיניסטי — לא מודל שפה; אותו קלט מחזיר תמיד אותו פלט",
  "פעולה מקומית של מודול ה-Copilot — מועמדת למעבר ל-LocalRulesProvider (ראו integration-requests-w5d)",
] as const;

function makeCopilotEnvelope(
  operation: string,
  fields: EnvelopeFields,
  deps: LocalOpDeps,
): AIResponseEnvelopeV2 {
  copilotSeq += 1;
  return buildEnvelope(operation, fields, deps, copilotSeq, "copilot-env", MODULE_LIMITATIONS);
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
  return makeCopilotEnvelope(
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
  return makeCopilotEnvelope(
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
  return makeCopilotEnvelope(
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
  return makeCopilotEnvelope(
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
  return makeCopilotEnvelope(
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

// ---------------------------------------------------------------------------
// Automation-planning ops (formerly src/modules/automations/planOps.ts)
// ---------------------------------------------------------------------------

let planSeq = 0;

const PLAN_LIMITATIONS = [
  "מנוע כללים מקומי ודטרמיניסטי — לא מודל שפה; אותו קלט מחזיר תמיד אותו פלט",
  "תכנון בלבד — שום פעולה חיצונית אינה מבוצעת; ביצוע מחייב אישור אנושי דרך מנוע האישורים",
] as const;

function makePlanEnvelope(
  operation: string,
  fields: EnvelopeFields,
  deps: PlanOpDeps,
): AIResponseEnvelopeV2 {
  planSeq += 1;
  return buildEnvelope(operation, fields, deps, planSeq, "autoplan-env", PLAN_LIMITATIONS);
}

/** Steps whose wording implies leaving the system (send / notify / publish). */
const EXTERNAL_STEP = /שליח|נשלח|שיגור|הודעה|התראה|פרסום|מייל|SMS/;

export function hasExternalStep(automation: Automation): boolean {
  return (
    automation.steps.some((s) => EXTERNAL_STEP.test(s)) ||
    EXTERNAL_STEP.test(automation.description)
  );
}

function automationEvidence(automation: Automation, excerpt: string, method: string): EvidenceItem {
  return {
    sourceType: "entity",
    sourceId: automation.id,
    title: `אוטומציה: ${automation.name}`,
    relevantExcerpt: excerpt,
    relevanceMethod: method,
    verified: true,
    lastUpdated: automation.updatedAt,
  };
}

function runEvidence(run: AutomationRun, method: string): EvidenceItem {
  return {
    sourceType: "entity",
    sourceId: run.id,
    title: `ריצה: ${run.id}`,
    relevantExcerpt: `תוצאה: ${run.outcome ?? "ללא"} · ${run.stepsLog.join("; ")}`,
    relevanceMethod: method,
    verified: true,
    lastUpdated: run.updatedAt,
  };
}

/** automation.plan.classify-trigger — schedule vs event + external exposure. */
export function classifyTriggerOp(
  automation: Automation,
  deps: PlanOpDeps = {},
): AIResponseEnvelopeV2 {
  const scheduled = /כל יום|כל שבוע|בשעה|\d{2}:\d{2}/.test(automation.trigger);
  const kind = scheduled ? "טריגר מתוזמן (לוח זמנים)" : "טריגר מבוסס אירוע (שינוי נתונים)";
  const external = hasExternalStep(automation);
  return makePlanEnvelope(
    "automation.plan.classify-trigger",
    {
      recommendation: `הטריגר «${automation.trigger}» סווג: ${kind}. ${
        external
          ? "האוטומציה כוללת צעד יוצא (שליחה/התראה) — כל הרצה מחייבת אישור אנושי."
          : "כל צעדי האוטומציה פנימיים (יצירת רשומות בלבד)."
      }`,
      reason: "כללי מילות מפתח דטרמיניסטיים על נוסח הטריגר והצעדים — לא מודל שפה.",
      evidence: [
        automationEvidence(automation, `טריגר: "${automation.trigger}"`, "שדה הקלט של כלל הסיווג"),
      ],
      nextStep: external ? "לוודא ששער האישור פעיל לפני כל הרצה" : "ניתן להריץ לפי המדיניות הקיימת",
      confidenceMethod: "התאמת מילות מפתח בינארית — אין מדד ביטחון למדוד",
      confidenceSignals: [
        scheduled ? "נמצאה תבנית תזמון" : "לא נמצאה תבנית תזמון",
        external ? "נמצא צעד יוצא" : "אין צעד יוצא",
      ],
    },
    deps,
  );
}

/** automation.plan.identify-missing — what is missing before this can run safely. */
export function identifyMissingOp(
  automation: Automation,
  runs: readonly AutomationRun[],
  deps: PlanOpDeps = {},
): AIResponseEnvelopeV2 {
  const myRuns = runs.filter((r) => r.automationId === automation.id);
  const missing: string[] = [];
  if (!automation.enabled) missing.push("האוטומציה כבויה — נדרשת הפעלה");
  if (hasExternalStep(automation) && !automation.requiresApproval) {
    missing.push("צעד יוצא ללא דגל requiresApproval — נדרש ליישר את הדגל לפני הרצה");
  }
  if (myRuns.length === 0) missing.push("אין ריצות עבר — אין ראיות שהצעדים פועלים בסביבה זו");
  if (automation.steps.length === 0) missing.push("לא הוגדרו צעדים");
  return makePlanEnvelope(
    "automation.plan.identify-missing",
    {
      recommendation:
        missing.length === 0
          ? "לא זוהה מידע חסר — התצורה שלמה ביחס לכללי הבדיקה."
          : `זוהו ${missing.length} פערים: ${missing.join(" · ")}.`,
      reason: "בדיקות תצורה דטרמיניסטיות: מצב הפעלה, דגל אישור מול צעדים יוצאים, היסטוריית ריצות.",
      evidence: [
        automationEvidence(
          automation,
          `enabled=${automation.enabled}, requiresApproval=${automation.requiresApproval}`,
          "שדות התצורה שנבדקו",
        ),
        ...myRuns.slice(0, 2).map((r) => runEvidence(r, "היסטוריית ריצות")),
      ],
      nextStep: missing.length === 0 ? "אין פעולה נדרשת" : "להשלים את הפערים לפני ההרצה הבאה",
      confidenceMethod: "בדיקות בינאריות — אין מדד ביטחון למדוד",
      confidenceSignals: [`נבדקו ${myRuns.length} ריצות עבר`],
    },
    deps,
  );
}

/** automation.plan.propose-conditions — guard conditions derived from the steps. */
export function proposeConditionsOp(
  automation: Automation,
  deps: PlanOpDeps = {},
): AIResponseEnvelopeV2 {
  const conditions: string[] = [
    `להריץ רק כאשר האוטומציה פעילה (enabled=true) — כרגע ${automation.enabled ? "פעילה" : "כבויה"}`,
    "לא להריץ פעמיים על אותה רשומת מקור באותו יום (מניעת כפילויות)",
  ];
  if (hasExternalStep(automation)) {
    conditions.push("לעצור לפני כל צעד יוצא ולהמתין לאישור אנושי (שער האישור הקנוני)");
  }
  if (automation.steps.some((s) => /משימה/.test(s))) {
    conditions.push("לא ליצור משימה כפולה כשקיימת משימה פתוחה לאותו גורם");
  }
  return makePlanEnvelope(
    "automation.plan.propose-conditions",
    {
      recommendation: `תנאי הרצה מוצעים: ${conditions.join(" · ")}.`,
      reason: "גזירה דטרמיניסטית מנוסח הצעדים: כל צעד ממופה לתנאי-שמירה מתאים.",
      evidence: [automationEvidence(automation, automation.steps.join(" → "), "רצף הצעדים המנותח")],
      nextStep: "לאשר את התנאים ולהטמיעם בהגדרת האוטומציה (שינוי קבוע מחייב אישור)",
      confidenceMethod: "מיפוי כללים — אין מדד ביטחון למדוד",
      confidenceSignals: [`${automation.steps.length} צעדים נותחו`],
    },
    deps,
  );
}

/** automation.plan.draft-content — draft outgoing text (approval REQUIRED). */
export function draftContentOp(
  automation: Automation,
  deps: PlanOpDeps = {},
): AIResponseEnvelopeV2 {
  const draft = `שלום, כאן טרגון טכנולוגיות. הודעה זו הוכנה במסגרת האוטומציה «${automation.name}»: ${automation.description} נשמח לעמוד לרשותכם בכל שאלה.`;
  return makePlanEnvelope(
    "automation.plan.draft-content",
    {
      recommendation: draft,
      reason: "מילוי תבנית דטרמיניסטי מפרטי האוטומציה — טיוטה בלבד, דבר אינו נשלח.",
      evidence: [automationEvidence(automation, automation.description, "מקור נתוני התבנית")],
      nextStep: "אישור אנושי של הנוסח לפני כל שליחה — הטיוטה אינה נשלחת אוטומטית",
      limitations: ["תבנית קבועה — עריכה אנושית מומלצת לפני אישור"],
      confidenceMethod: "מילוי תבנית — אין מה למדוד",
      approvalRequired: true,
    },
    deps,
  );
}

/** automation.plan.suggest-next — next action from the latest run outcome. */
export function suggestNextActionOp(
  automation: Automation,
  runs: readonly AutomationRun[],
  deps: PlanOpDeps = {},
): AIResponseEnvelopeV2 {
  const myRuns = [...runs]
    .filter((r) => r.automationId === automation.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  const last = myRuns[0];
  const recommendation = !last
    ? "אין ריצות עבר — הצעד הבא: הרצת ניסיון מבוקרת (עם שער אישור כשנדרש)."
    : last.outcome === "הצלחה"
      ? `הריצה האחרונה (${last.id}) הצליחה — הצעד הבא: להשאיר את התזמון הקיים ולעקוב אחר הריצה הבאה.`
      : last.outcome === "כישלון"
        ? `הריצה האחרונה (${last.id}) נכשלה — הצעד הבא: לבחון את יומן הצעדים ולתקן לפני הרצה חוזרת.`
        : `הריצה האחרונה (${last.id}) בוטלה — הצעד הבא: לוודא שהביטול היה מכוון.`;
  return makePlanEnvelope(
    "automation.plan.suggest-next",
    {
      recommendation,
      reason: "כלל דטרמיניסטי על תוצאת הריצה האחרונה (הצלחה/כישלון/בוטל/אין ריצות).",
      evidence: last
        ? [runEvidence(last, "הריצה האחרונה")]
        : [automationEvidence(automation, "אין ריצות עבר", "היעדר רשומות ריצה")],
      nextStep: "לתעד את ההחלטה ביומן הפעילות",
      confidenceMethod: "כלל מיפוי — אין מדד ביטחון למדוד",
      confidenceSignals: [`${myRuns.length} ריצות עבר`],
    },
    deps,
  );
}

/** automation.plan.detect-failures — failure paths from records + step analysis. */
export function detectFailurePathsOp(
  automation: Automation,
  runs: readonly AutomationRun[],
  deps: PlanOpDeps = {},
): AIResponseEnvelopeV2 {
  const myRuns = runs.filter((r) => r.automationId === automation.id);
  const failed = myRuns.filter((r) => r.outcome === "כישלון" || r.outcome === "בוטל");
  const risky: string[] = [];
  if (hasExternalStep(automation))
    risky.push("צעד יוצא — תלוי בערוץ חיצוני שאינו קיים במצב הדגמה (יכשל בכנות ללא handler)");
  if (automation.steps.some((s) => /המתנה לאישור/.test(s))) {
    risky.push("צעד המתנה לאישור — הריצה תיעצר עד החלטה אנושית (זה מנגנון, לא תקלה)");
  }
  const recommendation = [
    failed.length === 0
      ? "לא נרשמו ריצות כושלות."
      : `${failed.length} ריצות עבר הסתיימו בכישלון/ביטול.`,
    risky.length > 0
      ? `נתיבי כשל אפשריים: ${risky.join(" · ")}.`
      : "לא זוהו נתיבי כשל נוספים בצעדים.",
  ].join(" ");
  return makePlanEnvelope(
    "automation.plan.detect-failures",
    {
      recommendation,
      reason: "ספירת תוצאות ריצה שליליות + מיפוי דטרמיניסטי של צעדים תלויי-חוץ.",
      evidence: [
        ...failed.slice(0, 3).map((r) => runEvidence(r, "ריצה שנכשלה/בוטלה")),
        automationEvidence(automation, automation.steps.join(" → "), "צעדים שנותחו לנתיבי כשל"),
      ],
      nextStep: failed.length > 0 ? "לתחקר את הריצות הכושלות לפני ההרצה הבאה" : "אין פעולה נדרשת",
      confidenceMethod: "ספירה ומיפוי — אין מדד ביטחון למדוד",
      confidenceSignals: [`${myRuns.length} ריצות נסרקו`],
    },
    deps,
  );
}

// ---------------------------------------------------------------------------
// registration manifest — the Integration Lead's relocation checklist
// ---------------------------------------------------------------------------

export interface LocalOpManifestEntry {
  /** current operation id (as emitted in the envelope) */
  operation: string;
  /** proposed LocalRulesProvider operation (per integration-requests-w5d) */
  proposedProviderOperation: string;
  group: "copilot" | "automation-plan";
  /** the pure implementation — contravariant signature, cast at the call site */
  fn: (...args: never[]) => AIResponseEnvelopeV2;
}

export const LOCAL_OPS_MANIFEST: readonly LocalOpManifestEntry[] = [
  {
    operation: "copilot.unanswered-customers",
    proposedProviderOperation: "summarize.unanswered-customers",
    group: "copilot",
    fn: unansweredCustomersOp,
  },
  {
    operation: "copilot.quotations-no-response",
    proposedProviderOperation: "summarize.quotations-no-response",
    group: "copilot",
    fn: quotationsNoResponseOp,
  },
  {
    operation: "copilot.stuck-students",
    proposedProviderOperation: "summarize.stuck-students",
    group: "copilot",
    fn: stuckStudentsOp,
  },
  {
    operation: "copilot.recurring-faults",
    proposedProviderOperation: "summarize.recurring-faults",
    group: "copilot",
    fn: recurringFaultsOp,
  },
  {
    operation: "copilot.course-fit-scan",
    proposedProviderOperation: "recommend.course-fit (scan mode)",
    group: "copilot",
    fn: courseFitScanOp,
  },
  {
    operation: "automation.plan.classify-trigger",
    proposedProviderOperation: "plan.classify-trigger",
    group: "automation-plan",
    fn: classifyTriggerOp,
  },
  {
    operation: "automation.plan.identify-missing",
    proposedProviderOperation: "plan.identify-missing",
    group: "automation-plan",
    fn: identifyMissingOp,
  },
  {
    operation: "automation.plan.propose-conditions",
    proposedProviderOperation: "plan.propose-conditions",
    group: "automation-plan",
    fn: proposeConditionsOp,
  },
  {
    operation: "automation.plan.draft-content",
    proposedProviderOperation: "plan.draft-content",
    group: "automation-plan",
    fn: draftContentOp,
  },
  {
    operation: "automation.plan.suggest-next",
    proposedProviderOperation: "plan.suggest-next",
    group: "automation-plan",
    fn: suggestNextActionOp,
  },
  {
    operation: "automation.plan.detect-failures",
    proposedProviderOperation: "plan.detect-failures",
    group: "automation-plan",
    fn: detectFailurePathsOp,
  },
];
