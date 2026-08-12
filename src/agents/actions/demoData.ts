// S11.3 — deterministic SYNTHETIC demo dataset for the agent business actions.
// This data is owned by the agent-actions layer and is entirely synthetic
// (@example.com, invented Hebrew names). It intentionally does NOT touch the real
// Customers/Contacts persistence — mutations happen against an isolated in-memory
// demo store (see engine.ts). Everything is frozen so actions can only read it.

export interface DemoCustomer {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly city: string | null;
  readonly segment: string | null;
}

export interface DemoContact {
  readonly id: string;
  readonly customerId: string;
  readonly name: string;
  readonly role: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly isPrimary: boolean;
}

export interface DemoKnowledge {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly sourceHe: string;
  readonly bodyHe: string;
  readonly keywords: readonly string[];
}

export interface DemoRecommendation {
  readonly id: string;
  readonly titleHe: string;
  readonly severity: "low" | "medium" | "high";
  readonly basedOnRecordIds: readonly string[];
  readonly rationaleHe: string;
}

// ── customers: some deliberately incomplete (missing email / phone / city) ──
export const DEMO_CUSTOMERS: readonly DemoCustomer[] = Object.freeze([
  { id: "dc-1", name: "מאפיית הבוקר", email: "boker@example.com", phone: "03-5550001", city: "תל אביב", segment: "מזון" },
  { id: "dc-2", name: "סטודיו אורות", email: null, phone: "03-5550002", city: "חיפה", segment: null },
  { id: "dc-3", name: "מוסך הצפון", email: "north@example.com", phone: null, city: null, segment: "רכב" },
  { id: "dc-4", name: "קליניקת שקד", email: null, phone: null, city: "ירושלים", segment: "בריאות" },
  { id: "dc-5", name: "דפוס גל", email: "gal@example.com", phone: "04-5550005", city: "עכו", segment: "דפוס" },
].map((c) => Object.freeze(c)));

// ── contacts: dc-2 has NO primary; dc-4 has NONE at all; some miss phone/email ──
export const DEMO_CONTACTS: readonly DemoContact[] = Object.freeze([
  { id: "dk-1", customerId: "dc-1", name: "רות לוי", role: "בעלים", phone: "050-5550101", email: "ruth@example.com", isPrimary: true },
  { id: "dk-2", customerId: "dc-2", name: "עידן כהן", role: "רכש", phone: "050-5550102", email: null, isPrimary: false },
  { id: "dk-3", customerId: "dc-3", name: "מאיר בר", role: "מנהל", phone: null, email: "meir@example.com", isPrimary: true },
  { id: "dk-4", customerId: "dc-5", name: "נועה גל", role: "בעלים", phone: "050-5550104", email: "noa@example.com", isPrimary: true },
  { id: "dk-5", customerId: "dc-1", name: "אבי דן", role: "תפעול", phone: null, email: null, isPrimary: false },
].map((c) => Object.freeze(c)));

// ── local structured knowledge (Nexa/Wiki source) ──
export const DEMO_KNOWLEDGE: readonly DemoKnowledge[] = Object.freeze([
  {
    id: "kn-1", title: "מדיניות מצב הדגמה", category: "מדיניות",
    sourceHe: "מדריך ההטמעה · פרק 2",
    bodyHe: "במצב הדגמה כל הנתונים סינתטיים ואין שליחת הודעות אמיתיות. לקוחות ואנשי קשר בלבד מחוברים ל-Supabase.",
    keywords: ["הדגמה", "דמו", "סינתטי", "מצב"],
  },
  {
    id: "kn-2", title: "היכן מנהלים לקוחות ולידים", category: "ניווט",
    sourceHe: "מרכז חומרי ההדרכה",
    bodyHe: "ניהול לקוחות מתבצע במסך הלקוחות; לידים והזדמנויות במסך ה-CRM.",
    keywords: ["לקוחות", "לידים", "crm", "ניווט"],
  },
  {
    id: "kn-3", title: "מדיניות אישורים אנושיים", category: "ממשל",
    sourceHe: "ממשל ובקרת AI",
    bodyHe: "כל פעולה שמבצעת שינוי מחייבת אישור אנושי מפורש. הסוכנים מציעים בלבד ולעולם אינם מבצעים שינוי שקט.",
    keywords: ["אישור", "ממשל", "HITL", "שינוי"],
  },
  {
    id: "kn-4", title: "שערי מעבר וראיות", category: "הטמעה",
    sourceHe: "Stage Gates",
    bodyHe: "מעבר בין שלבים מותנה בראיות. כל המלצה מוצגת עם המקור והנתונים שעליהם היא מבוססת.",
    keywords: ["שערים", "ראיות", "מעבר", "stage"],
  },
].map((k) => Object.freeze({ ...k, keywords: Object.freeze(k.keywords) })));

// ── deterministic recommendations (Orchestrator/Mentor explain) ──
const RAW_RECOMMENDATIONS: readonly DemoRecommendation[] = [
  {
    id: "rec-1", titleHe: "השלמת פרטי קשר לשני לקוחות", severity: "high",
    basedOnRecordIds: ["dc-2", "dc-4"],
    rationaleHe: "שני לקוחות ללא דוא\"ל, אחד ללא איש קשר ראשי — פוגע ביכולת המעקב.",
  },
  {
    id: "rec-2", titleHe: "בניית רצף פולואו-אפ ללקוח חדש", severity: "medium",
    basedOnRecordIds: ["dc-5"],
    rationaleHe: "לקוח פעיל ללא רצף מעקב מוגדר — מומלץ ליצור רצף דטרמיניסטי.",
  },
  {
    id: "rec-3", titleHe: "תיוג מקטע שוק חסר", severity: "low",
    basedOnRecordIds: ["dc-2"],
    rationaleHe: "מקטע השוק חסר עבור לקוח אחד — פוגע בפילוח.",
  },
];
export const DEMO_RECOMMENDATIONS: readonly DemoRecommendation[] = Object.freeze(
  RAW_RECOMMENDATIONS.map((r) => Object.freeze({ ...r, basedOnRecordIds: Object.freeze(r.basedOnRecordIds) })),
);

/** Required fields a complete customer demo record must have. */
export const REQUIRED_CUSTOMER_FIELDS: readonly (keyof DemoCustomer)[] = Object.freeze([
  "email", "phone", "city", "segment",
]);

/** Required fields a complete contact demo record must have. */
export const REQUIRED_CONTACT_FIELDS: readonly (keyof DemoContact)[] = Object.freeze([
  "phone", "email",
]);

export const FIELD_LABELS_HE: Readonly<Record<string, string>> = Object.freeze({
  email: "דוא\"ל", phone: "טלפון", city: "עיר", segment: "מקטע שוק", role: "תפקיד",
});
