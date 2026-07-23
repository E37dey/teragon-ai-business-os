// W7-D — quick-start data (7.12): "התחלה מהירה — שלוש פעולות". Every action
// navigates to a REAL app route (tested against APP_ROUTES). Times are written
// estimates (labeled as such in the UI); demos are honest schematic previews
// rendered live — not fake screenshots.
import type { CorrectUseRules, QuickStartAction } from "./types";

export const QUICK_START_TITLE = "התחלה מהירה — שלוש פעולות";

export const QUICK_START_ACTIONS: readonly QuickStartAction[] = [
  {
    order: 1,
    title: "פתח לקוח או פנייה",
    route: "/customers",
    routeLabel: "מסך הלקוחות",
    demo: {
      header: "לקוחות · חיפוש: מכללת",
      rows: [
        "מכללת אלומה · פעיל · 2 מדפסות · קורס בהדפסה",
        "סטודיו פרינטק · פעיל · קריאה פתוחה אחת",
        "בית ספר דקל · מתעניין · ליד חדש השבוע",
      ],
      actionLabel: "פתיחת כרטיס לקוח 360",
    },
    expectedResult:
      "כרטיס לקוח 360 נפתח: פרטים, מדפסות, קורסים, קריאות שירות ופעילות אחרונה — במסך אחד.",
    estimatedTime: "כדקה (הערכה כתובה — טרם נמדד מול משתמשים)",
    commonMistake: "פתיחת רשומה חדשה במקום חיפוש הלקוח הקיים — נוצרות כפילויות.",
    safetyNote: "צפייה בלבד בטוחה תמיד; עריכת פרטי לקוח נשמרת ומתועדת ביומן הפעילות.",
  },
  {
    order: 2,
    title: "בקש סיכום או המלצה",
    route: "/",
    routeLabel: "מרכז הפיקוד · Copilot",
    demo: {
      header: "Copilot · שאלה: סכם את הלידים מהשבוע האחרון",
      rows: [
        "המלצה: בשבוע האחרון נוצרו 4 לידים — חדש: 2 · בטיפול: 2",
        "ראיות: 4 רשומות ליד מקושרות (לחיצה פותחת כל רשומה)",
        "רמת ביטחון: טרם נמדד · מגבלות: מבוסס על הרשומות בלבד",
      ],
      actionLabel: "שליחת השאלה ל-Copilot",
    },
    expectedResult:
      "תשובה במעטפת מלאה: המלצה, נימוק, ראיות מרשומות אמיתיות, רמת ביטחון כנה ומגבלות.",
    estimatedTime: "כ-2 דקות (הערכה כתובה — טרם נמדד מול משתמשים)",
    commonMistake: "להעתיק את התשובה החוצה בלי לפתוח את הראיות — מדלגים על שלב הבדיקה.",
    safetyNote: "סיכומים והמלצות הם קריאה בלבד — שום דבר לא נשלח ולא משתנה בעקבות שאלה.",
  },
  {
    order: 3,
    title: "בדוק ראיות ואשר",
    route: "/agents",
    routeLabel: "סוכני AI · מרכז האישורים",
    demo: {
      header: "מרכז האישורים · טיוטת פולואו-אפ ממתינה",
      rows: [
        "נימוק: הליד ללא מענה 7 ימים · מעקב מתוכנן חלף",
        "ראיות: רשומת הליד + פעילות אחרונה (2 רשומות)",
        "פעולות: עריכת הנוסח → אישור · דחייה עם נימוק",
      ],
      actionLabel: "אישור לאחר עריכה",
    },
    expectedResult:
      "ההמלצה מאושרת רק אחרי קריאת הנימוק והראיות; האישור נרשם ביומן הביקורת על שם המאשר/ת.",
    estimatedTime: "כ-3 דקות (הערכה כתובה — טרם נמדד מול משתמשים)",
    commonMistake: "אישור אוטומטי בלי לפתוח את הראיות — בדיוק הטעות שהמערכת נבנתה למנוע.",
    safetyNote: "בלי אישור מפורש שלכם — שום הודעה לא נשלחת ושום פעולה רגישה לא מתבצעת.",
  },
];

/** כללי שימוש נכון — one-to-one with SCREEN_SPECS chapter 16 */
export const CORRECT_USE_RULES: CorrectUseRules = {
  allowed: ["לסכם מידע מאושר", "להכין טיוטה", "להציע פעולה", "לחפש ידע"],
  mustVerify: ["המלצה כספית", "הצעת מחיר", "מידע טכני", "הודעה חיצונית"],
  forbidden: [
    "לשלוח ללא אישור",
    "להמציא מקור",
    "לחשוף מידע רגיש",
    "לשנות הרשאה",
    "לאשר הנחה",
    "למחוק מידע",
  ],
};

// ---------------------------------------------------------------------------
// "בדוק אם הפעולה שתכננת מותרת" — deterministic rail coach (chapter 16 panel)
// ---------------------------------------------------------------------------

export type PlannedActionVerdict = "מותר" | "חובה לבדוק" | "אסור" | "לא זוהה";

export interface PlannedActionAnswer {
  verdict: PlannedActionVerdict;
  /** the policy line that matched; null when nothing matched */
  matchedRule: string | null;
  answerHe: string;
}

const FORBIDDEN_PATTERNS: readonly { pattern: RegExp; rule: string }[] = [
  { pattern: /לשלוח (?:בלי|ללא) אישור|תשלח ישר|שליחה ישירה/, rule: "לשלוח ללא אישור" },
  { pattern: /להמציא|לזייף מקור/, rule: "להמציא מקור" },
  { pattern: /לחשוף|להדביק (?:פרטי|מידע)|כלי חיצוני/, rule: "לחשוף מידע רגיש" },
  { pattern: /הרשאה|הרשאות/, rule: "לשנות הרשאה" },
  { pattern: /לאשר הנחה|לתת הנחה/, rule: "לאשר הנחה" },
  { pattern: /למחוק|מחיקת/, rule: "למחוק מידע" },
];

const VERIFY_PATTERNS: readonly { pattern: RegExp; rule: string }[] = [
  { pattern: /כספי|תשלום|עלות|תקציב/, rule: "המלצה כספית" },
  { pattern: /הצעת מחיר|מחיר|הנחה/, rule: "הצעת מחיר" },
  { pattern: /טכני|מפרט|חומרים|דגם/, rule: "מידע טכני" },
  { pattern: /לשלוח|הודעה|מייל|וואטסאפ|ללקוח/, rule: "הודעה חיצונית" },
];

const ALLOWED_PATTERNS: readonly { pattern: RegExp; rule: string }[] = [
  { pattern: /לסכם|סיכום/, rule: "לסכם מידע מאושר" },
  { pattern: /טיוטה|לנסח/, rule: "להכין טיוטה" },
  { pattern: /להציע|המלצה/, rule: "להציע פעולה" },
  { pattern: /לחפש|חיפוש|ידע/, rule: "לחפש ידע" },
];

/**
 * Deterministic policy check for a planned action, most-restrictive rule wins:
 * אסור > חובה לבדוק > מותר. Unrecognized wording is answered honestly.
 */
export function classifyPlannedAction(text: string): PlannedActionAnswer {
  const t = text.trim();
  if (t.length === 0) {
    return { verdict: "לא זוהה", matchedRule: null, answerHe: "כתבו את הפעולה המתוכננת כדי לבדוק." };
  }
  const forbidden = FORBIDDEN_PATTERNS.find((r) => r.pattern.test(t));
  if (forbidden) {
    return {
      verdict: "אסור",
      matchedRule: forbidden.rule,
      answerHe: `הפעולה נופלת תחת "${forbidden.rule}" — אסורה לפי נוהל השימוש הנכון. פנו לגורם המוסמך.`,
    };
  }
  const verify = VERIFY_PATTERNS.find((r) => r.pattern.test(t));
  if (verify) {
    return {
      verdict: "חובה לבדוק",
      matchedRule: verify.rule,
      answerHe: `מותר להשתמש ב-AI ככלי עזר, אבל "${verify.rule}" מחייבת בדיקה אנושית לפני כל שימוש בתוצר.`,
    };
  }
  const allowed = ALLOWED_PATTERNS.find((r) => r.pattern.test(t));
  if (allowed) {
    return {
      verdict: "מותר",
      matchedRule: allowed.rule,
      answerHe: `הפעולה תואמת את "${allowed.rule}" — מותרת ללא אישור נוסף. זכרו: תוצר שיוצא החוצה עדיין נבדק.`,
    };
  }
  return {
    verdict: "לא זוהה",
    matchedRule: null,
    answerHe:
      "הכללים הדטרמיניסטיים לא זיהו את הפעולה — זו לא קביעה שהיא מותרת. התייעצו עם Champion או פתחו פנייה בתמיכה.",
  };
}

/** the sample question the panel shows (chapter 16: sample question + governed answer) */
export const PLANNED_ACTION_SAMPLE = {
  questionHe: "אני רוצה לשלוח ללקוח הצעת מחיר שה-AI ניסח — מותר?",
  answer: classifyPlannedAction("לשלוח ללקוח הצעת מחיר שה-AI ניסח"),
};
