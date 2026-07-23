// W5-D — deterministic AI-planning operations for /automations (Phase 5.12).
// Six local ops over the REAL automation + run records, each producing an
// honest EnvelopeV2 (provider "local-rules", model null, usage unmeasured,
// confidence "טרם נמדד", limitations disclosed). No model is involved and
// none is implied. External execution NEVER happens here — only through the
// approval engine.
import type { Automation, AutomationRun, ISODate } from "@/domain/types";
import type { AIResponseEnvelopeV2, EvidenceItem } from "@/domain/ai/envelope";
import { unavailableConfidence } from "@/domain/ai/envelope";

export interface PlanOpDeps {
  now?: () => ISODate;
  idFactory?: (n: number) => string;
}

let seq = 0;

const PLAN_LIMITATIONS = [
  "מנוע כללים מקומי ודטרמיניסטי — לא מודל שפה; אותו קלט מחזיר תמיד אותו פלט",
  "תכנון בלבד — שום פעולה חיצונית אינה מבוצעת; ביצוע מחייב אישור אנושי דרך מנוע האישורים",
];

/** Steps whose wording implies leaving the system (send / notify / publish). */
const EXTERNAL_STEP = /שליח|נשלח|שיגור|הודעה|התראה|פרסום|מייל|SMS/;

export function hasExternalStep(automation: Automation): boolean {
  return (
    automation.steps.some((s) => EXTERNAL_STEP.test(s)) ||
    EXTERNAL_STEP.test(automation.description)
  );
}

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
  deps: PlanOpDeps,
): AIResponseEnvelopeV2 {
  seq += 1;
  const id = (deps.idFactory ?? ((n: number) => `autoplan-env-${n}`))(seq);
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
    limitations: [...PLAN_LIMITATIONS, ...(fields.limitations ?? [])],
    approval: fields.approvalRequired
      ? { required: true, state: "pending", requestedAt: createdAt }
      : { required: false, state: "not_required" },
    usage: { measured: false },
    status: "הצלחה",
  };
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
  return makeEnvelope(
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
  return makeEnvelope(
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
  return makeEnvelope(
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
  return makeEnvelope(
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
  return makeEnvelope(
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
  return makeEnvelope(
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
