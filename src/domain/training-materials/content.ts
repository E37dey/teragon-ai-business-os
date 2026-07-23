// W7-D — the 13 canonical training materials (7.10): REAL authored Hebrew
// content, structured (no lorem, no HTML strings). Written fresh for the
// product's actual screens, commands and governance rules; donor docx content
// served as reference only.
//
// Honesty: content-complete materials are born "טיוטה" or "ממתין לבדיקה" —
// NEVER auto-"מאושר". Approval happens only through the canonical approvals
// flow (an Approval record decided by a named human).
import type {
  CanonicalMaterialKey,
  MaterialContentSection,
  MaterialSection,
  MaterialStatus,
} from "./types";

/** bump when the authored content below changes — drives bridge idempotency */
export const CANONICAL_CONTENT_VERSION = 1;

export interface CanonicalMaterialDef {
  key: CanonicalMaterialKey;
  /** the seeded trainingMaterials record this canonical material bridges onto */
  seedId: string;
  title: string;
  description: string;
  section: MaterialSection;
  /** seeded vocabulary: "מדריך" | "וידאו" | "מצגת" | "תרגול" */
  kind: string;
  audiencePersonaIds: string[];
  /** named owner from the users seed */
  ownerId: string;
  contentRoute: string | null;
  printable: boolean;
  exportFormats: string[];
  relatedStageId: string;
  relatedGateId: string;
  measurableOutcome: string | null;
  practiceIncluded: boolean;
  qualityValidation: string[];
  /** honest initial status — content-complete ⇒ draft/awaiting review */
  initialStatus: Extract<MaterialStatus, "טיוטה" | "ממתין לבדיקה">;
  sections: MaterialContentSection[];
}

const PRINT_EXPORT = ["הדפסה (A4)", "HTML"];

export const CANONICAL_MATERIALS: readonly CanonicalMaterialDef[] = [
  // =========================================================================
  // Section A — חומרי קריאה (7)
  // =========================================================================
  {
    key: "purpose-doc",
    seedId: "tm-1",
    title: "מסמך מטרת הפתרון",
    description: "למה טרגון עוברת ל-OS מבוסס AI, מה בתחולה ומה במפורש לא.",
    section: "חומרי קריאה",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5"],
    ownerId: "u-tzachi",
    contentRoute: null,
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-1",
    relatedGateId: "sg-1",
    measurableOutcome: "כל עובד/ת מסביר/ה בשפה שלו/ה מה המערכת עושה ומה לא (בדיקת פתיחה בהדרכה)",
    practiceIncluded: false,
    qualityValidation: [
      "התוכן נכתב מול המסכים הקיימים בפועל — לא הובטח מסך שאינו קיים",
      "טרם נבדק מול קהל אמיתי — הבדיקה מתוכננת במפגש ההדרכה הראשון",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "הבעיה שאנחנו פותרים",
        blocks: [
          {
            kind: "paragraph",
            text:
              "המידע של טרגון — לקוחות, לידים, הצעות מחיר, קורסים, קריאות שירות — חי היום " +
              "בכלים מפוזרים ובראש של אנשים. התוצאה: לידים שנופלים בין הכיסאות, ידע שנעלם " +
              "כשעובד עסוק, והנהלה שמקבלת תמונת מצב חלקית ומאוחרת.",
          },
          {
            kind: "bullets",
            title: "כאבים מרכזיים שנאספו מהצוות",
            items: [
              "מעקב לידים ידני — פולואו-אפ תלוי בזיכרון אנושי",
              "הצעת מחיר נבנית מאפס בכל פעם",
              "פתרונות תקלה חוזרים לא מתועדים — כל תקלה נפתרת מחדש",
              "התקדמות תלמידים נבדקת ידנית מול טבלאות",
              'למנכ"ל אין מסך אחד שמראה את מצב העסק',
            ],
          },
        ],
      },
      {
        heading: "מה המערכת עושה",
        blocks: [
          {
            kind: "paragraph",
            text:
              "TERAGON AI BUSINESS OS מרכזת את כל הישויות העסקיות במקום אחד, ומוסיפה שכבת " +
              "AI ממושלת: סיכומים, סיווגים והמלצות — תמיד עם נימוק, ראיות ממשיות מהרשומות, " +
              "ומעטפת אישור אנושי לכל פעולה רגישה.",
          },
          {
            kind: "bullets",
            title: "עקרונות מחייבים",
            items: [
              "כל המלצת AI מגיעה עם: המלצה · נימוק · ראיות · רמת ביטחון כנה · מגבלות",
              'אין רמת ביטחון מומצאת — כשאין מדידה מוצג "טרם נמדד"',
              "שליחה החוצה / שינוי נתונים רגיש = תמיד דרך מרכז האישורים",
              "כל פעולה נרשמת ביומן ביקורת עם מזהה מתאם",
            ],
          },
        ],
      },
      {
        heading: "מה במפורש לא בתחולה",
        blocks: [
          {
            kind: "bullets",
            items: [
              "המערכת לא שולחת שום דבר ללקוח בלי אישור אנושי",
              "המערכת לא מחליטה על הנחות או מחירים",
              "המערכת לא מחליפה שיקול דעת מקצועי — היא מציעה, האדם מחליט",
              "אין התחייבות לדיוק המלצות — הדיוק נמדד בפועל ומדווח בכנות",
            ],
          },
          {
            kind: "note",
            tone: "info",
            text: "הרחבה מלאה של גבולות אדם-AI נמצאת בנוהל השימוש הנכון (חומר מס' 4).",
          },
        ],
      },
    ],
  },
  {
    key: "to-be-map",
    seedId: "tm-2",
    title: "מפת תהליך TO-BE",
    description: "איך נראה כל תהליך ליבה אחרי ההטמעה — כולל גבול האדם-AI בכל צעד.",
    section: "חומרי קריאה",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-2", "per-4", "per-5"],
    ownerId: "u-tzachi",
    contentRoute: "/implementation",
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-1",
    relatedGateId: "sg-1",
    measurableOutcome: "כל תהליך ליבה ממופה עם בעלים, צעדים וגבול AI מוגדר",
    practiceIncluded: false,
    qualityValidation: [
      "המפה נכתבה מול המסכים והראוטים הקיימים בפועל",
      "תרשים ה-TO-BE האינטראקטיבי שייך למסך תכנית ההטמעה (W7-A) — כאן התוכן הטקסטואלי",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "תהליך מכירה — TO-BE",
        blocks: [
          {
            kind: "steps",
            items: [
              "ליד נקלט ב-CRM (ידני או מטופס) — בעלים: מכירות",
              "AI מסווג כוונה ודחיפות (כללים דטרמיניסטיים) — האדם רואה את הכלל שנורה",
              "AI מציע טיוטת פולואו-אפ — נשלחת רק אחרי אישור ועריכה אנושית",
              "הצעת מחיר נבנית במסך המכירות עם היסטוריית גרסאות",
              "סגירה: הליד הופך ללקוח, הפעילות נרשמת אוטומטית ביומן",
            ],
          },
          {
            kind: "note",
            tone: "warning",
            text: "גבול ה-AI: סיווג והצעת טיוטה בלבד. שליחה, הנחה ומחיר — החלטה אנושית תמיד.",
          },
        ],
      },
      {
        heading: "תהליך שירות — TO-BE",
        blocks: [
          {
            kind: "steps",
            items: [
              "קריאה נפתחת (מערכת/וואטסאפ/טלפון) ומקוטלגת אוטומטית לפי כללים",
              "Tier 1: שירות עצמי — FAQ ומאגר ידע; SLA מיידי",
              "Tier 2: Champion מקומי; SLA שעתיים",
              "Tier 3: מיישם AI + IT; SLA יום עבודה",
              "סגירה מחייבת תיעוד פתרון — הפתרון הופך לרשומת ידע",
            ],
          },
        ],
      },
      {
        heading: "תהליך למידה — TO-BE",
        blocks: [
          {
            kind: "steps",
            items: [
              "תלמיד/ה נרשמים למסלול — רואים בדיוק מה השלב הבא",
              "AI מציע את התרגיל הבא לפי התקדמות בפועל",
              "המדריך מאשר שלבים ממסך אחד — תלמידים תקועים מסומנים אוטומטית",
            ],
          },
          {
            kind: "routeRef",
            route: "/implementation",
            label: "מפת התהליך האינטראקטיבית",
            note: "התרשים החי חלק ממסך תכנית ההטמעה — תפר אינטגרציה עם W7-A; עד החיבור, המפה הטקסטואלית כאן היא המקור.",
          },
        ],
      },
    ],
  },
  {
    key: "quick-start",
    seedId: "tm-3",
    title: "Quick Start",
    description: "שלוש הפעולות הראשונות של כל משתמש/ת חדש/ה — עמוד ייעודי + גרסת הדפסה.",
    section: "חומרי קריאה",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5", "per-6"],
    ownerId: "u-noa",
    contentRoute: "/quick-start",
    printable: true,
    exportFormats: [...PRINT_EXPORT, "תצוגת מצגת"],
    relatedStageId: "is-2",
    relatedGateId: "sg-2",
    measurableOutcome: "משתמש/ת חדש/ה משלים/ה את שלוש הפעולות בפחות מ-10 דקות במפגש הראשון",
    practiceIncluded: true,
    qualityValidation: [
      "כל כפתור 'נסה זאת' מנווט לראוט אמיתי במערכת — נבדק בטסטים",
      "זמני הביצוע הם הערכות כתובות — טרם נמדדו מול משתמשים אמיתיים",
    ],
    initialStatus: "ממתין לבדיקה",
    sections: [
      {
        heading: "מה בעמוד",
        blocks: [
          {
            kind: "paragraph",
            text:
              "העמוד הייעודי מלווה כל משתמש/ת בשלוש פעולות: פתיחת לקוח או פנייה, בקשת סיכום " +
              "או המלצה מה-AI, ובדיקת ראיות ואישור. לכל פעולה: הדגמה, תוצאה צפויה, זמן " +
              "משוער, טעות נפוצה והערת בטיחות.",
          },
          {
            kind: "routeRef",
            route: "/quick-start",
            label: "התחלה מהירה ושימוש נכון",
            note: "העמוד החי — כולל תצוגת הדפסה A4 ותצוגת מצגת למפגשי הדרכה.",
          },
        ],
      },
    ],
  },
  {
    key: "correct-use-policy",
    seedId: "tm-4",
    title: "נוהל שימוש נכון",
    description: "מה מותר, מה חובה לבדוק ומה אסור — המדיניות המחייבת לעבודה עם ה-AI.",
    section: "חומרי קריאה",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5", "per-6"],
    ownerId: "u-tzachi",
    contentRoute: null,
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-4",
    relatedGateId: "sg-4",
    measurableOutcome: "אפס שליחות חיצוניות ללא אישור (נמדד מיומן הביקורת)",
    practiceIncluded: false,
    qualityValidation: [
      "הרשימות תואמות אחד-לאחד את מפרט המסך (SCREEN_SPECS פרק 16)",
      "הנוהל נאכף גם טכנית: פעולות רגישות עוברות דרך מרכז האישורים",
    ],
    initialStatus: "ממתין לבדיקה",
    sections: [
      {
        heading: "מותר — ללא אישור נוסף",
        blocks: [
          {
            kind: "bullets",
            items: [
              "לסכם מידע מאושר — סיכומי לידים, פגישות ופעילות מתוך הרשומות",
              "להכין טיוטה — טיוטת הודעה, טיוטת הצעה, טיוטת תשובה",
              "להציע פעולה — המלצת פולואו-אפ, התאמת מדפסת, קורס מתאים",
              "לחפש ידע — חיפוש במאגר הידע ובזיכרון הארגוני",
            ],
          },
        ],
      },
      {
        heading: "חובה לבדוק — לפני כל שימוש בתוצר",
        blocks: [
          {
            kind: "bullets",
            items: [
              "המלצה כספית — כל מספר כספי נבדק מול הרשומות לפני שמסתמכים עליו",
              "הצעת מחיר — מחירים, הנחות ותוקף נבדקים ידנית",
              "מידע טכני — מפרטי מדפסות וחומרים נבדקים מול הקטלוג",
              "הודעה חיצונית — כל נוסח שיוצא ללקוח נקרא ונערך על ידי אדם",
            ],
          },
          {
            kind: "note",
            tone: "warning",
            text: "כלל האצבע: אם התוצר יוצא מהמערכת החוצה או מזיז כסף — בודקים קודם.",
          },
        ],
      },
      {
        heading: "אסור — בשום מצב",
        blocks: [
          {
            kind: "bullets",
            items: [
              "לשלוח ללא אישור — שום הודעה לא יוצאת ללקוח בלי אישור אנושי",
              "להמציא מקור — אם ה-AI לא הציג ראיה, אין להשלים אותה מהדמיון",
              "לחשוף מידע רגיש — אין להדביק פרטי לקוחות בכלים חיצוניים",
              "לשנות הרשאה — הרשאות משתנות רק על ידי מנהלת המערכת",
              "לאשר הנחה — הנחות מאושרות רק על ידי גורם מוסמך, לא על ידי AI",
              "למחוק מידע — מחיקת רשומות היא פעולה מבוקרת ומתועדת",
            ],
          },
          {
            kind: "note",
            tone: "danger",
            text: "הפרת סעיפי ה'אסור' מטופלת כאירוע אבטחה — כולל תחקיר מול יומן הביקורת.",
          },
        ],
      },
    ],
  },
  {
    key: "prompt-library",
    seedId: "tm-5",
    title: "ספריית תרחישים ופרומפטים",
    description: "תרחישים אמיתיים מול הפקודות הקיימות במערכת — מה לבקש, מה לצפות, ממה להיזהר.",
    section: "חומרי קריאה",
    kind: "מדריך",
    audiencePersonaIds: ["per-2", "per-3", "per-4"],
    ownerId: "u-maya",
    contentRoute: null,
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-4",
    relatedGateId: "sg-4",
    measurableOutcome: "כל פרסונה מפעילה לפחות תרחיש אחד רלוונטי בשבוע הראשון",
    practiceIncluded: true,
    qualityValidation: [
      "כל תרחיש ממופה לפעולה קיימת של המנוע המקומי (LOCAL_OPERATIONS) — אין פקודה מומצאת",
      "התוצאות הצפויות נוסחו מול התנהגות המנוע בפועל",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "תרחישי סיכום",
        blocks: [
          {
            kind: "prompt",
            scenario: "פתיחת שבוע של צוות המכירות",
            promptHe: "סכם את הלידים שנוצרו בשבוע האחרון לפי סטטוס",
            operation: "summarize.weekly-leads",
            expectedOutcome: "ספירה מדויקת לפי סטטוס + רשימת הלידים כראיות — לא טקסט חופשי",
            caution: "הסיכום מכסה רק את מה שנרשם במערכת; ליד שלא הוקלד לא ייספר",
          },
          {
            kind: "prompt",
            scenario: "הכנה ליום עבודה",
            promptHe: "מה הפגישות המתוכננות הקרובות?",
            operation: "summarize.meetings",
            expectedOutcome: "רשימת פגישות עתידיות ממוינת לפי תאריך, עם משך ומיקום",
            caution: "פגישות שנקבעו מחוץ למערכת לא יופיעו",
          },
        ],
      },
      {
        heading: "תרחישי סיווג והמלצה",
        blocks: [
          {
            kind: "prompt",
            scenario: "ליד חדש נכנס ולא ברור מה הוא רוצה",
            promptHe: "סווג את הליד הזה — מה הכוונה ומה הדחיפות?",
            operation: "classify.lead-intent",
            expectedOutcome: "כוונה (רכישה/לימודים/שירות/הצעה) + דחיפות + הכלל שנורה",
            caution: "הסיווג מבוסס מילות מפתח — ניסוח חריג עלול לקבל 'בירור כללי'",
          },
          {
            kind: "prompt",
            scenario: "לקוח מבקש המלצת מדפסת",
            promptHe: "התאם מדפסת לשימוש אב-טיפוס, חומרים PLA+PETG, נפח בינוני, תקציב 8000",
            operation: "recommend.printer-match",
            expectedOutcome: "עד 3 דגמים מהקטלוג עם ניקוד כללים, התאמות ומגבלות",
            caution: "הניקוד הוא כלל עסקי — לא הסתברות; ההחלטה הסופית עם הלקוח",
          },
          {
            kind: "prompt",
            scenario: "ליד שקט כבר שבוע",
            promptHe: "הכן טיוטת פולואו-אפ לליד",
            operation: "recommend.follow-up",
            expectedOutcome: "טיוטת הודעה שנכנסת למרכז האישורים — לא נשלחת לבד",
            caution: "חובה לערוך ולאשר לפני שליחה — זו טיוטה מתבנית, לא נוסח סופי",
          },
          {
            kind: "prompt",
            scenario: "לקוח קיים שאפשר להצמיח",
            promptHe: "אילו קורסים פתוחים מתאימים ללקוח שעוד לא לקח?",
            operation: "recommend.course-fit",
            expectedOutcome: "עד 3 קורסים פתוחים שהלקוח לא רשום אליהם, לפי מועד התחלה",
            caution: "ההתאמה לפי היסטוריית קורסים בלבד — בלי ניתוח צרכים מעמיק",
          },
        ],
      },
      {
        heading: "תרחיש הסבר ובקרה",
        blocks: [
          {
            kind: "prompt",
            scenario: "לא ברור למה ה-AI המליץ מה שהמליץ",
            promptHe: "הסבר את ההמלצה — על מה היא מבוססת?",
            operation: "explain.recommendation",
            expectedOutcome: "הנימוק + כל רשומות הראיה המקושרות; אם אין ראיות — נאמר במפורש",
            caution: "אם ההסבר לא משכנע — לא מאשרים. זה בדיוק תפקיד הבדיקה האנושית",
          },
        ],
      },
    ],
  },
  {
    key: "faq-objections",
    seedId: "tm-6",
    title: "FAQ והתנגדויות",
    description: "שבע ההתנגדויות הנפוצות + מענה LACE מלא — עמוד עבודה ייעודי עם סימולטור.",
    section: "חומרי קריאה",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5"],
    ownerId: "u-tzachi",
    contentRoute: "/faq",
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-6",
    relatedGateId: "sg-6",
    measurableOutcome: "לכל התנגדות יש מענה LACE, ראיות תומכות ובעלים — ללא חורים",
    practiceIncluded: true,
    qualityValidation: [
      "שבע ההתנגדויות מהמפרט מכוסות במלואן — נבדק בטסט",
      "הסימולטור דטרמיניסטי ומסומן ככזה — אין טענת דיוק אימון",
    ],
    initialStatus: "ממתין לבדיקה",
    sections: [
      {
        heading: "מה בעמוד",
        blocks: [
          {
            kind: "paragraph",
            text:
              "סביבת עבודה להתנגדויות: לכל התנגדות — מה נאמר, החשש שמתחת, הפרסונה, " +
              "הסיכון, מענה LACE בעברית טבעית, ראיות תומכות, בעלים ושאלת המשך. בנוסף " +
              "סימולטור שיחה דטרמיניסטי לתרגול הניסוח.",
          },
          {
            kind: "routeRef",
            route: "/faq",
            label: "FAQ והתנגדויות",
            note: "עמוד העבודה החי — כולל סימולטור השיחה.",
          },
        ],
      },
    ],
  },
  {
    key: "risk-governance",
    seedId: "tm-7",
    title: "Risk & Governance Sheet",
    description: "הסיכונים המרכזיים של הטמעת ה-AI והבקרות הממשיות שקיימות מולם במערכת.",
    section: "חומרי קריאה",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-5"],
    ownerId: "u-noa",
    contentRoute: "/governance",
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-4",
    relatedGateId: "sg-4",
    measurableOutcome: "לכל סיכון פתוח יש בקרה ממופה ובעלים",
    practiceIncluded: false,
    qualityValidation: [
      "כל בקרה שמצוינת קיימת בפועל במערכת (מרכז אישורים, יומן ביקורת, מעטפת ראיות)",
      "אין הבטחת 'אפס סיכון' — מוצג מה מכוסה ומה נשאר באחריות אנושית",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "סיכונים ובקרות",
        blocks: [
          {
            kind: "bullets",
            title: "סיכון 1 — המלצה שגויה (הזיה)",
            items: [
              "בקרה: כל המלצה מחויבת בראיות מרשומות אמיתיות; אין ראיה — אין המלצה",
              'בקרה: רמת ביטחון כנה — "טרם נמדד" במקום מספר מומצא',
              "שארית סיכון: ניסוח מטעה — מטופל בנוהל 'חובה לבדוק'",
            ],
          },
          {
            kind: "bullets",
            title: "סיכון 2 — שליחה לא מבוקרת ללקוח",
            items: [
              "בקרה: כל טיוטת הודעה נעצרת במרכז האישורים (approval.required=true)",
              "בקרה: יומן ביקורת מלא עם מזהה מתאם לכל פעולה",
              "שארית סיכון: העתקה ידנית של טיוטה החוצה — מטופל בנוהל 'אסור'",
            ],
          },
          {
            kind: "bullets",
            title: "סיכון 3 — חשיפת מידע רגיש",
            items: [
              "בקרה: המנוע המקומי רץ ללא רשת — הנתונים לא עוזבים את המערכת",
              "בקרה: ספק חיצוני עובר דרך שכבת שרת עם עקרון הצמצום",
              "שארית סיכון: הדבקת מידע בכלים חיצוניים — נוהל 'אסור' + הדרכה",
            ],
          },
          {
            kind: "bullets",
            title: "סיכון 4 — אמון-יתר או אמון-חסר",
            items: [
              "בקרה: מעטפת אחידה (המלצה/נימוק/ראיות/מגבלות) מלמדת קריאה ביקורתית",
              "בקרה: Microlearning 'איך בודקים המלצת AI לפני אישור' (90 שניות)",
              "שארית סיכון: שחיקת בדיקה עם הזמן — פגישת רענון חודשית",
            ],
          },
        ],
      },
      {
        heading: "אחריות וממשל",
        blocks: [
          {
            kind: "bullets",
            items: [
              'אישור פעולות רגישות: המנכ"ל או מי שהוסמך במפורש',
              "ניהול הרשאות ותצורה: מנהלת המערכת בלבד",
              "בדיקה תקופתית של יומן הביקורת: אחת לשבוע בשגרה",
              "כל חריגה מהנוהל מתועדת ונדונה בפגישת השגרה",
            ],
          },
          {
            kind: "routeRef",
            route: "/governance",
            label: "ממשל ובקרת AI",
            note: "מסך הממשל החי — סיכונים, בקרות ויומן הביקורת.",
          },
        ],
      },
    ],
  },
  // =========================================================================
  // Section B — חומרי הוראה ותרגול (6)
  // =========================================================================
  {
    key: "training-script",
    seedId: "tm-8",
    title: "תסריט הדרכה",
    description: "תסריט מפגש ההדרכה המלא — 10 דקות, מתוזמן דקה-דקה, כולל שני דמואים חיים.",
    section: "חומרי הוראה ותרגול",
    kind: "מדריך",
    audiencePersonaIds: ["per-3"],
    ownerId: "u-oren",
    contentRoute: null,
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-6",
    relatedGateId: "sg-6",
    measurableOutcome: "המפגש נמסר בפועל בתוך 12 דקות לכל היותר, כולל תרגול",
    practiceIncluded: true,
    qualityValidation: [
      "התזמונים מסתכמים ל-600 שניות בדיוק — נבדק בטסט",
      "שני הדמואים מבוצעים על מסכים קיימים בלבד (/customers, /agents)",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "מהלך המפגש (10:00 דקות)",
        blocks: [
          {
            kind: "timed",
            label: "פתיחה",
            fromSec: 0,
            toSec: 60,
            text:
              '"ערב טוב. ב-10 הדקות הקרובות תראו איך המערכת החדשה חוסכת לכם עבודה — ' +
              'ולמה אף פעולה רגישה לא קורית בלי אישור שלכם." להציג את מסך מרכז הפיקוד ' +
              "ולשאול: מי כבר פתח את המערכת?",
          },
          {
            kind: "timed",
            label: "הבעיה והפתרון",
            fromSec: 60,
            toSec: 150,
            text:
              "לספר את סיפור הליד שנפל בין הכיסאות (דוגמה אמיתית מהצוות אם יש). " +
              "להראות איך כל הישויות — לקוחות, לידים, הצעות, קורסים, שירות — חיות היום " +
              "במסך אחד. משפט מפתח: 'המערכת זוכרת בשבילכם, אתם מחליטים בשבילה'.",
          },
          {
            kind: "timed",
            label: "דמו 1 — פתיחת לקוח ובקשת סיכום",
            fromSec: 150,
            toSec: 270,
            text:
              "לפתוח את מסך הלקוחות, להיכנס לכרטיס לקוח, להראות את תמונת ה-360. " +
              "לבקש מה-AI סיכום שבועי של הלידים ולהראות שהתשובה מגיעה עם ראיות — " +
              "כל ליד שנספר מופיע ברשימה. להדגיש: אין ראיה = אין טענה.",
          },
          {
            kind: "timed",
            label: "דמו 2 — בדיקת ראיות ואישור",
            fromSec: 270,
            toSec: 390,
            text:
              "לבקש טיוטת פולואו-אפ לליד ולהראות שהיא נעצרת במרכז האישורים. " +
              "לעבור יחד על ההמלצה, הנימוק, הראיות והמגבלות. לערוך מילה בטיוטה, " +
              "לאשר, ולהראות את הרישום ביומן הביקורת. משפט מפתח: 'שום דבר לא " +
              "נשלח בלעדיכם'.",
          },
          {
            kind: "timed",
            label: "כללי שימוש נכון",
            fromSec: 390,
            toSec: 480,
            text:
              "לעבור על שלושת הטורים: מותר (לסכם, להכין טיוטה, להציע, לחפש) · " +
              "חובה לבדוק (כספים, הצעות מחיר, מידע טכני, הודעות חיצוניות) · אסור " +
              "(לשלוח בלי אישור, להמציא מקור, לחשוף מידע, לשנות הרשאה, לאשר הנחה, " +
              "למחוק). לחלק את דף ה-Quick Start המודפס.",
          },
          {
            kind: "timed",
            label: "תרגול קצר",
            fromSec: 480,
            toSec: 540,
            text:
              "כל משתתף/ת מבצע/ת את פעולה 1 מה-Quick Start על המחשב שלו/ה: לפתוח " +
              "לקוח ולקרוא את תמונת ה-360. המדריך עובר בין העמדות ועוזר.",
          },
          {
            kind: "timed",
            label: "סיכום ושאלות",
            fromSec: 540,
            toSec: 600,
            text:
              "לחזור על שלוש הפעולות של ה-Quick Start, להזכיר את עמוד ה-FAQ " +
              "ואת מסלול התמיכה (Tier 1-3). לסיים בשאלה פתוחה: 'מה הדבר הראשון " +
              "שתנסו מחר בבוקר?'",
          },
        ],
      },
      {
        heading: "הערות למדריך",
        blocks: [
          {
            kind: "bullets",
            items: [
              "אם דמו נכשל — לא לאלתר הצלחה; להראות איך המערכת מדווחת כשל בכנות",
              "התנגדויות שעולות במפגש נרשמות ומועברות לעמוד ה-FAQ עם בעלים",
              "לא להבטיח פיצ'רים עתידיים — מדברים רק על מה שקיים",
            ],
          },
        ],
      },
    ],
  },
  {
    key: "training-presentation",
    seedId: "tm-9",
    title: "מצגת הדרכה",
    description: "שלד המצגת למפגש ההדרכה — פרקים, מסרים ונקודות דמו לכל שקף.",
    section: "חומרי הוראה ותרגול",
    kind: "מצגת",
    audiencePersonaIds: ["per-3", "per-1"],
    ownerId: "u-oren",
    contentRoute: "/submission/presentation",
    printable: true,
    exportFormats: [...PRINT_EXPORT, "תצוגת מצגת"],
    relatedStageId: "is-6",
    relatedGateId: "sg-6",
    measurableOutcome: "המצגת מכסה את כל פרקי התסריט ללא שקף יתום",
    practiceIncluded: false,
    qualityValidation: [
      "המצגת הקנונית של ההגשה היא HTML במסך המצגת (W7-C) — כאן שלד התוכן ההדרכתי",
      "כל שקף ממופה לקטע בתסריט ההדרכה (חומר מס' 8)",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "מבנה השקפים",
        blocks: [
          {
            kind: "steps",
            items: [
              "שקף 1 — פתיחה: 'המערכת זוכרת בשבילכם, אתם מחליטים בשבילה' (0:00-1:00)",
              "שקף 2 — הבעיה: חמשת הכאבים של היום, בשפת הצוות (1:00-2:30)",
              "שקף 3 — דמו חי 1: לקוח 360 + סיכום עם ראיות — מעבר למערכת (2:30-4:30)",
              "שקף 4 — דמו חי 2: טיוטה → מרכז האישורים → יומן ביקורת (4:30-6:30)",
              "שקף 5 — כללי שימוש נכון: מותר / חובה לבדוק / אסור (6:30-8:00)",
              "שקף 6 — תרגול: פעולה 1 מה-Quick Start על כל עמדה (8:00-9:00)",
              "שקף 7 — סיכום: שלוש הפעולות + לאן פונים (FAQ, תמיכה) (9:00-10:00)",
            ],
          },
          {
            kind: "routeRef",
            route: "/submission/presentation",
            label: "מסך המצגת",
            note: "מסך המצגת הקנוני (HTML) בבעלות W7-C — תפר אינטגרציה; שלד התוכן כאן הוא מקור השקפים ההדרכתיים.",
          },
        ],
      },
    ],
  },
  {
    key: "microlearning-videos",
    seedId: "tm-10",
    title: "סרטוני Microlearning",
    description: "קונספט ותסריט Microlearning — 90 שניות: איך בודקים המלצת AI לפני אישור.",
    section: "חומרי הוראה ותרגול",
    kind: "וידאו",
    audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5", "per-6"],
    ownerId: "u-oren",
    contentRoute: "/training-materials",
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-6",
    relatedGateId: "sg-6",
    measurableOutcome: "צופה עונה נכון על שאלות ההצלחה של כל מקטע",
    practiceIncluded: true,
    qualityValidation: [
      "זהו קונספט ותסריט בלבד — לא הופק וידאו; התיוג נבדק בטסט",
      "ששת המקטעים מסתכמים ל-90 שניות בדיוק — נבדק בטסט",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "הקונספט",
        blocks: [
          {
            kind: "paragraph",
            text:
              "סרטון ראשון בסדרה: 'איך בודקים המלצת AI לפני אישור' — 6 מקטעים, 90 " +
              "שניות. התסריט המלא (סטוריבורד, קריינות, טקסט מסך, פעולת מסך ושאלת הצלחה " +
              "לכל מקטע) מוצג בתצוגה המקדימה של החומר במרכז חומרי ההדרכה.",
          },
          {
            kind: "note",
            tone: "warning",
            text: "סטטוס הפקה כן: קונספט ותסריט Microlearning בלבד — וידאו טרם הופק.",
          },
        ],
      },
    ],
  },
  {
    key: "hands-on-exercises",
    seedId: "tm-11",
    title: "תרגילי Hands-on",
    description: "ארבעה תרגילים מודרכים על המסכים האמיתיים — כל תרגיל עם קריטריון הצלחה בדיק.",
    section: "חומרי הוראה ותרגול",
    kind: "תרגול",
    audiencePersonaIds: ["per-2", "per-3", "per-4", "per-6"],
    ownerId: "u-oren",
    contentRoute: null,
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-2",
    relatedGateId: "sg-2",
    measurableOutcome: "כל מתאמן/ת משלים/ה לפחות את תרגילים 1-2 עם קריטריון ההצלחה",
    practiceIncluded: true,
    qualityValidation: [
      "כל תרגיל רץ על ראוט קיים במערכת — אין מסך מומצא",
      "קריטריוני ההצלחה נבדקים ברשומות (פעילות/רשומה שנוצרה), לא בהתרשמות",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "תרגיל 1 — ליד חדש מקצה לקצה (מכירות)",
        blocks: [
          {
            kind: "steps",
            items: [
              "היכנסו למסך ה-CRM ופתחו ליד חדש עם שם ותחום עניין אמיתיים",
              "בקשו סיווג כוונה ודחיפות וקראו את הכלל שנורה",
              "קבעו פולואו-אפ ובדקו שהליד מופיע ברשימה עם הסטטוס הנכון",
            ],
          },
          {
            kind: "routeRef",
            route: "/crm",
            label: "מסך ה-CRM",
            note: "קריטריון הצלחה: הליד קיים ברשימה עם סטטוס וסיווג.",
          },
        ],
      },
      {
        heading: "תרגיל 2 — קריאת כרטיס לקוח 360",
        blocks: [
          {
            kind: "steps",
            items: [
              "פתחו את רשימת הלקוחות ובחרו לקוח קיים",
              "אתרו בכרטיס: מדפסות, קורסים, קריאות שירות ופעילות אחרונה",
              "ענו: מה הפעולה הבאה הנכונה מול הלקוח הזה, ולמה?",
            ],
          },
          {
            kind: "routeRef",
            route: "/customers",
            label: "מסך הלקוחות",
            note: "קריטריון הצלחה: תשובה שמסתמכת על נתון אמיתי מהכרטיס.",
          },
        ],
      },
      {
        heading: "תרגיל 3 — בדיקת המלצה ואישור (מתקדם)",
        blocks: [
          {
            kind: "steps",
            items: [
              "בקשו טיוטת פולואו-אפ לליד קיים",
              "במרכז האישורים: קראו את הנימוק, הראיות והמגבלות",
              "ערכו את הנוסח, אשרו, ואתרו את הרישום ביומן",
            ],
          },
          {
            kind: "routeRef",
            route: "/agents",
            label: "סוכני AI ומרכז האישורים",
            note: "קריטריון הצלחה: האישור נרשם עם העריכה שלכם — לא הנוסח המקורי.",
          },
        ],
      },
      {
        heading: "תרגיל 4 — פתיחת קריאת שירות (תמיכה)",
        blocks: [
          {
            kind: "steps",
            items: [
              "פתחו פניית תמיכה חדשה עם תיאור אמיתי",
              "בדקו לאיזה Tier היא נכנסה ומה ה-SLA",
              "סגרו אותה עם תיעוד פתרון וצפו ברשומת הידע שנוצרה",
            ],
          },
          {
            kind: "routeRef",
            route: "/support",
            label: "מסך התמיכה",
            note: "קריטריון הצלחה: הפנייה סגורה עם פתרון מתועד.",
          },
        ],
      },
    ],
  },
  {
    key: "support-doc",
    seedId: "tm-12",
    title: "מסמך תמיכה ותקלות",
    description: "לאן פונים כשמשהו לא עובד — שלושת השלבים, ה-SLA ואיך פותחים פנייה.",
    section: "חומרי הוראה ותרגול",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5", "per-6"],
    ownerId: "u-ran",
    contentRoute: "/support",
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-6",
    relatedGateId: "sg-6",
    measurableOutcome: "כל פנייה נפתחת ב-Tier הנכון ונסגרת בתוך ה-SLA",
    practiceIncluded: false,
    qualityValidation: [
      "המודל התלת-שלבי ממומש בפועל במסך התמיכה — התוכן תואם את המערכת",
      "יעדי SLA הם המדיניות המוצהרת — עמידה בפועל נמדדת במסך, לא כאן",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "שלושת שלבי התמיכה",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Tier 1 — שירות עצמי: FAQ, מאגר ידע, סוכן פנימי · SLA: מיידי",
              "Tier 2 — Champions: צ'אט ייעודי, תמיכת עמיתים · SLA: שעתיים",
              "Tier 3 — מיישם AI + IT + Compliance: נושאים מורכבים · SLA: יום עבודה",
            ],
          },
          {
            kind: "steps",
            title: "איך פותחים פנייה",
            items: [
              "בדקו קודם ב-FAQ ובמאגר הידע — רוב התשובות שם",
              "לא נפתר? פתחו פנייה במסך התמיכה עם תיאור מדויק של מה ניסיתם",
              "הפנייה מקוטלגת אוטומטית; עקבו אחרי ה-SLA במסך",
              "בסגירה — דרגו את הפתרון; הפתרון הופך לרשומת ידע לכולם",
            ],
          },
          {
            kind: "routeRef",
            route: "/support",
            label: "תמיכה לאחר ההשקה",
            note: "מסך התמיכה החי — תור הפניות, SLA והסלמות.",
          },
        ],
      },
    ],
  },
  {
    key: "adoption-dashboard",
    seedId: "tm-13",
    title: "דשבורד אימוץ",
    description: "אילו מדדי אימוץ נמדדים, איפה רואים אותם, ומה עדיין כנה 'טרם נמדד'.",
    section: "חומרי הוראה ותרגול",
    kind: "מדריך",
    audiencePersonaIds: ["per-1", "per-5"],
    ownerId: "u-noa",
    contentRoute: "/analytics",
    printable: true,
    exportFormats: PRINT_EXPORT,
    relatedStageId: "is-6",
    relatedGateId: "sg-6",
    measurableOutcome: "לכל מדד אימוץ יש הגדרה, מקור נתונים ותדירות מדידה",
    practiceIncluded: false,
    qualityValidation: [
      "המדדים מפנים להגדרות המדדים הקנוניות (metricDefinitions, 3 רמות)",
      "אין ערך מומצא — מדד ללא תצפית מוצג 'טרם נמדד'",
    ],
    initialStatus: "טיוטה",
    sections: [
      {
        heading: "שלוש רמות המדידה",
        blocks: [
          {
            kind: "bullets",
            items: [
              "מדדי הדרכה: השלמת מפגשים, השלמת תרגילי Hands-on, מענה על שאלות ההצלחה",
              "מדדי אימוץ: כניסות שבועיות למערכת, שימוש בפקודות AI, פניות Tier 1 לעומת Tier 3",
              "מדדי ערך עסקי: לידים ללא פולואו-אפ שנופל, זמן הכנת הצעה, זמן סגירת קריאה",
            ],
          },
          {
            kind: "note",
            tone: "warning",
            text:
              "כלל הכנות: קו בסיס שלא נמדד לפני ההטמעה מסומן 'לא הוגדר קו בסיס'; " +
              "מדד ללא תצפיות מוצג 'טרם נמדד' — לעולם לא 0 ולא אחוז מומצא.",
          },
          {
            kind: "routeRef",
            route: "/analytics",
            label: "דוחות וניתוחים",
            note: "המדדים הנמדדים בפועל מוצגים במסך הדוחות מתוך תצפיות אמיתיות בלבד.",
          },
        ],
      },
    ],
  },
];

/** convenience lookup */
export function canonicalMaterialByKey(key: CanonicalMaterialKey): CanonicalMaterialDef {
  const def = CANONICAL_MATERIALS.find((m) => m.key === key);
  if (!def) throw new Error(`חומר קנוני לא מוכר: ${key}`);
  return def;
}
