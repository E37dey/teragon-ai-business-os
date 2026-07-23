// W7-B — persona objections (LACE model), typed records (Phase 7.6).
// THE export the W7-D FAQ consumes: `PERSONA_OBJECTIONS` from
// "@/domain/personas" (or this file directly). Donor: the 5 LACE objections
// in חבילת_הטמעה_מערכת_טרגון.docx chapter 8, reassigned to the canonical
// adoption personas (Lead decision C1); 4 more derived from the donor usage
// policy and the persona lanes — each `sourceNote` says which.
import type { PersonaObjection } from "./types";

export const PERSONA_OBJECTIONS: readonly PersonaObjection[] = [
  {
    id: "obj-1",
    personaId: "per-1",
    personaName: "משתמש קצה",
    quote: "אין לי 20 דקות ללמוד כלי חדש באמצע יום עבודה.",
    listen: "לתת למשתמש לפרט מתי בדיוק העומס הכי כבד.",
    acknowledge: "נכון — בהתחלה כל כלי חדש מאט. זה לגיטימי.",
    clarify: "ההדרכה הראשונה היא 3 פעולות בלבד (Quick Start), לא המערכת כולה.",
    explore: "נקבע סשן קצר בשעה הכי שקטה, ונמדוד יחד את הזמן שנחסך אחרי שבוע.",
    sourceNote: "דונור: התנגדות 1 (חוסר זמן), חבילת ההטמעה פרק 8",
  },
  {
    id: "obj-2",
    personaId: "per-1",
    personaName: "משתמש קצה",
    quote: "התשובות של ה-AI נראו טוב, אבל פחדתי להסתמך עליהן מול לקוח.",
    listen: "להבין מול איזה לקוח/מצב היה החשש.",
    acknowledge: "פחד בריא — הצעת מחיר שגויה מול לקוח היא סיכון אמיתי.",
    clarify: "ה-AI רק מנסח טיוטה; שום הצעה לא נשלחת בלי אישור אנושי (HITL), וכל סיווג מגיע עם % ביטחון.",
    explore: "נתרגל יחד 5 הצעות בסימולציה לפני עבודה מול לקוח אמיתי.",
    sourceNote: "דונור: התנגדות 2 (פחד לטעות), חבילת ההטמעה פרק 8",
  },
  {
    id: "obj-3",
    personaId: "per-7",
    personaName: "המתנגד",
    quote: "המערכת נראית מורכבת — לא הצלחתי לזכור איך עושים את זה.",
    listen: "לזהות איזה מסך הרגיש עמוס.",
    acknowledge: "מורכבות נתפסת היא חסם אמיתי לאימוץ.",
    clarify: "כל פרסונה רואה רק את המסכים שלה (RBAC) — לא את הכול.",
    explore: "נצמיד דף עזר של עמוד אחד ליד העמדה, ונתחיל מפעולה אחת בלבד.",
    sourceNote: "דונור: התנגדות 3 (מורכבות), חבילת ההטמעה פרק 8",
  },
  {
    id: "obj-4",
    personaId: "per-3",
    personaName: "הנהלה",
    quote: "איך אני יודע שהסיווג והחיזוי של ה-AI נכונים?",
    listen: "להקשיב לאילו החלטות ההנהלה הכי חוששת לתת ל-AI.",
    acknowledge: "ספקנות לגבי AI היא נכונה ואחראית.",
    clarify: "כל פלט AI מסומן בתג, מלווה ב-% ביטחון וניתן לביטול אנושי; בלי חיבור מודל — המערכת נופלת ללוגיקת חוקים.",
    explore: 'נריץ תקופה במצב "AI ממליץ, אדם מאשר" ונבדוק את אחוז ההמלצות שהתקבלו.',
    sourceNote: "דונור: התנגדות 4 (חוסר אמון ב-AI), חבילת ההטמעה פרק 8",
  },
  {
    id: "obj-5",
    personaId: "per-7",
    personaName: "המתנגד",
    quote: "לקח לי יותר זמן להפעיל את המערכת מאשר לעשות לבד בוואטסאפ.",
    listen: "לברר אילו פעולות הרגישו מיותרות.",
    acknowledge: "אם זה איטי יותר — זו בעיה אמיתית, לא 'התנגדות לשינוי'.",
    clarify: "בוואטסאפ אין מעקב, אין היסטוריה ואין דשבורד — המערכת חוסכת בעיקר ב'אחרי'.",
    explore: "נמדוד את זמן הביצוע אחרי שבועיים; אם לא ירד — נתקן את נקודת החיכוך הספציפית.",
    sourceNote: "דונור: התנגדות 5 (חוסר ערך), חבילת ההטמעה פרק 8",
  },
  {
    id: "obj-6",
    personaId: "per-2",
    personaName: "מנהל צוות",
    quote: "אין לי דרך לדעת אם הצוות באמת משתמש — או רק אומר שהוא משתמש.",
    listen: "להבין אילו התנהגויות הצוות המנהל הכי רוצה לראות.",
    acknowledge: "הצהרות אינן אימוץ — החשש מוצדק.",
    clarify: "אימוץ נמדד מהתנהגות בפועל (פעולות במערכת), לא מסקרים; הדוח נגזר מרשומות אמת.",
    explore: "נגדיר יחד את דוח השימוש השבועי של הצוות ונעבור עליו בפגישה הראשונה.",
    sourceNote: "נגזר: מדדי אימוץ רמה 2 (התנהגות בפועל), חבילת ההטמעה פרק 7",
  },
  {
    id: "obj-7",
    personaId: "per-4",
    personaName: "IT / אבטחת מידע",
    quote: "מי רואה מה? אני לא מכניס מערכת בלי מודל הרשאות ויומן ביקורת.",
    listen: "למפות אילו נכסי מידע הכי רגישים בעיני ה-IT.",
    acknowledge: "דרישה נכונה — בלי RBAC ויומן ביקורת אין אמון תפעולי.",
    clarify: "לכל תפקיד הרשאות מוגדרות, כל פעולת סוכן נרשמת ביומן הביקורת וניתנת לשחזור.",
    explore: "נעבור יחד על מודל ההרשאות במפגש הטכני ונתרגל איתור פעולה ביומן.",
    sourceNote: "נגזר: מסלול IT/Security במטריצת הפרסונות של הדונור",
  },
  {
    id: "obj-8",
    personaId: "per-5",
    personaName: "Legal / Compliance",
    quote: "מידע לקוחות עלול לזלוג לכלי LLM חיצוני — מי מתחייב שזה לא קורה?",
    listen: "להבין אילו קטגוריות מידע אסורות לחלוטין לשיתוף.",
    acknowledge: "סיכון פרטיות אמיתי — לא היפותטי.",
    clarify: "נוהל השימוש אוסר העלאת מידע לקוח רגיש לכלי חיצוני ללא הפעלה מפורשת; ברירת המחדל היא עיבוד מקומי.",
    explore: "נסקור יחד את נוהל השימוש במפגש הממשל ונחתום על גרסה מתועדת.",
    sourceNote: "נגזר: נוהל שימוש נכון (אסור), נספח ההשלמה חלק ד'",
  },
  {
    id: "obj-9",
    personaId: "per-6",
    personaName: "Champion · השגריר",
    quote: "כולם פונים אליי עם 'איך עושים' — ואין לי כלים לענות בלי לעצור את העבודה שלי.",
    listen: "למפות אילו פניות חוזרות הכי מכבידות.",
    acknowledge: "עומס השגריר הוא עלות אמיתית של האימוץ — לא מובן מאליו.",
    clarify: "ה-FAQ, ה-Playbook ונוהל התמיכה קיימים בדיוק כדי שהמענה יהיה הפניה — לא הסבר מאפס.",
    explore: "בסדנה המתקדמת נבנה יחד את דף ההפניות האישי ל-3 הפניות הנפוצות.",
    sourceNote: "נגזר: תפקיד ה-Champion ועומסו, חבילת ההטמעה פרק 10",
  },
];

/** objections of a single persona, in declaration order */
export function objectionsOf(personaId: string): PersonaObjection[] {
  return PERSONA_OBJECTIONS.filter((o) => o.personaId === personaId);
}
