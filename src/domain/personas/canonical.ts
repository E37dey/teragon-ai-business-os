// W7-B — the EXACTLY-7 canonical persona definitions (Phase 7.4) and the
// mandated training-programme table (Phase 7.5).
//
// Content sources (read-only donors, rewritten as typed records):
// - docs/SCREEN_SPECS_HE.md chapter 13 — the 7 canonical names + card fields.
// - teragon-final/docs/training/השלמת_חבילת_הטמעה_טרגון.docx — the V4
//   7-persona matrix (interest / duration / main material / success metric).
// - teragon-final/docs/training/חבילת_הטמעה_מערכת_טרגון.docx — the 5 LACE
//   objections and the usage policy (מותר/HITL/אסור).
//
// LEAD DECISION on contradiction C1 (two 7-persona taxonomies): the brief's
// ADOPTION set is canonical. The 7 seeded records keep their ids for
// stability, mapped 1:1 BY ORDER (per-1 ← משתמש קצה … per-7 ← המתנגד), but
// their name/role/content are REPLACED by the canonical adoption personas.
// The old seed name survives only in `legacyName` (honest provenance).
// The two taxonomies are never blended.
import { dt } from "@/repositories/seed/seedData";
import type { CanonicalPersonaName, PersonaV2 } from "./types";

/** honest notes used across the module — single source, tested verbatim */
export const NO_NUMERIC_TARGET = "לא הוגדר יעד מספרי";
export const NOT_MEASURED = "טרם נמדד";

/**
 * The mandated programme per canonical persona (Phase 7.5) — format and
 * duration are EXACT per the wave spec:
 * סדנה+Microlearning 60ד' / תדריך ניהולי 45ד' / תדריך מנהלים 20ד' /
 * מפגש טכני 60ד' / מפגש ממשל 60ד' / סדנה מתקדמת 90ד' / שיחה ממוקדת 30ד'.
 */
export const TRAINING_PROGRAMMES: Record<
  CanonicalPersonaName,
  { format: string; durationMinutes: number }
> = {
  "משתמש קצה": { format: "סדנה + Microlearning", durationMinutes: 60 },
  "מנהל צוות": { format: "תדריך ניהולי", durationMinutes: 45 },
  הנהלה: { format: "תדריך מנהלים", durationMinutes: 20 },
  "IT / אבטחת מידע": { format: "מפגש טכני", durationMinutes: 60 },
  "Legal / Compliance": { format: "מפגש ממשל", durationMinutes: 60 },
  "Champion · השגריר": { format: "סדנה מתקדמת", durationMinutes: 90 },
  המתנגד: { format: "שיחה ממוקדת", durationMinutes: 30 },
};

/**
 * `updatedAt` snapshot of a seeded training material (seedData meta(off) ⇒
 * updatedAt = dt(off, 16)). Pinned per material so the auditor can detect a
 * material that was edited AFTER the persona version was approved.
 */
function tmStamp(off: number): string {
  return dt(off, 16);
}
export const MATERIAL_EXPECTED_UPDATED_AT: Record<string, string> = {
  "tm-1": tmStamp(-25),
  "tm-2": tmStamp(-25),
  "tm-3": tmStamp(-25),
  "tm-4": tmStamp(-24),
  "tm-5": tmStamp(-24),
  "tm-6": tmStamp(-22),
  "tm-7": tmStamp(-22),
  "tm-8": tmStamp(-20),
  "tm-9": tmStamp(-20),
  "tm-10": tmStamp(-18),
  "tm-11": tmStamp(-16),
  "tm-12": tmStamp(-14),
  "tm-13": tmStamp(-12),
};

function link(materialId: string, role: "ראשי" | "משלים") {
  const expectedUpdatedAt = MATERIAL_EXPECTED_UPDATED_AT[materialId];
  if (!expectedUpdatedAt) throw new Error(`חומר הדרכה לא מוכר: ${materialId}`);
  return { materialId, role, expectedUpdatedAt };
}

/** C1 migration record: seed id → (legacy name → canonical lane), 1:1 by order */
export const SEED_BRIDGE_NOTES: Record<string, string> = {
  "per-1": 'הוחלף (C1): "המנכ"ל המתזמר" ← משתמש קצה — מיפוי 1:1 לפי סדר, השם הישן נשמר ב-legacyName.',
  "per-2": 'הוחלף (C1): "אשת המכירות" ← מנהל צוות — מיפוי 1:1 לפי סדר.',
  "per-3": 'הוחלף (C1): "המדריך" ← הנהלה — מיפוי 1:1 לפי סדר.',
  "per-4": 'הוחלף (C1): "איש התמיכה" ← IT / אבטחת מידע — מיפוי 1:1 לפי סדר.',
  "per-5": 'הוחלף (C1): "מנהלת המערכת" ← Legal / Compliance — מיפוי 1:1 לפי סדר.',
  "per-6": 'הוחלף (C1): "התלמידה" ← Champion · השגריר — מיפוי 1:1 לפי סדר.',
  "per-7": 'הוחלף (C1): "השותף החיצוני" ← המתנגד — מיפוי 1:1 לפי סדר.',
};

/**
 * The EXACTLY-7 canonical PersonaV2 records, ordered per-1..per-7 (the
 * brief's adoption order). Ids are the SEED persona ids; content is the
 * canonical adoption content (C1 — taxonomies never blended).
 */
export const PERSONA_V2_DEFINITIONS: readonly PersonaV2[] = [
  {
    id: "per-1",
    name: "משתמש קצה",
    legacyName: 'המנכ"ל המתזמר',
    role: "משתמש/ת קצה — תפעול יומי",
    businessContext:
      "מי שכל יום העבודה שלו עובר דרך המערכת: לידים, הצעות, קריאות. המעבר מוואטסאפ וממעקב ידני לעבודה מתוך המערכת הוא שינוי ההרגל הגדול ביותר בהטמעה.",
    primaryQuestion: "כמה זמן זה יחסוך לי — ומה קורה אם אני טועה מול לקוח?",
    desiredValue: "חיסכון זמן ופשטות: אפס לידים שנופלים, הצעות מהירות.",
    adoptionBarrier:
      "חוסר זמן ללמידה באמצע יום עבודה + פחד להסתמך על טיוטת AI מול לקוח אמיתי.",
    currentKnowledge: "שולט בתהליך הידני (וואטסאפ/טלפון); לא עבד עם CRM או עם סוכני AI.",
    requiredKnowledge: "זרימת ליד→הצעה→שליחה, מרכז האישורים, קריאת % ביטחון של סיווג.",
    requiredAbility: "לקלוט ליד, להפיק הצעת מחיר ולשלוח לאישור — בלי עזרה.",
    trainingObjective: "ביצוע עצמאי של תהליך ליבה מלא (ליד → הצעה → שליחה לאישור).",
    trainingFormat: TRAINING_PROGRAMMES["משתמש קצה"].format,
    durationMinutes: TRAINING_PROGRAMMES["משתמש קצה"].durationMinutes,
    exercise: "סימולציה מלאה: קליטת ליד חדש → בניית הצעת מחיר → שליחה לאישור אנושי.",
    successMetric: {
      description: "השלמת משימות ליבה בסימולציה",
      numericTarget: 80,
      unit: "%",
      targetNote: "יעד מהמפרט: 80% השלמת משימות בסימולציה",
      measuredValue: null,
      measuredNote: NOT_MEASURED,
    },
    supportingMaterials: [link("tm-2", "ראשי"), link("tm-3", "משלים"), link("tm-6", "משלים")],
    namedOwner: { userId: "u-oren", name: "אורן שגב" },
    supportTier: 1,
    objections: ["obj-1", "obj-2"],
    approvalState: "מאושר",
    version: 1,
  },
  {
    id: "per-2",
    name: "מנהל צוות",
    legacyName: "אשת המכירות",
    role: "ניהול ביניים — אחריות על צוות",
    businessContext:
      "אחראי שהצוות שלו עובד נכון מתוך המערכת: מאשר שלבים, עוקב אחר התקדמות ומזהה מי תקוע — במקום טבלאות פרטיות.",
    primaryQuestion: "איך אני יודע שהצוות שלי באמת עובד מתוך המערכת — ומי תקוע?",
    desiredValue: "שימוש נכון בצוות: לראות מי תקוע ולאשר שלבים מהר.",
    adoptionBarrier: "מעקב התקדמות ידני מושרש — הרגל לנהל את הצוות בטבלאות ובראש.",
    currentKnowledge: "מכיר את תהליכי הצוות; לא עבד עם דשבורד אימוץ או אישורים דיגיטליים.",
    requiredKnowledge: "מסך האישורים, דוח התקדמות שבועי, זיהוי חבר צוות חסום.",
    requiredAbility: "להפיק דוח שבועי ולאשר/להחזיר שלב עם נימוק — מתוך המערכת בלבד.",
    trainingObjective: "ניהול מחזור אישורים מלא ומעקב צוות שבועי מתוך המערכת.",
    trainingFormat: TRAINING_PROGRAMMES["מנהל צוות"].format,
    durationMinutes: TRAINING_PROGRAMMES["מנהל צוות"].durationMinutes,
    exercise: "תרגול: הפקת דוח התקדמות שבועי + אישור שלב לחבר צוות + החזרת שלב עם נימוק.",
    successMetric: {
      description: "דוח שבועי תקין המופק מתוך המערכת",
      numericTarget: null,
      unit: null,
      targetNote: NO_NUMERIC_TARGET,
      measuredValue: null,
      measuredNote: NOT_MEASURED,
    },
    supportingMaterials: [link("tm-4", "ראשי"), link("tm-6", "משלים")],
    namedOwner: { userId: "u-tzachi", name: "צחי זוסטייהם" },
    supportTier: 2,
    objections: ["obj-6"],
    approvalState: "מאושר",
    version: 1,
  },
  {
    id: "per-3",
    name: "הנהלה",
    legacyName: "המדריך",
    role: "הנהלה בכירה — החלטות הרחבה",
    businessContext:
      "רואה הכול ממרכז הפיקוד, מאשרת פעולות AI רגישות ומחליטה על הרחבת ההטמעה על בסיס ערך מול סיכון.",
    primaryQuestion: "מה הערך העסקי ומה הסיכון — והאם להרחיב?",
    desiredValue: "תמונת מצב אחת אמינה + שליטה מלאה בפעולות AI.",
    adoptionBarrier: "חשש מאובדן שליטה על פעולות AI אוטומטיות מול לקוחות.",
    currentKnowledge: "מכירה את העסק לעומק; רגילה להחליט מתחושה ומשיחות, לא מדוחות מערכת.",
    requiredKnowledge: "קריאת KPI במרכז הפיקוד, מרכז האישורים, דוחות והסברם עד רמת הרשומה.",
    requiredAbility: "לקבל החלטת Go/No-Go מנומקת על בסיס דוח ולא על תחושה.",
    trainingObjective: "קבלת החלטת הרחבה מבוססת-ראיות מתוך הדוחות ומרכז האישורים.",
    trainingFormat: TRAINING_PROGRAMMES["הנהלה"].format,
    durationMinutes: TRAINING_PROGRAMMES["הנהלה"].durationMinutes,
    exercise: "תרגול החלטה: קריאת דוח תקופתי + סימולציית החלטת Go/No-Go מנומקת בכתב.",
    successMetric: {
      description: "החלטת הרחבה (Go/No-Go) מתועדת ומבוססת דוח",
      numericTarget: null,
      unit: null,
      targetNote: NO_NUMERIC_TARGET,
      measuredValue: null,
      measuredNote: NOT_MEASURED,
    },
    supportingMaterials: [link("tm-1", "ראשי"), link("tm-7", "משלים"), link("tm-11", "משלים")],
    namedOwner: { userId: "u-oren", name: "אורן שגב" },
    supportTier: 3,
    objections: ["obj-4"],
    approvalState: "מאושר",
    version: 1,
  },
  {
    id: "per-4",
    name: "IT / אבטחת מידע",
    legacyName: "איש התמיכה",
    role: "IT ואבטחת מידע",
    businessContext:
      "שומרי הסף של מי רואה מה ומה סוכן רשאי לעשות: תצורה, הרשאות, ניטור ויומן ביקורת.",
    primaryQuestion: "מי רואה מה, מה סוכן רשאי לבצע, ואיך עוקבים אחרי זה?",
    desiredValue: "מערכת יציבה עם בקרה מלאה ושקיפות בפעולות אוטומטיות.",
    adoptionBarrier: "חוסר שקיפות נתפס בפעולות אוטומטיות — חשש מ'קופסה שחורה' ללא יומן.",
    currentKnowledge: "שולט בתשתית ובהרשאות; טרם עבד עם יומן ביקורת של סוכני AI.",
    requiredKnowledge: "מודל ההרשאות (RBAC), הגדרות סוכנים, יומן הביקורת וזיכרון ארגוני.",
    requiredAbility: "להגדיר תפקיד חדש עם הרשאות מדויקות ולאתר פעולה ביומן הביקורת.",
    trainingObjective: "שליטה מלאה במודל ההרשאות וביכולת שחזור פעולה מיומן הביקורת.",
    trainingFormat: TRAINING_PROGRAMMES["IT / אבטחת מידע"].format,
    durationMinutes: TRAINING_PROGRAMMES["IT / אבטחת מידע"].durationMinutes,
    exercise: "מעבדה: הקמת תפקיד חדש עם הרשאות + איתור פעולת סוכן ספציפית ביומן הביקורת.",
    successMetric: {
      description: "נוהל הרשאות (SLA) מוגדר ומתועד",
      numericTarget: null,
      unit: null,
      targetNote: NO_NUMERIC_TARGET,
      measuredValue: null,
      measuredNote: NOT_MEASURED,
    },
    supportingMaterials: [link("tm-9", "ראשי"), link("tm-8", "משלים")],
    namedOwner: { userId: "u-noa", name: "נעה פרידמן" },
    supportTier: 3,
    objections: ["obj-7"],
    approvalState: "מאושר",
    version: 1,
  },
  {
    id: "per-5",
    name: "Legal / Compliance",
    legacyName: "מנהלת המערכת",
    role: "משפט ורגולציה",
    businessContext:
      "אחריות על חוזים, פרטיות ושיתוף מידע: מה מותר ל-AI לעשות, אילו נתוני לקוח נחשפים ותחת איזה נוהל.",
    primaryQuestion: "אילו נתוני לקוח נחשפים, למי, ותחת איזה נוהל?",
    desiredValue: "ודאות משפטית: נוהל שימוש ברור, תיעוד מלא ויכולת הסבר.",
    adoptionBarrier: "חשש שמידע לקוחות רגיש יגיע לכלי LLM חיצוני ללא בסיס חוזי.",
    currentKnowledge: "מכיר את ההתקשרויות העסקיות; לא מכיר את נוהל השימוש ב-AI של המערכת.",
    requiredKnowledge: "נוהל השימוש הנכון (מותר/דורש אישור/אסור), תיעוד רשומות ויכולת הסבר דוחות.",
    requiredAbility: "לעבור על נוהל השימוש ולסמן אילו פעולות דורשות אישור אדם.",
    trainingObjective: "אישור מתועד של נוהל השימוש וגבולות שיתוף המידע.",
    trainingFormat: TRAINING_PROGRAMMES["Legal / Compliance"].format,
    durationMinutes: TRAINING_PROGRAMMES["Legal / Compliance"].durationMinutes,
    exercise: "סקירה מודרכת של נוהל השימוש הנכון + סימון פעולות הדורשות אישור אדם (HITL).",
    successMetric: {
      description: "אישור Compliance מתועד לנוהל השימוש",
      numericTarget: null,
      unit: null,
      targetNote: NO_NUMERIC_TARGET,
      measuredValue: null,
      measuredNote: NOT_MEASURED,
    },
    supportingMaterials: [link("tm-8", "ראשי"), link("tm-11", "משלים")],
    namedOwner: { userId: "u-noa", name: "נעה פרידמן" },
    supportTier: 3,
    objections: ["obj-8"],
    approvalState: "מאושר",
    version: 1,
  },
  {
    id: "per-6",
    name: "Champion · השגריר",
    legacyName: "התלמידה",
    role: "שגריר/ה פנימי — Tier-2 אנושי",
    businessContext:
      "מכיר את המערכת לעומק, מתעד פתרונות ועוזר לאחרים — הדמות החשובה ביותר באימוץ (שכבת Tier-2 האנושית).",
    primaryQuestion: "איך אני עוזר לאחרים לאמץ — בלי לטבוע בפניות חוזרות?",
    desiredValue: "כלים לעזור לאחרים: FAQ חי, Playbook ותסריטי תמיכה.",
    adoptionBarrier: "עומס פניות עמיתים ('איך עושים…') ללא כלים מסודרים לתעד ולהפנות.",
    currentKnowledge: "מאמץ מהיר שכבר עובד במערכת; טרם בנה Playbook הדרכתי לעמיתים.",
    requiredKnowledge: "נוהל התמיכה המלא, מאגר הידע, ה-FAQ ותיעוד פתרונות חוזרים.",
    requiredAbility: "לענות על פניית 'איך עושים' עם הפניה לחומר קיים — ולתעד פתרון חדש.",
    trainingObjective: "הפעלת שכבת Tier-2: מענה מתועד לפניות עמיתים והפנייה לחומרים.",
    trainingFormat: TRAINING_PROGRAMMES["Champion · השגריר"].format,
    durationMinutes: TRAINING_PROGRAMMES["Champion · השגריר"].durationMinutes,
    exercise: "תרגול שגריר: מענה ל-3 פניות 'איך עושים' אמיתיות מתוך ה-FAQ + תיעוד פתרון חדש אחד.",
    successMetric: {
      description: "ירידה בפניות חוזרות המגיעות ל-Champion",
      numericTarget: null,
      unit: null,
      targetNote: `${NO_NUMERIC_TARGET} — יעד כמותי (ירידה בפניות חוזרות) מחייב קו בסיס שטרם נמדד`,
      measuredValue: null,
      measuredNote: NOT_MEASURED,
    },
    supportingMaterials: [link("tm-13", "ראשי"), link("tm-5", "משלים"), link("tm-12", "משלים")],
    namedOwner: { userId: "u-ran", name: "רן אלמוג" },
    supportTier: 3,
    objections: ["obj-9"],
    approvalState: "מאושר",
    version: 1,
  },
  {
    id: "per-7",
    name: "המתנגד",
    legacyName: "השותף החיצוני",
    role: "מתנגד/ת — משתמש עתידי",
    businessContext:
      "ההתנגדות היא מידע, לא בעיה — היא מסמנת היכן חסר אמון או ערך. מקבל ערוץ פתוח ושיחה אישית, לא מסע שכנוע.",
    primaryQuestion: "מה הסיכון שלי — ולמה שאשנה דרך עבודה שכבר עובדת?",
    desiredValue: "ודאות: גבולות בטוחים, צעד ראשון קטן ומשוב מהיר.",
    adoptionBarrier: "חוסר אמון וחשש אישי ('מה יקרה אם אטעה?') לצד חוסר ודאות מה מצופה.",
    currentKnowledge: "שולט בתהליך הידני הקיים; חושש שהמערכת תאט אותו או תחשוף טעויות.",
    requiredKnowledge: "הגבולות הבטוחים (מה לא יקרה בלי אישור אדם), המסלול האישי וערוץ העזרה.",
    requiredAbility: "לבצע פעולה אחת קטנה בליווי — ולדעת בדיוק למי פונים כשמשהו לא ברור.",
    trainingObjective: "מעבר ממתנגד למשתמש דרך צעד ראשון קטן ומלווה.",
    trainingFormat: TRAINING_PROGRAMMES["המתנגד"].format,
    durationMinutes: TRAINING_PROGRAMMES["המתנגד"].durationMinutes,
    exercise: "שיחת 1:1 פתוחה על החששות + ביצוע מלווה של פעולה אחת קטנה במערכת.",
    successMetric: {
      description: "מעבר ממתנגד למשתמש — ביצוע עצמאי של פעולה אחת לפחות",
      numericTarget: null,
      unit: null,
      targetNote: NO_NUMERIC_TARGET,
      measuredValue: null,
      measuredNote: NOT_MEASURED,
    },
    supportingMaterials: [link("tm-12", "ראשי"), link("tm-10", "משלים")],
    namedOwner: { userId: "u-tzachi", name: "צחי זוסטייהם" },
    supportTier: 2,
    objections: ["obj-3", "obj-5"],
    approvalState: "מאושר",
    version: 1,
  },
];
