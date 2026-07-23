// TERAGON AI BUSINESS OS — W7-E (Phase 7.16): THREE MEASUREMENT LEVELS.
// Group A — הדרכה (training) · Group B — אימוץ (adoption) · Group C — עסקי.
// Every metric declares its TYPE honestly:
//   "מחושב"     — computed NOW from real collections (the measure() functions
//                 below read actual records; empty data ⇒ null ⇒ "טרם נמדד");
//   "יעד פיילוט" — a donor/spec TARGET. Never rendered as a measured value.
//   "מבני"      — structurally defined but has no measurement source yet in
//                 the local app (no telemetry) — honest limitation stated.
// Baseline: null ⇒ "לא הוגדר קו בסיס" (WAVE_7_CONTRADICTION_REPORT blanket
// ruling #1: no donor numeric claim is ever imported as measured/baseline).
import type {
  Activity,
  Approval,
  Enrollment,
  Lead,
  MetricObservation,
  Quotation,
  ServiceTicket,
  SupportRequest,
} from "@/domain/types";
import { courseCompletion } from "@/domain/selectors/dashboardKpis";
import { effectiveSupport } from "@/modules/support/lib";
import type { CollectionKey } from "@/repositories/collections";

export const NOT_MEASURED_HE = "טרם נמדד";
export const NO_BASELINE_HE = "לא הוגדר קו בסיס";

export type MetricGroupKey = "A" | "B" | "C";

export const METRIC_GROUP_TITLES: Readonly<Record<MetricGroupKey, string>> = {
  A: "רמה A — מדדי הדרכה",
  B: "רמה B — מדדי אימוץ",
  C: "רמה C — מדדים עסקיים",
};

export type SubmissionMetricType = "מחושב" | "יעד פיילוט" | "מבני";

export interface SubmissionMetricDef {
  key: string;
  nameHe: string;
  group: MetricGroupKey;
  type: SubmissionMetricType;
  definitionHe: string;
  /** computation formula — null for מבני metrics without one */
  formulaHe: string | null;
  /** the REAL source (selector / collection) for מחושב; honest note otherwise */
  sourceHe: string;
  sourceCollections: CollectionKey[];
  periodHe: string;
  /** null ⇒ "לא הוגדר קו בסיס" — donor numbers are NEVER imported here */
  baseline: number | null;
  /** the target (יעד) — displayed separately, never as a measurement */
  targetHe: string | null;
  unit: string;
  /** NAMED seed user (C3 — never a role) */
  ownerId: string;
  /** honest limitations of this metric right now */
  limitationsHe: string[];
  /** seed metricDefinitions record this bridges (md-1..md-9), when relevant */
  seedMetricId: string | null;
}

// ---------------------------------------------------------------------------
// the canonical metric catalogue
// ---------------------------------------------------------------------------

export const SUBMISSION_METRICS: readonly SubmissionMetricDef[] = [
  // ========================================================================
  // Group A — הדרכה
  // ========================================================================
  {
    key: "training_completion",
    nameHe: "השלמת מסלולי הדרכה",
    group: "A",
    type: "יעד פיילוט",
    definitionHe: "אחוז משתתפי הפיילוט שהשלימו את מסלול ההדרכה של הפרסונה שלהם.",
    formulaHe: "משתתפים שהשלימו ÷ משתתפי הפיילוט × 100",
    sourceHe: "רישום ידני במפגשי ההדרכה — ההדרכה טרם התקיימה",
    sourceCollections: [],
    periodHe: "פיילוט",
    baseline: null,
    targetHe: "100% ממשתתפי הפיילוט",
    unit: "%",
    ownerId: "u-oren",
    limitationsHe: ["אין עדיין מפגשי הדרכה — המדידה תחל עם תחילת ההדרכות"],
    seedMetricId: null,
  },
  {
    key: "exercise_success",
    nameHe: "הצלחה בתרגילי סימולציה",
    group: "A",
    type: "יעד פיילוט",
    definitionHe: "אחוז השלמת משימות ליבה בתרגיל הסימולציה של כל פרסונה.",
    formulaHe: "משימות שהושלמו בתרגיל ÷ סך המשימות × 100",
    sourceHe: "טופס תוצאות תרגיל שימולא על ידי המדריך — טרם קיים",
    sourceCollections: [],
    periodHe: "פיילוט",
    baseline: null,
    targetHe: "80% השלמת משימות בסימולציה (יעד המפרט לפרסונת משתמש קצה)",
    unit: "%",
    ownerId: "u-oren",
    limitationsHe: ["יעד ללא מקור מדידה מחובר — נדרש טופס תוצאות תרגיל"],
    seedMetricId: null,
  },
  {
    key: "knowledge_check",
    nameHe: "בדיקת ידע (Knowledge Check)",
    group: "A",
    type: "מבני",
    definitionHe: "שאלון הבנה קצר בסוף כל מפגש הדרכה — ציון עובר מוגדר מראש.",
    formulaHe: null,
    sourceHe: "שאלון בסוף מפגש — טרם נבנה שאלון",
    sourceCollections: [],
    periodHe: "לכל מפגש",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-oren",
    limitationsHe: ["מדד מבני — אין שאלון ואין נתונים; יופעל עם ההדרכה הראשונה"],
    seedMetricId: null,
  },
  {
    key: "instructor_approval",
    nameHe: "אישור מדריך לביצוע עצמאי",
    group: "A",
    type: "מבני",
    definitionHe: "אישור מתועד של המדריך שהמשתתף/ת מבצע/ת את תהליך הליבה עצמאית.",
    formulaHe: null,
    sourceHe: "רשומת אישור (approvals) שתיווצר בסוף ההדרכה — טרם קיימת",
    sourceCollections: ["approvals"],
    periodHe: "בסוף המסלול",
    baseline: null,
    targetHe: null,
    unit: "אישורים",
    ownerId: "u-oren",
    limitationsHe: ["אין עדיין רשומות אישור הדרכה — מנוע האישורים הקנוני ישמש כשההדרכה תחל"],
    seedMetricId: null,
  },
  {
    key: "training_satisfaction",
    nameHe: "שביעות רצון מההדרכה",
    group: "A",
    type: "יעד פיילוט",
    definitionHe: "סקר שביעות רצון קצר (1-5) בסוף כל מפגש הדרכה.",
    formulaHe: "ממוצע ציוני הסקר",
    sourceHe: "סקר סוף-מפגש — טרם הועבר",
    sourceCollections: [],
    periodHe: "לכל מפגש",
    baseline: null,
    targetHe: "ממוצע 4 ומעלה (מתוך 5)",
    unit: "ציון",
    ownerId: "u-oren",
    limitationsHe: ["אין נתוני סקר — ההדרכות טרם התקיימו"],
    seedMetricId: null,
  },

  // ========================================================================
  // Group B — אימוץ
  // ========================================================================
  {
    key: "wau",
    nameHe: "משתמשים פעילים שבועיים (WAU)",
    group: "B",
    type: "מבני",
    definitionHe: "אחוז המשתמשים המוגדרים שנכנסו ופעלו במערכת בשבוע נתון.",
    formulaHe: "משתמשים פעילים בשבוע ÷ משתמשים מוגדרים × 100",
    sourceHe: "אין טלמטריית שימוש באפליקציה המקומית — המדד מוגדר אך לא נמדד",
    sourceCollections: [],
    periodHe: "שבועי",
    baseline: null,
    targetHe: "WAU ≥ 70% (יעד פיילוט מהדונור — לא נמדד מעולם)",
    unit: "%",
    ownerId: "u-tzachi",
    limitationsHe: [
      "המערכת רצה מקומית ללא איסוף אירועי שימוש — נדרשת החלטת ממשל לפני הוספת טלמטריה",
    ],
    seedMetricId: null,
  },
  {
    key: "repeat_usage",
    nameHe: "שימוש חוזר (משתמש/שבוע)",
    group: "B",
    type: "מבני",
    definitionHe: "מספר הפעמים שמשתמש/ת חוזר/ת למערכת בשבוע.",
    formulaHe: null,
    sourceHe: "אין טלמטריית שימוש — מוגדר בלבד",
    sourceCollections: [],
    periodHe: "שבועי",
    baseline: null,
    targetHe: "≥ 3 שימושים בשבוע (יעד מהדונור — לא נמדד)",
    unit: "שימושים",
    ownerId: "u-tzachi",
    limitationsHe: ["ללא איסוף אירועים אין דרך כנה למדוד — לא מוצג מספר"],
    seedMetricId: null,
  },
  {
    key: "feature_usage",
    nameHe: "שימוש ביכולות ליבה",
    group: "B",
    type: "מבני",
    definitionHe: "אילו יכולות (לידים, הצעות, שירות, Copilot) בשימוש בפועל ובאיזו תדירות.",
    formulaHe: null,
    sourceHe: "אין טלמטריית שימוש — מוגדר בלבד",
    sourceCollections: [],
    periodHe: "שבועי",
    baseline: null,
    targetHe: null,
    unit: "—",
    ownerId: "u-noa",
    limitationsHe: ["יופעל רק אם תאושר טלמטריה — כרגע אין מקור נתונים"],
    seedMetricId: null,
  },
  {
    key: "rec_approved_rate",
    nameHe: "שיעור המלצות שאושרו",
    group: "B",
    type: "מחושב",
    definitionHe: "אחוז המלצות ה-AI שאושרו על ידי אדם מתוך כלל ההמלצות שהוכרעו.",
    formulaHe: 'אישורים בסטטוס "אושר" ÷ אישורים שהוכרעו × 100',
    sourceHe: "אוסף approvals — רשומות אישור אמיתיות",
    sourceCollections: ["approvals"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-tzachi",
    limitationsHe: ["מדגם קטן בשלב זה — המספר ישתנה משמעותית עם השימוש"],
    seedMetricId: "md-7",
  },
  {
    key: "rec_edited_rate",
    nameHe: "שיעור המלצות שנערכו לפני אישור",
    group: "B",
    type: "מחושב",
    definitionHe: "אחוז ההמלצות שאושרו רק לאחר עריכה אנושית — מדד לאיכות הטיוטות.",
    formulaHe: 'אישורים במצב מורחב "edited" ÷ אישורים שהוכרעו × 100',
    sourceHe: "אוסף approvals — שדה extendedState (m005)",
    sourceCollections: ["approvals"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-tzachi",
    limitationsHe: ['רשומות ללא extendedState אינן נספרות כ"נערכו" — ייתכן תת-דיווח'],
    seedMetricId: null,
  },
  {
    key: "rec_rejected_rate",
    nameHe: "שיעור המלצות שנדחו",
    group: "B",
    type: "מחושב",
    definitionHe: "אחוז המלצות ה-AI שנדחו על ידי אדם מתוך כלל ההמלצות שהוכרעו.",
    formulaHe: 'אישורים בסטטוס "נדחה" ÷ אישורים שהוכרעו × 100',
    sourceHe: "אוסף approvals — רשומות אישור אמיתיות",
    sourceCollections: ["approvals"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-tzachi",
    limitationsHe: ["מדגם קטן בשלב זה"],
    seedMetricId: null,
  },
  {
    key: "support_volume",
    nameHe: "פניות תמיכה (30 יום)",
    group: "B",
    type: "מחושב",
    definitionHe: "מספר פניות התמיכה שנפתחו ב-30 הימים האחרונים.",
    formulaHe: "ספירת supportRequests עם createdAt ב-30 הימים האחרונים",
    sourceHe: "אוסף supportRequests — מערכת התמיכה החיה (/support)",
    sourceCollections: ["supportRequests"],
    periodHe: "30 יום מתגלגל",
    baseline: null,
    targetHe: "ירידה של 50% בפניות 'איך עושים' אחרי ההדרכה (יעד פיילוט — מחייב קו בסיס)",
    unit: "פניות",
    ownerId: "u-ran",
    limitationsHe: ["ללא קו בסיס לפני-הדרכה אי אפשר לקבוע ירידה — קו הבסיס טרם נמדד"],
    seedMetricId: null,
  },
  {
    key: "escalation_rate",
    nameHe: "שיעור אסקלציות (Tier 2+)",
    group: "B",
    type: "מחושב",
    definitionHe: "אחוז פניות התמיכה שהוסלמו מעבר לשירות עצמי (Tier 2 או 3).",
    formulaHe: "פניות ב-Tier ≥ 2 ÷ כלל הפניות × 100",
    sourceHe: "אוסף supportRequests — שדה tier (m002)",
    sourceCollections: ["supportRequests"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-ran",
    limitationsHe: ["רשומות ישנות ללא שדה tier מסווגות לפי סימוני ⟦Tier⟧ במלל"],
    seedMetricId: null,
  },

  // ========================================================================
  // Group C — עסקי
  // ========================================================================
  {
    key: "lead_response_hours",
    nameHe: "זמן תגובה לליד",
    group: "C",
    type: "מחושב",
    definitionHe: "חציון השעות מיצירת ליד ועד הפעילות המתועדת הראשונה שאינה יצירתו.",
    formulaHe: "חציון (זמן פעילות ראשונה − זמן יצירת הליד) על לידים עם פעילות מתועדת",
    sourceHe: "אוסף activities (entityRef=lead:*) מול אוסף leads",
    sourceCollections: ["activities", "leads"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: "מענה ראשוני בתוך יום עבודה (יעד פיילוט)",
    unit: "שעות",
    ownerId: "u-maya",
    limitationsHe: [
      "פעילויות שלא תועדו במערכת (טלפון/וואטסאפ ישיר) אינן נספרות — המדד מוטה כלפי מעלה",
    ],
    seedMetricId: null,
  },
  {
    key: "consultation_rate",
    nameHe: "שיעור קביעת שיחות ייעוץ",
    group: "C",
    type: "יעד פיילוט",
    definitionHe: "אחוז הלידים שהבשילו לשיחת ייעוץ מתואמת.",
    formulaHe: "לידים עם פגישה מתואמת ÷ כלל הלידים × 100",
    sourceHe: "יחייב קישור מובנה בין פגישות ללידים — הקישור טרם קיים בנתונים",
    sourceCollections: ["leads", "meetings"],
    periodHe: "חודשי",
    baseline: null,
    targetHe: "עלייה מול קו בסיס שייקבע בפיילוט",
    unit: "%",
    ownerId: "u-maya",
    limitationsHe: ["relatedRef של פגישות אינו מקושר עדיין ללידים באופן עקבי — לא ניתן לחשב בכנות"],
    seedMetricId: null,
  },
  {
    key: "quotation_conversion",
    nameHe: "שיעור המרת הצעות מחיר",
    group: "C",
    type: "מחושב",
    definitionHe: "אחוז הצעות המחיר שאושרו מתוך ההצעות שהוכרעו (אושרה/נדחתה/פג תוקף).",
    formulaHe: 'הצעות "אושרה" ÷ הצעות שהוכרעו × 100',
    sourceHe: "אוסף quotations — רשומות הצעות המחיר האמיתיות (/sales)",
    sourceCollections: ["quotations"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-maya",
    limitationsHe: ["הצעות פתוחות (טיוטה/נשלחה) אינן במונה ואינן במכנה"],
    seedMetricId: null,
  },
  {
    key: "service_resolution_days",
    nameHe: "זמן פתרון קריאת שירות",
    group: "C",
    type: "מחושב",
    definitionHe: "חציון הימים מפתיחת קריאה ועד סגירתה (קריאות עם closedAt בלבד).",
    formulaHe: "חציון (closedAt − openedAt) על קריאות סגורות",
    sourceHe: "אוסף serviceTickets — קריאות השירות האמיתיות (/service)",
    sourceCollections: ["serviceTickets"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: null,
    unit: "ימים",
    ownerId: "u-ran",
    limitationsHe: ["קריאות סגורות ללא closedAt (טרם הגירה m007) אינן נספרות"],
    seedMetricId: null,
  },
  {
    key: "course_completion",
    nameHe: "השלמת שלבי למידה",
    group: "C",
    type: "מחושב",
    definitionHe: "אחוז שלבי הלמידה שאושרו מכלל השלבים הפעילים (הרשמות התלמידים).",
    formulaHe: "שלבים שאושרו ÷ סך השלבים × 100",
    sourceHe: "selectors/dashboardKpis · courseCompletion — אוסף enrollments",
    sourceCollections: ["enrollments"],
    periodHe: "מצטבר",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-oren",
    limitationsHe: ["מודד את תלמידי הקורסים — לא את הדרכת צוות טרגון (מדד A נפרד)"],
    seedMetricId: "md-5",
  },
  {
    key: "time_saved_hours",
    nameHe: "זמן שנחסך בשבוע",
    group: "C",
    type: "יעד פיילוט",
    definitionHe: "שעות עבודה שבועיות שנחסכו בתהליכי ליבה (הצעות מחיר, מעקב לידים, תיעוד).",
    formulaHe: "השוואת זמן-למשימה לפני/אחרי — מחייב מדידת קו בסיס",
    sourceHe: "מדידת זמן-למשימה בפיילוט — טרם החלה",
    sourceCollections: [],
    periodHe: "שבועי",
    baseline: null,
    targetHe: "קיצור זמן הכנת הצעת מחיר (קו בסיס: לא נמדד — הערכת בעל העסק 10-20 דק')",
    unit: "שעות",
    ownerId: "u-tzachi",
    limitationsHe: [
      'הערכת "8 שעות/שבוע" מהדונור היא הצהרת מקור — לא נמדדה ולא תוצג כערך',
    ],
    seedMetricId: null,
  },
  {
    key: "quality_error_rate",
    nameHe: "שיעור טעויות בתוצרים",
    group: "C",
    type: "מבני",
    definitionHe: "אחוז התוצרים (הצעות/הודעות) שדרשו תיקון לאחר שליחה.",
    formulaHe: null,
    sourceHe: "יחייב תיעוד תיקונים — תהליך שטרם הוגדר",
    sourceCollections: [],
    periodHe: "חודשי",
    baseline: null,
    targetHe: null,
    unit: "%",
    ownerId: "u-tzachi",
    limitationsHe: ["אין תהליך תיעוד תיקונים — מדד מבני בלבד"],
    seedMetricId: null,
  },
  {
    key: "nps",
    nameHe: "NPS לקוחות",
    group: "C",
    type: "יעד פיילוט",
    definitionHe: "Net Promoter Score בסולם ‎-100..+100 (אחוז ממליצים פחות אחוז מסתייגים).",
    formulaHe: "% ממליצים − % מסתייגים",
    sourceHe: "סקר לקוחות — טרם הועבר; קו בסיס טרם נמדד",
    sourceCollections: [],
    periodHe: "רבעוני",
    baseline: null,
    targetHe: "שיפור של ‎+10 נק' מקו הבסיס (מוסכמת ‎-100..+100; ראו C12)",
    unit: "נק'",
    ownerId: "u-tzachi",
    limitationsHe: [
      'הדונור ערבב שתי מוסכמות NPS ("≥7" מול "+10..20") — נבחרה מוסכמת ‎-100..+100 (C12)',
    ],
    seedMetricId: null,
  },
  {
    key: "roi",
    nameHe: "החזר השקעה (ROI)",
    group: "C",
    type: "יעד פיילוט",
    definitionHe: "יחס הערך העסקי שנוצר מול עלות ההטמעה — יחושב רק מנתונים מדודים.",
    formulaHe: "ערך מדוד שנוצר ÷ עלות הטמעה מדודה",
    sourceHe: "מחייב מדידת ערך ועלות בפועל — אף אחד מהם טרם נמדד",
    sourceCollections: [],
    periodHe: "שנתי",
    baseline: null,
    targetHe: '"3X" הוא יעד הצהרתי מהדונור — לא חושב ולא נמדד מעולם',
    unit: "יחס",
    ownerId: "u-tzachi",
    limitationsHe: ["הצגת ROI ללא מדידה היא בדיוק האנטי-דפוס שגל 7 נועד למנוע"],
    seedMetricId: null,
  },
];

// ---------------------------------------------------------------------------
// measurement — deterministic computations over REAL records
// ---------------------------------------------------------------------------

export interface MeasurementContext {
  leads: readonly Lead[];
  activities: readonly Activity[];
  quotations: readonly Quotation[];
  serviceTickets: readonly ServiceTicket[];
  approvals: readonly Approval[];
  supportRequests: readonly SupportRequest[];
  enrollments: readonly Enrollment[];
  metricObservations: readonly MetricObservation[];
  nowMs: number;
}

/** a REAL measurement — absent (null) ⇒ the honest "טרם נמדד" */
export interface SubmissionMeasurement {
  value: number;
  unit: string;
  /** how the number was produced (auditable) */
  methodHe: string;
  sampleSize: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m =
    sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round((m ?? 0) * 10) / 10;
}

function pct(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

function measureLeadResponse(ctx: MeasurementContext): SubmissionMeasurement | null {
  const diffs: number[] = [];
  for (const lead of ctx.leads) {
    const created = Date.parse(lead.createdAt);
    const responses = ctx.activities
      .filter(
        (a) =>
          a.entityRef === `lead:${lead.id}` &&
          Date.parse(a.at) > created &&
          !a.text.startsWith("ליד חדש"),
      )
      .map((a) => Date.parse(a.at))
      .sort((a, b) => a - b);
    const first = responses[0];
    if (first !== undefined) diffs.push((first - created) / 3_600_000);
  }
  if (diffs.length === 0) return null;
  return {
    value: median(diffs),
    unit: "שעות",
    methodHe: `חציון על ${diffs.length} לידים עם פעילות תגובה מתועדת`,
    sampleSize: diffs.length,
  };
}

function measureQuotationConversion(ctx: MeasurementContext): SubmissionMeasurement | null {
  const decided = ctx.quotations.filter((q) =>
    ["אושרה", "נדחתה", "פג תוקף"].includes(q.status),
  );
  if (decided.length === 0) return null;
  const approved = decided.filter((q) => q.status === "אושרה").length;
  return {
    value: pct(approved, decided.length),
    unit: "%",
    methodHe: `${approved} הצעות אושרו מתוך ${decided.length} שהוכרעו`,
    sampleSize: decided.length,
  };
}

function measureServiceResolution(ctx: MeasurementContext): SubmissionMeasurement | null {
  const closed = ctx.serviceTickets.filter(
    (t) => typeof t.closedAt === "string" && t.closedAt.length > 0,
  );
  const diffs = closed
    .map((t) => (Date.parse(t.closedAt as string) - Date.parse(t.openedAt)) / 86_400_000)
    .filter((d) => d >= 0);
  if (diffs.length === 0) return null;
  return {
    value: median(diffs),
    unit: "ימים",
    methodHe: `חציון על ${diffs.length} קריאות סגורות עם closedAt`,
    sampleSize: diffs.length,
  };
}

function decidedApprovals(ctx: MeasurementContext): Approval[] {
  return ctx.approvals.filter((a) => a.status !== "ממתין");
}

function measureRecRate(
  ctx: MeasurementContext,
  which: "approved" | "edited" | "rejected",
): SubmissionMeasurement | null {
  const decided = decidedApprovals(ctx);
  if (decided.length === 0) return null;
  let count = 0;
  if (which === "approved") count = decided.filter((a) => a.status === "אושר").length;
  else if (which === "rejected") count = decided.filter((a) => a.status === "נדחה").length;
  else count = decided.filter((a) => a.extendedState === "edited").length;
  return {
    value: pct(count, decided.length),
    unit: "%",
    methodHe: `${count} מתוך ${decided.length} אישורים שהוכרעו`,
    sampleSize: decided.length,
  };
}

function measureSupportVolume(ctx: MeasurementContext): SubmissionMeasurement {
  const cutoff = ctx.nowMs - 30 * 86_400_000;
  const recent = ctx.supportRequests.filter((r) => Date.parse(r.createdAt) >= cutoff);
  return {
    value: recent.length,
    unit: "פניות",
    methodHe: `ספירת פניות שנפתחו ב-30 הימים האחרונים (מתוך ${ctx.supportRequests.length} סה"כ)`,
    sampleSize: ctx.supportRequests.length,
  };
}

function measureEscalationRate(ctx: MeasurementContext): SubmissionMeasurement | null {
  if (ctx.supportRequests.length === 0) return null;
  const escalated = ctx.supportRequests.filter((r) => effectiveSupport(r).tier >= 2).length;
  return {
    value: pct(escalated, ctx.supportRequests.length),
    unit: "%",
    methodHe: `${escalated} פניות ב-Tier 2+ מתוך ${ctx.supportRequests.length}`,
    sampleSize: ctx.supportRequests.length,
  };
}

function measureCourseCompletion(ctx: MeasurementContext): SubmissionMeasurement | null {
  const cc = courseCompletion(ctx.enrollments);
  if (cc.completionPercent === null) return null;
  return {
    value: cc.completionPercent,
    unit: "%",
    methodHe: `${cc.approvedStages} שלבים אושרו מתוך ${cc.totalStages}`,
    sampleSize: cc.totalStages,
  };
}

/**
 * Measure one metric NOW from real records. Returns null (⇒ "טרם נמדד") for
 * every metric whose type is not "מחושב" and whenever the data cannot honestly
 * support a number. Deterministic: same records + nowMs ⇒ same result.
 */
export function measureMetric(
  def: SubmissionMetricDef,
  ctx: MeasurementContext,
): SubmissionMeasurement | null {
  if (def.type !== "מחושב") return null;
  switch (def.key) {
    case "lead_response_hours":
      return measureLeadResponse(ctx);
    case "quotation_conversion":
      return measureQuotationConversion(ctx);
    case "service_resolution_days":
      return measureServiceResolution(ctx);
    case "rec_approved_rate":
      return measureRecRate(ctx, "approved");
    case "rec_edited_rate":
      return measureRecRate(ctx, "edited");
    case "rec_rejected_rate":
      return measureRecRate(ctx, "rejected");
    case "support_volume":
      return measureSupportVolume(ctx);
    case "escalation_rate":
      return measureEscalationRate(ctx);
    case "course_completion":
      return measureCourseCompletion(ctx);
    default:
      return null;
  }
}

/** a metric + its honest current observation, ready for display */
export interface MetricWithObservation {
  def: SubmissionMetricDef;
  measurement: SubmissionMeasurement | null;
  /** "לא הוגדר קו בסיס" when baseline is null */
  baselineHe: string;
  /** the measured display — "טרם נמדד" when measurement is null */
  currentHe: string;
}

export function metricWithObservation(
  def: SubmissionMetricDef,
  ctx: MeasurementContext,
): MetricWithObservation {
  const measurement = measureMetric(def, ctx);
  return {
    def,
    measurement,
    baselineHe: def.baseline === null ? NO_BASELINE_HE : `${def.baseline} ${def.unit}`,
    currentHe:
      measurement === null ? NOT_MEASURED_HE : `${measurement.value} ${measurement.unit}`,
  };
}

/** the full 3-level board, grouped A/B/C in catalogue order */
export function metricBoard(
  ctx: MeasurementContext,
): Record<MetricGroupKey, MetricWithObservation[]> {
  const board: Record<MetricGroupKey, MetricWithObservation[]> = { A: [], B: [], C: [] };
  for (const def of SUBMISSION_METRICS) {
    board[def.group].push(metricWithObservation(def, ctx));
  }
  return board;
}
