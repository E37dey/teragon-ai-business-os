// W7-D — the 7 mandated objections (7.14) with full LACE responses in natural
// Hebrew, supporting evidence that points at REAL in-app routes/materials,
// named owners and honest review status ("טרם נבדק בשטח" until a real
// conversation happens). Bridged idempotently into the canonical `objections`
// collection (create-if-missing by key, content re-applied only on version bump).
import { getRepository, nextId } from "@/repositories";
import { invalidateCollections } from "@/app/data/hooks";
import type { ObjectionRecord } from "./types";

/** bump when the authored objection content below changes */
export const OBJECTIONS_CONTENT_VERSION = 1;

export type ObjectionSeed = Omit<ObjectionRecord, "id" | "createdAt" | "updatedAt">;

const seed = (
  def: Omit<ObjectionSeed, "reviewStatus" | "contentVersion">,
): ObjectionSeed => ({
  ...def,
  reviewStatus: "טרם נבדק בשטח",
  contentVersion: OBJECTIONS_CONTENT_VERSION,
});

export const CANONICAL_OBJECTIONS: readonly ObjectionSeed[] = [
  seed({
    key: "obj-replace-me",
    surfaceStatement: "זה יחליף אותי",
    underlyingConcern: "פחד קיומי מאובדן מקום העבודה והערך המקצועי",
    personaId: "per-2",
    relatedRisk: "התנגדות סמויה — עקיפת המערכת כדי להוכיח שהיא מיותרת",
    lace: {
      listenHe: "לתת לדובר/ת לסיים את המשפט עד הסוף, בלי 'אבל' — ולשאול: ספר/י לי עוד, מה בדיוק מדאיג אותך?",
      acknowledgeHe: "אני שומע אותך, וזו דאגה לגיטימית לגמרי — כשמדברים על AI זה הדבר הראשון שעולה לרוב האנשים.",
      confirmHe: "רק שאבין נכון: החשש הוא שהמערכת תעשה את העבודה שלך ואז לא יהיה בך צורך?",
      exploreHe:
        "בוא/י נסתכל יחד מה המערכת באמת עושה: היא מסכמת ומציעה — אבל כל שליחה, כל הנחה " +
        "וכל החלטה עוברות דרכך. מה הייתה הפעולה שהכי גוזלת לך זמן השבוע? נבדוק אם המערכת " +
        "מחזירה לך את הזמן הזה במקום לקחת את התפקיד.",
    },
    supportingEvidence: [
      {
        label: "מרכז האישורים — כל פעולה רגישה מחכה לאדם",
        route: "/agents",
        note: "המערכת מציעה; האישור והעריכה תמיד אנושיים.",
      },
      {
        label: "נוהל שימוש נכון — גבולות אדם-AI",
        route: "/quick-start",
        note: "רשימת ה'אסור' מגדירה מה המערכת לעולם לא עושה לבד.",
      },
    ],
    relatedMaterialId: "tm-4",
    ownerId: "u-tzachi",
    followUpQuestion: "איזו משימה היית שמח/ה שהמערכת תוריד ממך כבר השבוע?",
  }),
  seed({
    key: "obj-no-time",
    surfaceStatement: "אין לי זמן ללמוד",
    underlyingConcern: "עומס אמיתי — חשש שהלמידה תבוא על חשבון העבודה השוטפת",
    personaId: "per-4",
    relatedRisk: "אימוץ חלקי — שימוש רק במה שמוכר ואיבוד רוב הערך",
    lace: {
      listenHe: "לשמוע מה מעמיס עכשיו בפועל: מה תופס לך את רוב היום בתקופה הזו?",
      acknowledgeHe: "ברור לי, הלו״ז שלך עמוס גם ככה — עוד קורס זה בדיוק מה שלא חסר לך.",
      confirmHe: "אם אני מבין נכון, הבעיה היא לא רצון — היא שאין שעה פנויה ללמידה מסודרת?",
      exploreHe:
        "בגלל זה ההדרכה כולה 10 דקות, וההתחלה המהירה היא שלוש פעולות בלבד. נתחיל " +
        "מפעולה אחת שחוסכת לך זמן כבר היום — פתיחת קריאת שירות עם קטלוג אוטומטי. " +
        "מתי נוח לך לנסות אותה יחד, חמש דקות?",
    },
    supportingEvidence: [
      {
        label: "התחלה מהירה — שלוש פעולות, פחות מ-10 דקות",
        route: "/quick-start",
        note: "כל פעולה עם זמן משוער והדגמה.",
      },
      {
        label: "Microlearning — 90 שניות לנושא",
        route: "/training-materials",
        note: "קונספט ותסריט Microlearning — למידה במנות קטנות.",
      },
    ],
    relatedMaterialId: "tm-3",
    ownerId: "u-oren",
    followUpQuestion: "אם היו לך רק 5 דקות השבוע — איזו פעולה הכי שווה לך ללמוד?",
  }),
  seed({
    key: "obj-no-trust",
    surfaceStatement: "אני לא סומך על התשובות",
    underlyingConcern: "חשש מהזיות AI ומהחלטות שגויות על בסיס מידע לא בדוק",
    personaId: "per-1",
    relatedRisk: "אמון-חסר — התעלמות גם מהמלצות מבוססות; או אמון-יתר הפוך אצל אחרים",
    lace: {
      listenHe: "לבקש דוגמה קונקרטית: הייתה תשובה ספציפית שהרגישה לך לא אמינה?",
      acknowledgeHe: "אתה צודק שצריך להיזהר — AI שנשמע בטוח בעצמו וטועה זו בעיה אמיתית ומתועדת.",
      confirmHe: "כלומר, מה שחשוב לך זה לדעת על מה בדיוק מבוססת כל תשובה לפני שמסתמכים עליה?",
      exploreHe:
        "בדיוק בשביל זה כל תשובה כאן מגיעה עם ראיות — רשומות אמיתיות שאפשר לפתוח " +
        "ולבדוק. וכשאין מדידה, המערכת כותבת 'טרם נמדד' במקום להמציא אחוז. בוא נפתח יחד " +
        "המלצה אחת ונבדוק את הראיות שלה — ואם משהו לא מסתדר, זו בדיוק הסיבה לא לאשר.",
    },
    supportingEvidence: [
      {
        label: "מעטפת ההמלצה — נימוק + ראיות + מגבלות בכל תשובה",
        route: "/agents",
        note: "אין ראיה ⇒ אין טענה; ביטחון לא נמדד ⇒ 'טרם נמדד'.",
      },
      {
        label: "Microlearning: איך בודקים המלצת AI לפני אישור",
        route: "/training-materials",
        note: "4 שלבי בדיקה ב-90 שניות.",
      },
    ],
    relatedMaterialId: "tm-10",
    ownerId: "u-tzachi",
    followUpQuestion: "מה היה גורם לך לסמוך על תשובה — איזו ראיה היית רוצה לראות?",
  }),
  seed({
    key: "obj-wont-last",
    surfaceStatement: "זה עוד כלי שלא יחזיק",
    underlyingConcern: "עייפות מכלים שהוטמעו ונזנחו — חשש להשקיע בלמידה שתרד לטמיון",
    personaId: "per-3",
    relatedRisk: "דחיית אימוץ 'עד שנראה שזה רציני' — נבואה שמגשימה את עצמה",
    lace: {
      listenHe: "לשאול על ההיסטוריה: אילו כלים כבר ניסו אצלכם, ומה קרה להם?",
      acknowledgeHe: "ניסיון העבר שלך מוצדק — כלים שמוטמעים בלי תכנית באמת נעלמים אחרי חודשיים.",
      confirmHe: "אז החשש הוא להשקיע זמן בלמידה של משהו שבעוד רבעון אף אחד לא ישתמש בו?",
      exploreHe:
        "הפעם יש הבדל מובנה: תכנית הטמעה עם שערים ומדדים, Champions בכל צוות, מסלול " +
        "תמיכה קבוע, ופגישת שגרה חודשית. והכי חשוב — המערכת היא מערכת התפעול של העסק, " +
        "לא כלי צד. מה מבחינתך יוכיח שזה כאן כדי להישאר? נהפוך את זה למדד שעוקבים אחריו.",
    },
    supportingEvidence: [
      {
        label: "תכנית ההטמעה — שלבים, שערים וראיות",
        route: "/implementation",
        note: "שער לא עובר על אחוז התקדמות — רק על ראיות.",
      },
      {
        label: "מסלול תמיכה קבוע לאחר ההשקה",
        route: "/support",
        note: "שלושה שלבים עם SLA — לא נעזבים אחרי ההדרכה.",
      },
    ],
    relatedMaterialId: "tm-12",
    ownerId: "u-oren",
    followUpQuestion: "מה יגרום לך להאמין שהמערכת כאן להישאר — ואיך נמדוד את זה יחד?",
  }),
  seed({
    key: "obj-legal-risk",
    surfaceStatement: "זה מסוכן משפטית",
    underlyingConcern: "אחריות על טעויות AI, פרטיות לקוחות וחשיפת מידע רגיש",
    personaId: "per-5",
    relatedRisk: "חסימת שימוש גורפת שמונעת גם ערך בטוח; או שימוש לא ממושל בצד",
    lace: {
      listenHe: "לברר את התרחיש המדויק: איזה מקרה משפטי מדאיג אותך — טעות ללקוח? דליפת מידע?",
      acknowledgeHe: "חשוב שמישהו שואל את זה — שימוש לא ממושל ב-AI הוא באמת חשיפה משפטית.",
      confirmHe: "אם הבנתי נכון, הדאגה היא מי אחראי כשמשהו יוצא החוצה — והאם מידע לקוחות מוגן?",
      exploreHe:
        "המבנה כאן בנוי בדיוק על זה: שום דבר לא נשלח ללקוח בלי אישור אנושי מתועד, כל " +
        "פעולה נרשמת ביומן ביקורת עם שם המאשר, והמנוע המקומי רץ בלי רשת. גיליון " +
        "הסיכונים ממפה כל סיכון לבקרה. רוצה שנעבור עליו יחד ונסמן מה עוד חסר מבחינתך?",
    },
    supportingEvidence: [
      {
        label: "Risk & Governance Sheet — סיכון מול בקרה",
        route: "/governance",
        note: "כולל שאריות סיכון שנשארות באחריות אנושית — בלי הבטחת אפס.",
      },
      {
        label: "יומן ביקורת מלא",
        route: "/governance",
        note: "כל אישור נרשם עם שם, זמן ומזהה מתאם.",
      },
    ],
    relatedMaterialId: "tm-7",
    ownerId: "u-noa",
    followUpQuestion: "איזה תרחיש משפטי הכי מדאיג אותך? נבדוק יחד איזו בקרה עונה עליו.",
  }),
  seed({
    key: "obj-not-for-us",
    surfaceStatement: "זה לא מתאים לעבודה שלנו",
    underlyingConcern: "תחושה שהעבודה ייחודית מדי — כלי גנרי לא יבין הדפסת תלת-ממד והדרכה",
    personaId: "per-3",
    relatedRisk: "שימוש שטחי — המערכת נתפסת כ'עוד CRM' והערך הייחודי לא ממומש",
    lace: {
      listenHe: "לבקש דוגמה: איזה חלק בעבודה שלך מרגיש שכלי חיצוני לא יכול להבין?",
      acknowledgeHe: "נכון — העבודה שלנו באמת לא סטנדרטית: מדפסות, קורסים, שירות ותלמידים ביחד.",
      confirmHe: "כלומר, החשש הוא שהמערכת בנויה לעסק גנרי ולא לשילוב הייחודי של טרגון?",
      exploreHe:
        "המערכת הזו נבנתה בדיוק על התהליכים של טרגון: התאמת מדפסת לפי צורך וחומרים, " +
        "מסלולי למידה עם אישורי מדריך, קריאות שירות עם ידע מצטבר. בוא/י ניקח תרחיש " +
        "אמיתי מהשבוע שלך ונריץ אותו יחד — ואם משהו חסר, זה נרשם כדרישה עם בעלים.",
    },
    supportingEvidence: [
      {
        label: "התאמת מדפסת — כללים על הקטלוג האמיתי",
        route: "/printers",
        note: "לוגיקה ייעודית לתלת-ממד, לא צ'אט גנרי.",
      },
      {
        label: "מסלולי למידה ואישורי מדריך",
        route: "/courses",
        note: "זרימת ההדרכה של טרגון ממומשת כפיצ'ר ליבה.",
      },
    ],
    relatedMaterialId: "tm-2",
    ownerId: "u-maya",
    followUpQuestion: "איזה תרחיש מהעבודה שלך ננסה יחד כדי לבדוק אם המערכת באמת מבינה אותו?",
  }),
  seed({
    key: "obj-tried-ai",
    surfaceStatement: "כבר ניסינו AI",
    underlyingConcern: "אכזבה קודמת מכלי AI שהבטיח הרבה וסיפק תשובות גנריות או שגויות",
    personaId: "per-5",
    relatedRisk: "הכללה מניסיון קודם — פסילת הגישה כולה בגלל כלי אחד",
    lace: {
      listenHe: "לשאול על החוויה הקודמת: מה ניסיתם, ומה בדיוק אכזב?",
      acknowledgeHe: "האכזבה מובנת — הרבה כלי AI באמת מבטיחים קסם ומספקים תשובות כלליות.",
      confirmHe: "אז הספקנות היא לא כלפי AI עצמו — אלא כלפי כלים שלא מחוברים לנתונים שלנו?",
      exploreHe:
        "ההבדל המרכזי: הכלי הקודם ענה מהאוויר, כאן כל תשובה נבנית מהרשומות שלנו ומראה " +
        "אותן כראיות. ומה שהכלי לא יודע — הוא אומר בפירוש, כולל 'טרם נמדד'. ניקח שאלה " +
        "שהכלי הקודם נכשל בה ונשאל את המערכת — ונשפוט לפי התוצאה, לא לפי ההבטחה.",
    },
    supportingEvidence: [
      {
        label: "תשובות מבוססות רשומות בלבד",
        route: "/agents",
        note: "מנוע הכללים המקומי עובד רק על הנתונים שלנו — לא ידע כללי.",
      },
      {
        label: "ספריית תרחישים — מה המערכת באמת יודעת לעשות",
        route: "/training-materials",
        note: "רשימת הפעולות סגורה ומתועדת — בלי הבטחות מעבר.",
      },
    ],
    relatedMaterialId: "tm-5",
    ownerId: "u-noa",
    followUpQuestion: "מה השאלה שהכלי הקודם נכשל בה? ננסה אותה כאן ונשווה תשובות.",
  }),
];

/** the 7 mandated surface statements — asserted by tests */
export const MANDATED_OBJECTION_STATEMENTS = [
  "זה יחליף אותי",
  "אין לי זמן ללמוד",
  "אני לא סומך על התשובות",
  "זה עוד כלי שלא יחזיק",
  "זה מסוכן משפטית",
  "זה לא מתאים לעבודה שלנו",
  "כבר ניסינו AI",
] as const;

// ---------------------------------------------------------------------------
// idempotent bridge into the canonical `objections` collection
// ---------------------------------------------------------------------------

export interface ObjectionsUpgrade {
  records: ObjectionRecord[];
  createdKeys: string[];
  updatedKeys: string[];
}

/** Pure core: merge canonical content into existing records by key. */
export function upgradeObjections(
  existing: readonly ObjectionRecord[],
  now: string,
  idFor: (index: number, existingIds: readonly string[]) => string,
): ObjectionsUpgrade {
  const createdKeys: string[] = [];
  const updatedKeys: string[] = [];
  const records: ObjectionRecord[] = [...existing];
  const ids = existing.map((o) => o.id);

  CANONICAL_OBJECTIONS.forEach((def, i) => {
    const found = records.findIndex((o) => o.key === def.key);
    if (found === -1) {
      const id = idFor(i, ids);
      ids.push(id);
      records.push({ id, createdAt: now, updatedAt: now, ...def });
      createdKeys.push(def.key);
      return;
    }
    const rec = records[found];
    if (rec === undefined || rec.contentVersion >= OBJECTIONS_CONTENT_VERSION) return;
    records[found] = {
      ...rec,
      ...def,
      // human-owned review status survives content upgrades
      reviewStatus: rec.reviewStatus,
      id: rec.id,
      createdAt: rec.createdAt,
      updatedAt: now,
    };
    updatedKeys.push(def.key);
  });

  return { records, createdKeys, updatedKeys };
}

/** Repository wrapper: ensure the ≥7 canonical objections exist (idempotent). */
export async function ensureCanonicalObjections(): Promise<ObjectionsUpgrade> {
  const repo = getRepository<ObjectionRecord>("objections");
  const existing = await repo.list();
  const now = new Date().toISOString();
  const result = upgradeObjections(existing, now, (_i, ids) => nextId("obj", ids));
  if (result.createdKeys.length > 0 || result.updatedKeys.length > 0) {
    const touched = new Set([...result.createdKeys, ...result.updatedKeys]);
    for (const rec of result.records) {
      if (!touched.has(rec.key)) continue;
      if (existing.some((o) => o.id === rec.id)) await repo.update(rec.id, rec);
      else await repo.create(rec);
    }
    await invalidateCollections(["objections"]);
  }
  return result;
}
