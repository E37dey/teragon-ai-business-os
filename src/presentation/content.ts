// TERAGON AI BUSINESS OS — the canonical 5-section submission presentation
// content (W7-F, 7.21). REWRITTEN Hebrew from the donor deck
// (teragon-final/docs/presentations/הצגת_מטלה_5_שקופיות_טרגון.pptx — structure
// + presenter-note donors) under the Wave-7 honesty rules:
// - donor numbers (ROI 3X, ‎3,840 ₪‎, WAU≥70%, NPS≥7…) appear ONLY as
//   יעד פיילוט with an explicit source note — never as measured results;
// - the donor note "כל מדד נמדד מנתוני אמת עם Baseline" was FALSE and is
//   rewritten to the honest state: קו בסיס טרם נמדד;
// - every demo link is a real app route; every backup image is a real
//   captured screenshot with an honesty note about what it actually shows.
import type {
  PresentationBackupImage,
  PresentationDemoLink,
  PresentationSectionKey,
  PresentationSectionTitle,
  PresentationVisualKey,
  PresenterNoteEmphasis,
} from "./types";

export const SECTION_TARGET_SECONDS = 120;
export const PRESENTATION_TOTAL_TARGET_SECONDS = 600;

export interface SectionDefinition {
  /** stable record id ("ps-1".."ps-5") */
  id: string;
  order: number;
  key: PresentationSectionKey;
  titleHe: PresentationSectionTitle;
  objectiveHe: string;
  mainMessageHe: string;
  visual: PresentationVisualKey;
  visualDescriptionHe: string;
  demoLink: PresentationDemoLink;
  backupImage: PresentationBackupImage;
  targetSeconds: number;
  sourceNoteHe: string;
}

export interface NoteDefinition {
  /** stable record id ("pn-<section>-<n>") */
  id: string;
  sectionId: string;
  order: number;
  textHe: string;
  emphasis: PresenterNoteEmphasis;
}

const SOURCE_DECK =
  "נכתב מחדש מתוך מצגת המטלה (הצגת_מטלה_5_שקופיות_טרגון.pptx) — מבנה והערות מרצה בלבד; " +
  "מספרי התורם מסומנים יעד פיילוט, לא מדידה";

export const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
  {
    id: "ps-1",
    order: 1,
    key: "problem-audience",
    titleHe: "הבעיה והקהל",
    objectiveHe:
      "לקבע את ה-Use Case: לא ״להטמיע AI״ באוויר, אלא לפתור כאב עסקי מוגדר — ולומר בכנות אילו מספרים הם הערכה שטרם נמדדה.",
    mainMessageHe:
      "אדם אחד מנהל 1,000+ לקוחות ידנית בוואטסאפ ובראש — לידים נופלים, אחריות פגה, ואין למי להאציל.",
    visual: "as-is-to-be",
    visualDescriptionHe:
      "מפת AS-IS / TO-BE החיה ממסך תכנית ההטמעה — 5 שלבי התהליך הידני מול 7 שלבי התהליך עם גבולות אדם-AI (רכיב חי, לא צילום).",
    demoLink: {
      route: "/implementation",
      labelHe: "תכנית ההטמעה — הבעיה העסקית",
      noteHe: "להראות את כותרת הבעיה העסקית ואת מפת ה-AS-IS/TO-BE החיה",
    },
    backupImage: {
      sourceFile: "docs/screenshots/wave3/command-center-1920x1080.png",
      assetKey: "command-center",
      capturedRoute: "/",
      capturedWave: 3,
      captionHe: "מרכז הפיקוד — ההקשר העסקי שבו הבעיה נפגשת עם הפתרון",
      honestyNoteHe:
        "צילום QA אמיתי של מרכז הפיקוד (גל 3). מסך תכנית ההטמעה של גל 7 טרם צולם — זהו צילום הגיבוי הקרוב ביותר.",
    },
    targetSeconds: SECTION_TARGET_SECONDS,
    sourceNoteHe: SOURCE_DECK,
  },
  {
    id: "ps-2",
    order: 2,
    key: "personas-tracks",
    titleHe: "שבע פרסונות ומסלולי ההדרכה",
    objectiveHe:
      "להראות שלכל קהל צורך שונה ולכן מסלול הדרכה שונה — ה-Training Matrix הוא ״חוזה ההדרכה״: פורמט, משך, תרגול ומדד הצלחה לכל פרסונה.",
    mainMessageHe: "הדרכה אחידה לכולם היא הדרכה לאף אחד — שבע פרסונות, שבעה מסלולים.",
    visual: "training-matrix",
    visualDescriptionHe:
      "ה-Training Matrix החי ממסך הפרסונות — שבע השורות הקנוניות עם חומרים מקושרים ויעדים (יעד לחוד, מדידה לחוד).",
    demoLink: {
      route: "/personas",
      labelHe: "פרסונות ומסלולי הדרכה",
      noteHe: "לגלול אל ה-Training Matrix ולהראות את שורת ה-Champion ואת שורת המתנגד",
    },
    backupImage: {
      sourceFile: "docs/screenshots/wave3/crm-1920x1080.png",
      assetKey: "crm",
      capturedRoute: "/crm",
      capturedWave: 3,
      captionHe: "מסך ה-CRM — סביבת העבודה של פרסונות המכירות והקצה",
      honestyNoteHe:
        "צילום QA אמיתי של מסך ה-CRM (גל 3). מסך הפרסונות של גל 7 טרם צולם — הגיבוי מציג את סביבת העבודה שהפרסונות פוגשות בפועל.",
    },
    targetSeconds: SECTION_TARGET_SECONDS,
    sourceNoteHe: SOURCE_DECK,
  },
  {
    id: "ps-3",
    order: 3,
    key: "implementation-gates",
    titleHe: "תכנית הטמעה בשישה שלבים ו-Stage Gates",
    objectiveHe:
      "להראות שכל שלב מחזיק בעלים בשם ותאריך החלטה קבוע (חוק התאריך) — ושער G4 בסוף שבוע 7 חסום עד שיש תוצאת פיילוט אמיתית. בלי ראיה — אין מעבר.",
    mainMessageHe: "שישה שלבים · בעלים בשמות · שער עם ראיות בין כל שלב — זה מה שמונע פיילוט נצחי.",
    visual: "roadmap-summary",
    visualDescriptionHe:
      "תקציר מפת הדרכים החי — שישה שלבי האימוץ מתכנית ההטמעה הפעילה עם סטטוס אמת ושער היציאה של כל שלב.",
    demoLink: {
      route: "/stage-gates",
      labelHe: "Stage Gates · שערי מעבר וראיות",
      noteHe: "להראות את G3/G4 — אילו ראיות קיימות ואילו חסרות (המערכת אומרת זאת בעצמה)",
    },
    backupImage: {
      sourceFile: "docs/screenshots/wave6/03-memory-proposal-approval-1920x1080.png",
      assetKey: "approval-evidence",
      capturedRoute: "/memory",
      capturedWave: 6,
      captionHe: "אישור ממושל עם ראיות — אותו עיקרון שמפעיל את שערי המעבר",
      honestyNoteHe:
        "צילום QA אמיתי של זרימת אישור ממושלת (גל 6). מסכי ההטמעה ו-Stage Gates של גל 7 טרם צולמו — הגיבוי מדגים את עיקרון ההחלטה-עם-ראיות.",
    },
    targetSeconds: SECTION_TARGET_SECONDS,
    sourceNoteHe: SOURCE_DECK,
  },
  {
    id: "ps-4",
    order: 4,
    key: "material-demo",
    titleHe: "הדגמת Quick Start או Microlearning",
    objectiveHe:
      "להראות חומר הדרכה אחד ממשי במקום לספר עליו: Quick Start של שלוש פעולות + סטוריבורד ה-Microlearning של 90 שניות (קונספט — לא הופק וידאו, וזה כתוב).",
    mainMessageHe: "לא 50 עמודים — שלוש פעולות יומיומיות, והכלל: ה-AI מציע, האדם תמיד מאשר (HITL).",
    visual: "quick-start-microlearning",
    visualDescriptionHe:
      "שלוש פעולות ה-Quick Start מהדומיין החי + תצוגת הסטוריבורד האמיתית של סרטון ה-Microlearning (רכיב W7-D, קריאה בלבד).",
    demoLink: {
      route: "/quick-start",
      labelHe: "התחלה מהירה ושימוש נכון",
      noteHe: "להריץ את בדיקת ״האם הפעולה שתכננת מותרת״ מול הנוהל — בדיקה דטרמיניסטית חיה",
    },
    backupImage: {
      sourceFile: "docs/screenshots/wave5/approval-panel-1920x1080.png",
      assetKey: "approval-panel",
      capturedRoute: "/agents",
      capturedWave: 5,
      captionHe: "מרכז האישורים — הפעולה השלישית של ה-Quick Start (בדוק ראיות ואשר)",
      honestyNoteHe:
        "צילום QA אמיתי של פאנל האישורים (גל 5). מסך ה-Quick Start של גל 7 טרם צולם — הגיבוי מציג את המסך שאליו מובילה הפעולה השלישית.",
    },
    targetSeconds: SECTION_TARGET_SECONDS,
    sourceNoteHe: SOURCE_DECK,
  },
  {
    id: "ps-5",
    order: 5,
    key: "metrics-risk",
    titleHe: "שלוש רמות המדידה והסיכון המרכזי",
    objectiveHe:
      "להציג את מסגרת המדידה בשלוש רמות (הדרכה / אימוץ / ערך עסקי) עם יעדים גלויים ומצב מדידה כן — ולסגור עם הסיכון המרכזי ומיתונו.",
    mainMessageHe:
      "היעדים מוגדרים, קו הבסיס טרם נמדד — והסיכון הגדול אינו טכנולוגי: וואטסאפ שנשאר ערוץ ניהול משאיר את המערכת בקופסה.",
    visual: "metrics-summary",
    visualDescriptionHe:
      "תקציר מדדים חי מהגדרות המדד במערכת — שלוש רמות, יעד מול מצב מדידה (״טרם נמדד״ כשאין תצפית) + כרטיס הסיכון המרכזי מרשומות הסיכונים.",
    demoLink: {
      route: "/submission",
      labelHe: "מרכז ההגשה והראיות",
      noteHe: "להראות את מוכנות ההגשה כפי שהמערכת מדווחת אותה — כולל חסמים פתוחים, בלי מצב ירוק מזויף",
    },
    backupImage: {
      sourceFile: "docs/screenshots/wave6/08-learning-page-1920x1080.png",
      assetKey: "learning-metrics",
      capturedRoute: "/learning",
      capturedWave: 6,
      captionHe: "מרכז הלמידה — מדדים נגזרים עם ״טרם נמדד״ גלוי",
      honestyNoteHe:
        "צילום QA אמיתי של מסך הלמידה (גל 6) — מדגים את דפוס המדידה הכנה. מסך הדוחות עם מדדי האימוץ של גל 7 טרם צולם.",
    },
    targetSeconds: SECTION_TARGET_SECONDS,
    sourceNoteHe: SOURCE_DECK,
  },
] as const;

// ---------------------------------------------------------------------------
// presenter notes — rewritten from the donor deck's notesSlides, honesty-fixed
// ---------------------------------------------------------------------------

function note(
  sectionN: number,
  order: number,
  textHe: string,
  emphasis: PresenterNoteEmphasis = "רגיל",
): NoteDefinition {
  return { id: `pn-${sectionN}-${order}`, sectionId: `ps-${sectionN}`, order, textHe, emphasis };
}

export const NOTE_DEFINITIONS: readonly NoteDefinition[] = [
  // ps-1 — הבעיה והקהל (2 דקות)
  note(
    1,
    1,
    "לפתוח בכאב, לא בטכנולוגיה: טרגון היא עסק אמיתי — הדפסת תלת-ממד, קורסים ותמיכה — ואדם אחד מנהל הכל בוואטסאפ ובראש.",
  ),
  note(
    1,
    2,
    "מי סובל: קודם צחי (כל העומס עליו), אחר-כך הלקוחות (זמני תגובה לא עקביים), ולבסוף צוות עתידי — אין תשתית להאציל אליה.",
  ),
  note(
    1,
    3,
    "זה ה-Use Case: לא ״להטמיע AI״ באוויר אלא לפתור כאב מוגדר — לידים שנופלים ואחריות שפגה בלי חידוש.",
    "מסר מרכזי",
  ),
  note(
    1,
    4,
    "לומר במפורש: ״~8 שעות ניהול ידני בשבוע״ הוא הערכה ממסמך ההטמעה — קו הבסיס טרם נמדד, ותיעודו הוא הצעד הראשון בתכנית.",
    "הערת כנות",
  ),
  // ps-2 — שבע פרסונות (2 דקות)
  note(
    2,
    1,
    "המסר: לכל קהל צורך שונה ולכן מסלול שונה. לעבור על המטריצה במהירות — לא להקריא אותה.",
  ),
  note(
    2,
    2,
    "לעצור על שתי הפרסונות שקובעות את האימוץ: ה-Champion (מי שעוזר לאחרים) והמתנגד — במתנגד מטפלים, לא מתעלמים; ההתנגדות היא מידע.",
    "מסר מרכזי",
  ),
  note(
    2,
    3,
    "לציין שלפי חומר הקורס, EU AI Act (סעיף 4) מחייב הדרכת AI מותאמת — אנחנו מציגים זאת כציטוט מחומר הקורס, לא כחוות דעת משפטית שלנו.",
    "הערת כנות",
  ),
  note(2, 4, "לסגור: ה-Training Matrix הוא חוזה ההדרכה — בלעדיו יש כוונות, אין תכנית."),
  // ps-3 — שישה שלבים ושערים (2 דקות)
  note(
    3,
    1,
    "כל שלב מחזיק בעלים בשם ותאריך — לא ״נעשה את זה מתישהו״. חוק התאריך: לכל שלב נקודת החלטה קבועה מראש — ממשיכים, משנים או עוצרים.",
  ),
  note(
    3,
    2,
    "נקודת ההחלטה הקריטית: סוף שבוע 7 — שער G4. האם הפיילוט האישי הצליח לפני שמרחיבים לצוות?",
    "מסר מרכזי",
  ),
  note(
    3,
    3,
    "להראות במערכת ש-G4 חסום כרגע: אין עדיין תוצאת פיילוט מדודה, ולכן המערכת עצמה מסרבת להציג ״עבר״. בלי ראיה — אין מעבר; זה מונע פיילוט נצחי.",
    "הערת כנות",
  ),
  // ps-4 — הדגמת חומר (2 דקות)
  note(
    4,
    1,
    "לא לספר על החומר — להראות אותו: דף Quick Start אחד, שלוש פעולות יומיומיות, פעולה ראשונה תוך דקות ולא 50 עמודים של כל הפיצ׳רים.",
  ),
  note(
    4,
    2,
    "להריץ חי את בדיקת ״האם הפעולה שתכננת מותרת״ — התשובה מגיעה מהנוהל, דטרמיניסטית.",
  ),
  note(
    4,
    3,
    "ה-Microlearning של 90 השניות קיים כתסריט וסטוריבורד מלאים — הווידאו עצמו לא הופק, וכך זה גם כתוב במערכת.",
    "הערת כנות",
  ),
  note(4, 4, "לסיים בכלל הזהב: ה-AI מציע — האדם תמיד מאשר לפני שנשלח (HITL).", "מסר מרכזי"),
  // ps-5 — מדדים וסיכון (2 דקות)
  note(
    5,
    1,
    "שלוש רמות: הדרכה (תרגול והשלמה) → אימוץ (WAU, פניות ״איך עושים״) → ערך עסקי (ROI, זמן שנחסך). ההיגיון: בלי רמה 1 אין רמה 2, בלי רמה 2 אין רמה 3.",
  ),
  note(
    5,
    2,
    "בניגוד לגרסת התורם — לא מציגים אף מספר כתוצאה: ROI 3X ו-‎3,840 ₪‎ לחודש הם יעדי פיילוט ממסמך ההטמעה; קו הבסיס והתוצאות טרם נמדדו, והמסך מציג זאת בדיוק כך.",
    "הערת כנות",
  ),
  note(
    5,
    3,
    "הסיכון המרכזי אינו טכנולוגי: צחי ממשיך לעבוד בוואטסאפ במקביל — והמערכת נשארת בקופסה. המיתון: שער G5 חוסם הרחבה עד שוואטסאפ נסגר כערוץ ניהול, והדגמת ערך מהירה בשבוע הראשון.",
    "מסר מרכזי",
  ),
  note(5, 4, "לסגור במשפט אחד: ״האם הפתרון בשגרה — או בקופסה?״"),
] as const;
