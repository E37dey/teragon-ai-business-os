// TERAGON AI BUSINESS OS — the 10 canonical governance policies (Wave 8, W8-B).
// Content definitions ONLY — bootstrap persists them as drafts (טיוטה /
// ממתין לבדיקה). NOTHING here is auto-approved: effectiveAt stays null until a
// NAMED approver decides through the canonical ApprovalEngine.
// Policy #1 content is rewritten from the tm-4 "נוהל שימוש נכון" training
// material (src/domain/training-materials/content.ts, key correct-use-policy).
import { APPROVAL_REQUIRED_ACTIONS } from "@/domain/agents";
import { AGENT_IDS } from "@/agents/definitions";
import type { PolicySection } from "@/domain/governance";

export interface CanonicalPolicyDef {
  /** stable key — bootstrap ids derive from it (idempotent) */
  key: string;
  titleHe: string;
  summaryHe: string;
  ownerId: string;
  ownerName: string;
  /** policies submitted for review at bootstrap open a canonical Approval */
  submitForReview: boolean;
  affectedAgentIds: string[];
  affectedOperations: string[];
  sections: PolicySection[];
}

const ALL_AGENTS = [...AGENT_IDS];

/** The 10 canonical policies. Owners are the real named seed users. */
export const CANONICAL_POLICIES: readonly CanonicalPolicyDef[] = [
  {
    // policy #1 — rewritten from tm-4 (נוהל שימוש נכון)
    key: "correct-use",
    titleHe: "מדיניות שימוש נכון ב-AI",
    summaryHe: "מה מותר ללא אישור, מה חובה לבדוק לפני שימוש בתוצר, ומה אסור בשום מצב.",
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    submitForReview: true,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: [...APPROVAL_REQUIRED_ACTIONS],
    sections: [
      {
        headingHe: "מותר — ללא אישור נוסף",
        bulletsHe: [
          "לסכם מידע מאושר — סיכומי לידים, פגישות ופעילות מתוך הרשומות",
          "להכין טיוטה — טיוטת הודעה, טיוטת הצעה, טיוטת תשובה",
          "להציע פעולה — המלצת פולואו-אפ, התאמת מדפסת, קורס מתאים",
          "לחפש ידע — חיפוש במאגר הידע ובזיכרון הארגוני",
        ],
      },
      {
        headingHe: "חובה לבדוק — לפני כל שימוש בתוצר",
        bulletsHe: [
          "המלצה כספית — כל מספר כספי נבדק מול הרשומות לפני שמסתמכים עליו",
          "הצעת מחיר — מחירים, הנחות ותוקף נבדקים ידנית",
          "מידע טכני — מפרטי מדפסות וחומרים נבדקים מול הקטלוג",
          "הודעה חיצונית — כל נוסח שיוצא ללקוח נקרא ונערך על ידי אדם",
          "כלל האצבע: אם התוצר יוצא מהמערכת החוצה או מזיז כסף — בודקים קודם",
        ],
      },
      {
        headingHe: "אסור — בשום מצב",
        bulletsHe: [
          "לשלוח ללא אישור — שום הודעה לא יוצאת ללקוח בלי אישור אנושי",
          "להמציא מקור — אם ה-AI לא הציג ראיה, אין להשלים אותה מהדמיון",
          "לחשוף מידע רגיש — אין להדביק פרטי לקוחות בכלים חיצוניים",
          "לשנות הרשאה — הרשאות משתנות רק על ידי מנהלת המערכת",
          "לאשר הנחה — הנחות מאושרות רק על ידי גורם מוסמך, לא על ידי AI",
          "למחוק מידע — מחיקת רשומות היא פעולה מבוקרת ומתועדת",
          "הפרת סעיפי ה'אסור' מטופלת כאירוע אבטחה — כולל תחקיר מול יומן הביקורת",
        ],
      },
    ],
  },
  {
    key: "human-approval",
    titleHe: "מדיניות אישור אנושי (HITL)",
    summaryHe: "כל פעולה משנה/יוצאת עוברת דרך מנוע האישורים הקנוני — אין נתיב ביצוע ללא אישור.",
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    submitForReview: true,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: [...APPROVAL_REQUIRED_ACTIONS],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "12 הפעולות הקנוניות מחייבות רשומת Approval במצב מאושר/נערך לפני ביצוע",
          "דחייה מחייבת נימוק; עריכה מחייבת את הנוסח הערוך — והוא מה שמבוצע",
          "ביצוע ללא אישור זורק שגיאה מובנית (AGENT_EXECUTION_WITHOUT_APPROVAL) ונרשם ביומן",
          "אישור הוא תמיד בשם — אין אישור אנונימי ואין אישור על ידי סוכן",
        ],
      },
    ],
  },
  {
    key: "agent-permissions",
    titleHe: "מדיניות הרשאות סוכנים",
    summaryHe: "deny-by-default: הרשאה קיימת רק כהענקה מפורשת שאינה אסורה; ההגדרות קפואות.",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    submitForReview: true,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: ["permission-change"],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "canAgent מחזיר אמת רק להענקה מפורשת שאינה בתחום אסור — כל השאר נדחה",
          "AGENT_DEFINITIONS קפואות עמוק — סוכן לעולם אינו משנה את הרשאותיו",
          "approvals ו-auditEvents אסורים לכל הסוכנים — לעולם",
          "שינוי הרשאות הוא פעולת אישור קנונית (permission-change) של אדם בלבד",
        ],
      },
    ],
  },
  {
    key: "data-privacy",
    titleHe: "מדיניות פרטיות והגנת מידע",
    summaryHe: "אין חשיפת סודות/מפתחות; לוגים וייצוא עוברים redaction; מידע רגיש נשאר במערכת.",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    submitForReview: false,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: ["record-deletion"],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "כל שורת לוג שרת עוברת redact() — מפתחות/סודות ממוסכים לפני כתיבה",
          "ייצוא ביקורת הוא redacted בלבד — אין סודות ואין payload מלא",
          "אין להדביק פרטי לקוחות בכלים חיצוניים",
          "חשיפת מידע רגיש בזיכרון נרשמת כאירוע ביקורת (memory.sensitive-reveal)",
        ],
      },
    ],
  },
  {
    key: "prompt-security",
    titleHe: "מדיניות אבטחת פרומפטים",
    summaryHe: "פרומפטים בשכבות מופרדות מבנית; זיהוי הזרקה היוריסטי + הסגר; טקסט מוגן לא נחשף.",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    submitForReview: false,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: [],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "6 שכבות מופרדות: מדיניות מערכת, תפקיד, פעולה, הקשר מאומת, קלט לא-מהימן, סכמת תשובה",
          "זיהוי הזרקה הוא היוריסטי ולא מושלם — תוכן חשוד מוסגר, מסומן ומבוקר",
          "אישור אנושי חוסם כל פלט משנה-נתונים גם אם ההזרקה חמקה מהזיהוי",
          "טקסט פרומפט מוגן לעולם אינו נשמר או מוצג בצד הלקוח — checksum בלבד",
        ],
      },
    ],
  },
  {
    key: "provider-configuration",
    titleHe: "מדיניות ספקי AI ותצורת מודלים",
    summaryHe: "מצב A: מנוע מקומי פעיל, ספק מרוחק מושבת; שם מודל לעולם אינו בצד הלקוח.",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    submitForReview: false,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: ["financial-commitment"],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "המנוע המקומי לעולם אינו מתחזה למודל — model:null, usage.measured:false",
          "ספק מרוחק מופעל רק לאחר אימות שרת; fallback לעולם אינו שקט",
          "תקציב סוכנים 0 ₪ — אין הוצאה ללא הגדרה מפורשת ואישור",
          "מפתחות וסודות בצד השרת בלבד — הלקוח פונה לנקודות קצה יחסיות בלבד",
        ],
      },
    ],
  },
  {
    key: "governed-learning",
    titleHe: "מדיניות למידה מנוהלת",
    summaryHe: "אין למידה אוטונומית: כלל נכנס לתוקף רק אחרי אישור מנהל בשם, והוא הפיך תמיד.",
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    submitForReview: false,
    affectedAgentIds: ["ag-wiki", "ag-fixer", "ag-mentor"],
    affectedOperations: ["permanent-knowledge-update"],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "כלל למידה נוצר רק מהצעה מאושרת בשם דרך מנוע האישורים הקנוני",
          "מקרה יחיד לעולם אינו הופך לכלל — סימון חובה וחסימה סכמתית",
          "כלל משפיע רק על משטח מוגבל (דירוג/טיוטה/תזמון) — הרשאות ואבטחה בלתי ניתנות לביטוי",
          "כל כלל ניתן לביטול (rollback) ויישומי העבר נשארים גלויים",
        ],
      },
    ],
  },
  {
    key: "knowledge-memory",
    titleHe: "מדיניות ידע וזיכרון ארגוני",
    summaryHe: "עדכון קבוע בידע/זיכרון מחייב אישור; גרסאות append-only; מקור לכל טענה.",
    ownerId: "u-oren",
    ownerName: "אורן שגב",
    submitForReview: false,
    affectedAgentIds: ["ag-wiki"],
    affectedOperations: ["permanent-knowledge-update", "permanent-memory-update", "record-deletion"],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "סוכן ידע מציע עדכונים בלבד — כתיבה קבועה מחייבת אישור אנושי",
          "גרסאות ידע וזיכרון הן append-only — עדכון/מחיקה של גרסה נחסמים במאגר",
          "סתירות מסומנות ומוצגות — לעולם לא מוסתרות",
          "כל רשומת ידע נושאת מקור; טענה ללא מקור אינה ידע מאושר",
        ],
      },
    ],
  },
  {
    key: "audit-logging",
    titleHe: "מדיניות ביקורת ותיעוד",
    summaryHe: "כל פעולת סוכן/אישור/הכרעה נרשמת כ-AuditEvent עם correlationId; היומן אינו נמחק.",
    ownerId: "u-noa",
    ownerName: "נעה פרידמן",
    submitForReview: false,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: [...APPROVAL_REQUIRED_ACTIONS],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "כל בקשת אישור, הכרעה, ביצוע ו-rollback כותבים רשומת ביקורת",
          "correlationId מקשר שרשרת אירועים של אותה פעולה",
          "סוכנים לעולם אינם כותבים/משנים רשומות ביקורת בעצמם (תחום אסור)",
          "פערי כיסוי (פעולה ללא ראיות/ביקורת) הם ממצא של מבקר הממשל",
        ],
      },
    ],
  },
  {
    key: "incident-response",
    titleHe: "מדיניות ניהול תקריות ותגובה",
    summaryHe: "אירוע AI מדווח, מוקצה, מוכל, נפתר ונחקר — סגירה מחייבת תחקיר ומעקב.",
    ownerId: "u-ran",
    ownerName: "רן אלמוג",
    submitForReview: false,
    affectedAgentIds: ALL_AGENTS,
    affectedOperations: ["external-notification"],
    sections: [
      {
        headingHe: "עקרונות",
        bulletsHe: [
          "כל חשד להפרת מדיניות/אבטחה נפתח כ-GovernanceIncident עם חומרה ובעלים",
          "הכלה לפני פתרון: אירוע מוכל מתועד עם צעדי הכלה",
          "סגירה מחייבת תחקיר (GovernanceReview) עם ממצאים ופעולות המשך",
          "אירועים קשורים מקושרים לרשומות הביקורת האמיתיות — לא לתיאור חופשי",
        ],
      },
    ],
  },
];
