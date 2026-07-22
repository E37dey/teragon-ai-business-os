// TERAGON AI BUSINESS OS — deterministic Hebrew seed (Wave 1).
// Adapted + extended from the donor mockData (teragon-final). Internally consistent:
// every dashboard KPI is derivable from these arrays — no hardcoded numbers anywhere.
// All records are demo data, marked via DEMO_DATA_LABEL. No fabricated AI quality metrics:
// unmeasured values are null ("טרם נמדד").
import type {
  Activity,
  Agent,
  AgentConflict,
  AgentHandoff,
  AgentMessage,
  AgentTask,
  AIRecommendation,
  Approval,
  AuditEvent,
  Automation,
  AutomationRun,
  Contact,
  Control,
  Course,
  CourseSession,
  Assignment,
  Customer,
  CustomerPrinter,
  Document,
  Enrollment,
  Evidence,
  ImplementationStage,
  ISODate,
  KnowledgeNote,
  Lead,
  LearningPath,
  LearningPathStage,
  MemoryRecord,
  MetricDefinition,
  MetricObservation,
  Opportunity,
  Organization,
  Persona,
  PrinterModel,
  Product,
  Quotation,
  RepairAction,
  Risk,
  Role,
  ServiceTicket,
  StageGate,
  StageProgress,
  StageProgressStatus,
  Student,
  SupportRequest,
  Task,
  Meeting,
  TrainingMaterial,
  User,
} from "@/domain/types";

// ---------------------------------------------------------------------------
// identity & helpers
// ---------------------------------------------------------------------------

/** Every seeded record belongs to the demo dataset and is labeled as such in the UI. */
export const DEMO_DATA_LABEL = "נתוני הדגמה";

export const COMPANY_NAME = "טרגון טכנולוגיות";
export const CEO_NAME = "צחי זוסטייהם";
export const CEO_USER_ID = "u-tzachi";
export const GREETING = "ערב טוב, צחי";

/** Deterministic anchor — the seed is stable regardless of when it runs. */
export const SEED_ANCHOR: ISODate = "2026-07-22";

/** date offset in days from the anchor → "YYYY-MM-DD" */
export function d(off: number): ISODate {
  const t = new Date(`${SEED_ANCHOR}T12:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + off);
  return t.toISOString().slice(0, 10);
}

/** datetime offset (days, hour) from the anchor → full ISO string */
export function dt(off: number, hour = 9, minute = 0): ISODate {
  const t = new Date(`${SEED_ANCHOR}T00:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + off);
  t.setUTCHours(hour, minute, 0, 0);
  return t.toISOString();
}

/** createdAt/updatedAt stamp */
function meta(createdOff: number, updatedOff = createdOff) {
  return { createdAt: dt(createdOff, 8), updatedAt: dt(updatedOff, 16) };
}

// ---------------------------------------------------------------------------
// users & roles
// ---------------------------------------------------------------------------

export const USERS: User[] = [
  { id: CEO_USER_ID, name: CEO_NAME, role: 'מנכ"ל', email: "tzachi@teragon.co.il", phone: "050-2000001", status: "פעיל", ...meta(-120) },
  { id: "u-maya", name: "מאיה ברק", role: "מכירות", email: "maya@teragon.co.il", phone: "050-2000002", status: "פעיל", ...meta(-110) },
  { id: "u-oren", name: "אורן שגב", role: "מדריך", email: "oren@teragon.co.il", phone: "050-2000003", status: "פעיל", ...meta(-110) },
  { id: "u-ran", name: "רן אלמוג", role: "תמיכה", email: "ran@teragon.co.il", phone: "050-2000004", status: "פעיל", ...meta(-100) },
  { id: "u-noa", name: "נעה פרידמן", role: "מנהל מערכת", email: "noa@teragon.co.il", phone: "050-2000005", status: "פעיל", ...meta(-90) },
];

export const ROLES: Role[] = [
  { id: "role-1", key: 'מנכ"ל', label: "מנכ\"ל", description: "גישה מלאה לכל המערכת, מאשר פעולות AI רגישות", permissions: ["הכול", "אישור סוכנים", "ניהול משתמשים", "תקציב"], ...meta(-120) },
  { id: "role-2", key: "מכירות", label: "מכירות", description: "ניהול לידים, הצעות מחיר ולקוחות", permissions: ["לידים", "הצעות מחיר", "לקוחות"], ...meta(-120) },
  { id: "role-3", key: "מדריך", label: "מדריך", description: "ניהול קורסים, תלמידים ואישורי שלבים", permissions: ["קורסים", "תלמידים", "אישורי שלבים"], ...meta(-120) },
  { id: "role-4", key: "תמיכה", label: "תמיכה", description: "קריאות שירות ותיקונים", permissions: ["קריאות שירות", "תיקונים"], ...meta(-120) },
  { id: "role-5", key: "תלמיד", label: "תלמיד/ה", description: "גישה למסלול הלמידה האישי בלבד", permissions: ["מסלול אישי"], ...meta(-120) },
  { id: "role-6", key: "מנהל מערכת", label: "מנהל מערכת", description: "תצורה, הרשאות וניטור המערכת", permissions: ["תצורה", "הרשאות", "יומן ביקורת"], ...meta(-120) },
];

// ---------------------------------------------------------------------------
// organizations
// ---------------------------------------------------------------------------

export const ORGANIZATIONS: Organization[] = [
  { id: "org-1", name: COMPANY_NAME, type: "עסק", phone: "03-9000000", email: "office@teragon.co.il", city: "פתח תקווה", notes: "הארגון שלנו — הדפסת תלת־ממד, קורסים ושירות", status: "פעיל", ...meta(-120) },
  { id: "org-2", name: "בי\"ס אורט עמק חפר", type: "בית ספר", phone: "04-9988776", email: "ort@school.edu", city: "עמק חפר", notes: "מגמה הנדסית, 25 תלמידים, 3 מדפסות", status: "פעיל", ...meta(-60) },
  { id: "org-3", name: "סטודיו דגש", type: "עסק", phone: "03-5556677", email: "info@dagesh.co", city: "תל אביב", notes: "סטודיו עיצוב, חבילת ליווי פרמיום שנתית", status: "פעיל", ...meta(-80) },
  { id: "org-4", name: "מכללת אפיק", type: "ארגון", phone: "08-6001122", email: "afik@college.ac.il", city: "באר שבע", notes: "מתעניינים בהקמת מעבדת תלת־ממד", status: "פעיל", ...meta(-30) },
  { id: "org-5", name: "מותק מוצרי אפייה", type: "עסק", phone: "050-2474095", email: "luv@cakes.co", city: "רעננה", notes: "תבניות אפייה מודפסות בהתאמה אישית", status: "פעיל", ...meta(-70) },
];

// ---------------------------------------------------------------------------
// customers & contacts (15 customers)
// ---------------------------------------------------------------------------

export const CUSTOMERS: Customer[] = [
  { id: "cu-1", name: "אבי לוטם", type: "פרטי", phone: "050-9990011", email: "avi.l@gmail.com", city: "רמת גן", organizationId: null, printerSummary: "Bambu Lab A1", courseNames: ["מבוא להדפסת תלת־ממד"], revenue: 4480, contactState: "פעיל", review: { rating: 5, text: "ליווי מדהים, צחי תמיד זמין." }, status: "פעיל", ...meta(-90, -3) },
  { id: "cu-2", name: "סטודיו דגש", type: "עסק", phone: "03-5556677", email: "info@dagesh.co", city: "תל אביב", organizationId: "org-3", printerSummary: "Bambu Lab P1S", courseNames: ["Fusion 360"], revenue: 18900, contactState: "פעיל", review: null, status: "פעיל", ...meta(-80, -4) },
  { id: "cu-3", name: "בי\"ס אורט עמק חפר", type: "בית ספר", phone: "04-9988776", email: "ort@school.edu", city: "עמק חפר", organizationId: "org-2", printerSummary: "Creality K1 (x3)", courseNames: [], revenue: 25200, contactState: "ממתין למענה", review: null, status: "פעיל", ...meta(-60, -2) },
  { id: "cu-4", name: "ליאור אבן־חן", type: "פרטי", phone: "052-3334455", email: "lior@eng.com", city: "חיפה", organizationId: null, printerSummary: "Prusa MK4", courseNames: ["SolidWorks"], revenue: 1990, contactState: "פעיל", review: { rating: 5, text: "הקורס היה יסודי ומדויק." }, status: "פעיל", ...meta(-75, -10) },
  { id: "cu-5", name: "מותק מוצרי אפייה", type: "עסק", phone: "050-2474095", email: "luv@cakes.co", city: "רעננה", organizationId: "org-5", printerSummary: "Bambu Lab A1 Mini", courseNames: ["מבוא להדפסת תלת־ממד"], revenue: 3290, contactState: "פעיל", review: { rating: 5, text: "מענה מיידי לכל תקלה, ממליצים בחום." }, status: "פעיל", ...meta(-70, -6) },
  { id: "cu-6", name: "דנה כרמל", type: "פרטי", phone: "054-8811223", email: "dana.c@gmail.com", city: "כפר סבא", organizationId: null, printerSummary: "Bambu Lab A1", courseNames: ["מבוא להדפסת תלת־ממד", "AI + הדפסת תלת־ממד"], revenue: 3980, contactState: "פעיל", review: { rating: 5, text: "הקורס פתח לי עולם חדש." }, status: "פעיל", ...meta(-55, -1) },
  { id: "cu-7", name: "יואב שדה", type: "פרטי", phone: "053-7712345", email: "yoav.s@gmail.com", city: "הרצליה", organizationId: null, printerSummary: "Creality Ender 3", courseNames: ["מבוא להדפסת תלת־ממד"], revenue: 1490, contactState: "פעיל", review: null, status: "פעיל", ...meta(-50, -12) },
  { id: "cu-8", name: "מיכל רוזן", type: "פרטי", phone: "050-6655443", email: "michal.r@arch.co.il", city: "תל אביב", organizationId: null, printerSummary: "Creality K1", courseNames: ["מבוא להדפסת תלת־ממד"], revenue: 3980, contactState: "פעיל", review: null, status: "פעיל", ...meta(-48, -5) },
  { id: "cu-9", name: "רועי מלכה", type: "פרטי", phone: "058-9900112", email: "roy.m@startup.io", city: "תל אביב", organizationId: null, printerSummary: "Bambu Lab P1S", courseNames: ["מבוא להדפסת תלת־ממד"], revenue: 4780, contactState: "ממתין למענה", review: null, status: "פעיל", ...meta(-45, -8) },
  { id: "cu-10", name: "תמר אלבז", type: "פרטי", phone: "052-4455661", email: "tamar.e@edu.org", city: "נתניה", organizationId: null, printerSummary: "Bambu Lab A1 Mini", courseNames: ["מבוא להדפסת תלת־ממד"], revenue: 2780, contactState: "פעיל", review: null, status: "פעיל", ...meta(-42, -4) },
  { id: "cu-11", name: "מכללת אפיק", type: "ארגון", phone: "08-6001122", email: "afik@college.ac.il", city: "באר שבע", organizationId: "org-4", printerSummary: "טרם נרכשו מדפסות", courseNames: [], revenue: 0, contactState: "ממתין למענה", review: null, status: "פעיל", ...meta(-30, -7) },
  { id: "cu-12", name: "נועם קדם", type: "פרטי", phone: "054-1212344", email: "noam.k@gmail.com", city: "ראשון לציון", organizationId: null, printerSummary: "Bambu Lab A1", courseNames: ["Bambu Studio מהיסוד"], revenue: 3280, contactState: "פעיל", review: { rating: 4, text: "שירות טוב, זמני תגובה מהירים." }, status: "פעיל", ...meta(-38, -9) },
  { id: "cu-13", name: "אפרת לוין", type: "פרטי", phone: "050-3411227", email: "efrat.l@design.co", city: "גבעתיים", organizationId: null, printerSummary: "Prusa MK4", courseNames: ["Fusion 360"], revenue: 6190, contactState: "פעיל", review: null, status: "פעיל", ...meta(-36, -11) },
  { id: "cu-14", name: "גיא אשכנזי", type: "עסק", phone: "03-7788990", email: "guy@proto-lab.co.il", city: "בני ברק", organizationId: null, printerSummary: "Bambu Lab X1C", courseNames: [], revenue: 12400, contactState: "פעיל", review: null, status: "פעיל", ...meta(-33, -2) },
  { id: "cu-15", name: "שירה נחום", type: "פרטי", phone: "052-9988770", email: "shira.n@gmail.com", city: "מודיעין", organizationId: null, printerSummary: "Bambu Lab A1 Mini", courseNames: ["מבוא להדפסת תלת־ממד"], revenue: 1490, contactState: "לא פעיל", review: null, status: "פעיל", ...meta(-100, -60) },
];

export const CONTACTS: Contact[] = [
  { id: "ct-1", customerId: "cu-2", name: "עדי דגן", role: "מנהלת סטודיו", phone: "03-5556678", email: "adi@dagesh.co", isPrimary: true, ...meta(-80) },
  { id: "ct-2", customerId: "cu-3", name: "רותי שמעוני", role: "רכזת מגמה הנדסית", phone: "04-9988777", email: "ruti@school.edu", isPrimary: true, ...meta(-60) },
  { id: "ct-3", customerId: "cu-3", name: "אבי כספי", role: "מנהל בית הספר", phone: "04-9988778", email: "avi@school.edu", isPrimary: false, ...meta(-58) },
  { id: "ct-4", customerId: "cu-5", name: "לובה מרגלית", role: "בעלים", phone: "050-2474095", email: "luv@cakes.co", isPrimary: true, ...meta(-70) },
  { id: "ct-5", customerId: "cu-11", name: "ד\"ר יעל ברקאי", role: "ראש תחום חדשנות", phone: "08-6001123", email: "yael@college.ac.il", isPrimary: true, ...meta(-30) },
  { id: "ct-6", customerId: "cu-14", name: "גיא אשכנזי", role: "בעלים", phone: "03-7788990", email: "guy@proto-lab.co.il", isPrimary: true, ...meta(-33) },
];

// ---------------------------------------------------------------------------
// leads (15, spread across the funnel)
// ---------------------------------------------------------------------------

export const LEADS: Lead[] = [
  { id: "l-1", name: "אבי ברק", phone: "050-1234567", email: "avi@gmail.com", source: "אתר", interest: "קורס Fusion 360", status: "חדש", ownerId: "u-maya", followUp: d(1), notes: "רוצה ללמוד Fusion 360 בזום כדי לתכנן מוצרים.", history: [{ date: d(-1), text: "השאיר פנייה דרך הטופס באתר." }], ...meta(-1, 0) },
  { id: "l-2", name: "נועה גל", phone: "052-7654321", email: "noa@maker.io", source: "אינסטגרם", interest: "רכישת מדפסת", status: "נוצר קשר", ownerId: "u-maya", followUp: d(0), notes: "מתלבטת בין דגמי Bambu לתחביב.", history: [{ date: d(-3), text: "שיחת טלפון ראשונית, נשלח קטלוג." }], ...meta(-3, -1) },
  { id: "l-3", name: "בי\"ס אורט עמק חפר", phone: "04-9988776", email: "ort@school.edu", source: "המלצה", interest: "הדרכה לבית ספר / ארגון", status: "נשלחה הצעה", ownerId: CEO_USER_ID, followUp: d(2), notes: "הדרכה לתלמידי המגמה ההנדסית, כ-25 תלמידים.", history: [{ date: d(-7), text: "פגישת זום עם רכזת המגמה." }, { date: d(-4), text: "נשלחה הצעת מחיר." }], ...meta(-7, -4) },
  { id: "l-4", name: "דני פרץ", phone: "054-1112233", email: "danny@biz.co", source: "וואטסאפ", interest: "תיקון מדפסת", status: "ממתין לתשובה", ownerId: "u-ran", followUp: d(0), notes: "השכבה הראשונה לא נדבקת ויש סתימה בראש.", history: [{ date: d(-2), text: "תיאר תקלה בוואטסאפ, נשלחו שאלות אבחון." }], ...meta(-2, -1) },
  { id: "l-5", name: "סטודיו דגש", phone: "03-5556677", email: "info@dagesh.co", source: "לקוח חוזר", interest: "שירות פרמיום", status: "קיבל פרטים", ownerId: CEO_USER_ID, followUp: d(3), notes: "חבילת ליווי פרמיום שנתית למערך ההדפסה.", history: [{ date: d(-5), text: "פנייה לחידוש ליווי." }], ...meta(-5, -2) },
  { id: "l-6", name: "עומר כהן", phone: "058-4455667", email: "omer@gmail.com", source: "פייסבוק", interest: "קורס Bambu Studio", status: "חדש", ownerId: "u-maya", followUp: d(1), notes: "מתחיל לגמרי, רוצה ללמוד בזום.", history: [{ date: d(0), text: "הגיב לפוסט בפייסבוק." }], ...meta(0) },
  { id: "l-7", name: "יעל דרור", phone: "050-7778899", email: "yael@gmail.com", source: "וואטסאפ", interest: "תיקון מדפסת", status: "נוצר קשר", ownerId: "u-ran", followUp: d(0), notes: "סתימה בראש ההדפסה, הפילמנט לא יוצא.", history: [{ date: d(-1), text: "שלחה סרטון של התקלה." }], ...meta(-1, 0) },
  { id: "l-8", name: "ליאור אבן־חן", phone: "052-3334455", email: "lior@eng.com", source: "אתר", interest: "קורס SolidWorks", status: "קיבל פרטים", ownerId: "u-maya", followUp: d(4), notes: "רמה מתקדמת לחלקים טכניים.", history: [{ date: d(-6), text: "ביקש סילבוס מפורט." }], ...meta(-6, -3) },
  { id: "l-9", name: "מכללת אפיק", phone: "08-6001122", email: "afik@college.ac.il", source: "המלצה", interest: "הדרכה לבית ספר / ארגון", status: "במשא ומתן", ownerId: CEO_USER_ID, followUp: d(2), notes: "הקמת מעבדת תלת־ממד + הכשרת צוות.", history: [{ date: d(-12), text: "פגישה ראשונה." }, { date: d(-6), text: "נשלחה הצעה ראשונית." }, { date: d(-2), text: "דיון על היקף וההכשרה." }], ...meta(-12, -2) },
  { id: "l-10", name: "רותם פלד", phone: "053-2223344", email: "rotem@design.co", source: "אינסטגרם", interest: "רכישת מדפסת", status: "ממתין לתשובה", ownerId: "u-maya", followUp: d(0), notes: "ייעוץ לפני רכישת מדפסת ראשונה לעבודות עיצוב.", history: [{ date: d(-2), text: "שיחת ייעוץ ראשונית." }], ...meta(-2, -1) },
  { id: "l-11", name: "אבי לוטם", phone: "050-9990011", email: "avi.l@gmail.com", source: "לקוח חוזר", interest: "שירות פרמיום", status: "נוצר קשר", ownerId: CEO_USER_ID, followUp: d(1), notes: "לקוח ותיק שרוצה ליווי מתמשך אחרי קורס.", history: [{ date: d(-3), text: "ביקש פרטים על חבילת ליווי." }], ...meta(-3, -1) },
  { id: "l-12", name: "שיר אזולאי", phone: "054-7776655", email: "shir@gmail.com", source: "טלפון", interest: "קורס תלת־ממד", status: "חדש", ownerId: "u-maya", followUp: d(1), notes: "סיימה קורס מבוא וצריכה קורס המשך.", history: [{ date: d(0), text: "התקשרה לברר על קורס המשך." }], ...meta(0) },
  { id: "l-13", name: "ניר שלו", phone: "050-3141592", email: "nir@startup.io", source: "אתר", interest: "קורס AI + תלת־ממד", status: "חדש", ownerId: "u-maya", followUp: d(1), notes: "רוצה ללמוד Chat-to-CAD — מ-prompt למודל מודפס.", history: [{ date: d(0), text: "נרשם לרשימת המתנה לקורס ה-AI." }], ...meta(0) },
  { id: "l-14", name: "גיא אשכנזי", phone: "03-7788990", email: "guy@proto-lab.co.il", source: "המלצה", interest: "רכישת מדפסת", status: "נסגר כלקוח", ownerId: CEO_USER_ID, followUp: d(7), notes: "רכש X1C + חבילת הטמעה. הפך ללקוח cu-14.", history: [{ date: d(-20), text: "פנייה דרך ממליץ." }, { date: d(-14), text: "הדגמה במעבדה." }, { date: d(-9), text: "סגירה ותשלום." }], ...meta(-20, -9) },
  { id: "l-15", name: "אורית ספיר", phone: "052-6161616", email: "orit@gmail.com", source: "פייסבוק", interest: "קורס תלת־ממד", status: "לא רלוונטי", ownerId: "u-maya", followUp: d(-5), notes: "חיפשה קורס פיזי בצפון — לא מתאים כרגע.", history: [{ date: d(-10), text: "שיחה — מחפשת פרונטלי בלבד." }], ...meta(-10, -8) },
];

// ---------------------------------------------------------------------------
// opportunities
// ---------------------------------------------------------------------------

export const OPPORTUNITIES: Opportunity[] = [
  { id: "opp-1", name: "מעבדת תלת־ממד — מכללת אפיק", leadId: "l-9", customerId: "cu-11", stage: "משא ומתן", amount: 86000, expectedClose: d(20), ownerId: CEO_USER_ID, notes: "6 מדפסות + הכשרת צוות + ליווי שנה", ...meta(-12, -2) },
  { id: "opp-2", name: "הדרכה שנתית — אורט עמק חפר", leadId: "l-3", customerId: "cu-3", stage: "הצעה", amount: 9800, expectedClose: d(14), ownerId: CEO_USER_ID, notes: "סדנה ל-25 תלמידים + 3 מדפסות", ...meta(-7, -4) },
  { id: "opp-3", name: "ליווי פרמיום — סטודיו דגש", leadId: "l-5", customerId: "cu-2", stage: "אפיון צרכים", amount: 3600, expectedClose: d(10), ownerId: CEO_USER_ID, notes: "חידוש שנתי", ...meta(-5, -2) },
  { id: "opp-4", name: "מדפסת + הדרכה — נועה גל", leadId: "l-2", customerId: null, stage: "זיהוי", amount: 4290, expectedClose: d(12), ownerId: "u-maya", notes: "A1 + התקנה + יום הדרכה", ...meta(-3, -1) },
  { id: "opp-5", name: "X1C + הטמעה — פרוטו־לאב", leadId: "l-14", customerId: "cu-14", stage: "נסגרה - זכייה", amount: 12400, expectedClose: d(-9), ownerId: CEO_USER_ID, notes: "נסגר, הפך ללקוח", ...meta(-20, -9) },
];

// ---------------------------------------------------------------------------
// products & quotations (8 quotations with lines)
// ---------------------------------------------------------------------------

export const PRODUCTS: Product[] = [
  { id: "prod-1", name: "קורס אישי בזום (8 מפגשים)", category: "קורס", description: "8 מפגשים פרטניים + חומרי לימוד + ליווי בוואטסאפ", price: 2490, active: true, ...meta(-120) },
  { id: "prod-2", name: "Bambu Lab A1 + התקנה + הדרכה", category: "מדפסת", description: "מדפסת + התקנה בבית הלקוח + יום הדרכה", price: 4290, active: true, ...meta(-120) },
  { id: "prod-3", name: "הדרכה לבית ספר (עד 25 תלמידים)", category: "שירות", description: "סדנה לכיתה + 3 מדפסות לתקופת ההדרכה", price: 9800, active: true, ...meta(-120) },
  { id: "prod-4", name: "תיקון מדפסת — אבחון וכיול", category: "שירות", description: "אבחון + תיקון + כיול (לא כולל חלקים)", price: 450, active: true, ...meta(-120) },
  { id: "prod-5", name: "חבילת ליווי פרמיום שנתית", category: "שירות", description: "תמיכה בלתי מוגבלת, עדכוני קושחה, כיולים תקופתיים", price: 3600, active: true, ...meta(-120) },
  { id: "prod-6", name: "Bambu Lab X1C", category: "מדפסת", description: "מדפסת דגל לתעשייה קלה", price: 6490, active: true, ...meta(-100) },
  { id: "prod-7", name: "פילמנט PETG (ק\"ג)", category: "חומר גלם", description: "פילמנט PETG איכותי, מגוון צבעים", price: 95, active: true, ...meta(-100) },
  { id: "prod-8", name: "הקמת מעבדת תלת־ממד", category: "שירות", description: "תכנון, ציוד, התקנה והכשרת צוות למוסדות", price: 86000, active: true, ...meta(-40) },
];

export const QUOTATIONS: Quotation[] = [
  { id: "q-1", customerName: "ליאור אבן־חן", customerId: "cu-4", title: "קורס SolidWorks אישי", lines: [{ id: "q-1-1", description: "8 מפגשי SolidWorks פרטניים בזום", quantity: 1, unitPrice: 2490, productId: "prod-1" }], discountPercent: 0, terms: "מקדמה 50%", validUntil: d(10), status: "נשלחה", ownerId: "u-maya", ...meta(-6, -5) },
  { id: "q-2", customerName: "נועה גל", customerId: null, title: "מדפסת + התקנה + הדרכה", lines: [{ id: "q-2-1", description: "Bambu Lab A1 + התקנה + יום הדרכה", quantity: 1, unitPrice: 4290, productId: "prod-2" }], discountPercent: 5, terms: "תשלום מראש", validUntil: d(7), status: "טיוטה", ownerId: "u-maya", ...meta(-3, -1) },
  { id: "q-3", customerName: "בי\"ס אורט עמק חפר", customerId: "cu-3", title: "הדרכה למגמה ההנדסית", lines: [{ id: "q-3-1", description: "סדנה ל-25 תלמידים", quantity: 1, unitPrice: 9800, productId: "prod-3" }, { id: "q-3-2", description: "פילמנט PETG לסדנה", quantity: 6, unitPrice: 95, productId: "prod-7" }], discountPercent: 10, terms: "שוטף + 30", validUntil: d(14), status: "נשלחה", ownerId: CEO_USER_ID, ...meta(-4, -4) },
  { id: "q-4", customerName: "דני פרץ", customerId: null, title: "תיקון מדפסת", lines: [{ id: "q-4-1", description: "אבחון, פתיחת סתימה וכיול", quantity: 1, unitPrice: 450, productId: "prod-4" }], discountPercent: 0, terms: "מזומן", validUntil: d(-2), status: "פג תוקף", ownerId: "u-ran", ...meta(-9, -2) },
  { id: "q-5", customerName: "סטודיו דגש", customerId: "cu-2", title: "חבילת ליווי פרמיום שנתית", lines: [{ id: "q-5-1", description: "ליווי שנתי מלא למערך ההדפסה", quantity: 1, unitPrice: 3600, productId: "prod-5" }], discountPercent: 0, terms: "שנתי מראש", validUntil: d(9), status: "אושרה", ownerId: CEO_USER_ID, ...meta(-5, -1) },
  { id: "q-6", customerName: "מכללת אפיק", customerId: "cu-11", title: "הקמת מעבדת תלת־ממד", lines: [{ id: "q-6-1", description: "הקמת מעבדה — תכנון והתקנה", quantity: 1, unitPrice: 86000, productId: "prod-8" }, { id: "q-6-2", description: "מדפסת X1C נוספת", quantity: 1, unitPrice: 6490, productId: "prod-6" }], discountPercent: 8, terms: "3 תשלומים", validUntil: d(20), status: "נשלחה", ownerId: CEO_USER_ID, ...meta(-6, -2) },
  { id: "q-7", customerName: "גיא אשכנזי", customerId: "cu-14", title: "X1C + חבילת הטמעה", lines: [{ id: "q-7-1", description: "Bambu Lab X1C", quantity: 1, unitPrice: 6490, productId: "prod-6" }, { id: "q-7-2", description: "הטמעה והדרכה", quantity: 1, unitPrice: 2490, productId: "prod-1" }, { id: "q-7-3", description: "פילמנט PETG", quantity: 10, unitPrice: 95, productId: "prod-7" }], discountPercent: 5, terms: "תשלום מראש", validUntil: d(-8), status: "אושרה", ownerId: CEO_USER_ID, ...meta(-14, -9) },
  { id: "q-8", customerName: "שיר אזולאי", customerId: null, title: "קורס המשך מתקדם", lines: [{ id: "q-8-1", description: "קורס אישי בזום — המשך מתקדם", quantity: 1, unitPrice: 2490, productId: "prod-1" }], discountPercent: 0, terms: "מקדמה 50%", validUntil: d(12), status: "נדחתה", ownerId: "u-maya", ...meta(-8, -3) },
];

// ---------------------------------------------------------------------------
// printers (8 models) + customer printers
// ---------------------------------------------------------------------------

export const PRINTER_MODELS: PrinterModel[] = [
  { id: "pm-1", name: "Bambu Lab A1 Mini", manufacturer: "Bambu Lab", technology: "FDM", price: 1290, tags: ["תחביב", "לימודים"], note: "קומפקטית ומצוינת למתחילים ולבתי ספר.", ...meta(-120) },
  { id: "pm-2", name: "Bambu Lab A1", manufacturer: "Bambu Lab", technology: "FDM", price: 1990, tags: ["תחביב", "אב־טיפוס", "לימודים"], note: "איזון מעולה בין מחיר לאיכות.", ...meta(-120) },
  { id: "pm-3", name: "Bambu Lab P1S", manufacturer: "Bambu Lab", technology: "FDM", price: 3290, tags: ["אב־טיפוס", "ייצור קטן", "חלקים טכניים"], note: "תא סגור, מתאימה ל-ABS וחומרים טכניים.", ...meta(-120) },
  { id: "pm-4", name: "Bambu Lab X1C", manufacturer: "Bambu Lab", technology: "FDM", price: 6490, tags: ["ייצור קטן", "חלקים טכניים", "מקצועי"], note: "דגם דגל: LiDAR, סיבי פחמן, מהירות גבוהה.", ...meta(-100) },
  { id: "pm-5", name: "Prusa MK4", manufacturer: "Prusa", technology: "FDM", price: 4200, tags: ["חלקים טכניים", "ייצור קטן"], note: "אמינות גבוהה ודיוק לחלקים מקצועיים.", ...meta(-120) },
  { id: "pm-6", name: "Creality K1", manufacturer: "Creality", technology: "FDM", price: 2490, tags: ["מודלים אדריכליים", "אב־טיפוס"], note: "מהירה, נפח הדפסה גדול.", ...meta(-120) },
  { id: "pm-7", name: "Creality Ender 3", manufacturer: "Creality", technology: "FDM", price: 890, tags: ["תחביב", "תקציב"], note: "נקודת כניסה זולה, דורשת כיול ידני.", ...meta(-120) },
  { id: "pm-8", name: "Elegoo Mars 4 Ultra", manufacturer: "Elegoo", technology: "רזין", price: 1450, tags: ["מיניאטורות", "דיוק גבוה"], note: "רזין 9K לפרטים עדינים — דורשת אוורור.", ...meta(-90) },
];

export const CUSTOMER_PRINTERS: CustomerPrinter[] = [
  { id: "cp-1", customerId: "cu-1", printerModelId: "pm-2", serialNumber: "BL-A1-58201", purchasedAt: d(-85), underWarranty: true, notes: "", ...meta(-85) },
  { id: "cp-2", customerId: "cu-2", printerModelId: "pm-3", serialNumber: "BL-P1S-77410", purchasedAt: d(-78), underWarranty: true, notes: "בשימוש יומיומי בסטודיו", ...meta(-78) },
  { id: "cp-3", customerId: "cu-3", printerModelId: "pm-6", serialNumber: "CR-K1-11203", purchasedAt: d(-55), underWarranty: true, notes: "1 מתוך 3 במעבדת בית הספר", ...meta(-55) },
  { id: "cp-4", customerId: "cu-3", printerModelId: "pm-6", serialNumber: "CR-K1-11204", purchasedAt: d(-55), underWarranty: true, notes: "2 מתוך 3", ...meta(-55) },
  { id: "cp-5", customerId: "cu-3", printerModelId: "pm-6", serialNumber: "CR-K1-11205", purchasedAt: d(-55), underWarranty: true, notes: "3 מתוך 3", ...meta(-55) },
  { id: "cp-6", customerId: "cu-4", printerModelId: "pm-5", serialNumber: "PR-MK4-90331", purchasedAt: d(-70), underWarranty: true, notes: "", ...meta(-70) },
  { id: "cp-7", customerId: "cu-5", printerModelId: "pm-1", serialNumber: "BL-A1M-33108", purchasedAt: d(-66), underWarranty: true, notes: "תבניות אפייה — PETG בלבד", ...meta(-66) },
  { id: "cp-8", customerId: "cu-14", printerModelId: "pm-4", serialNumber: "BL-X1C-20417", purchasedAt: d(-9), underWarranty: true, notes: "נרכשה בעסקת q-7", ...meta(-9) },
];

// ---------------------------------------------------------------------------
// learning: courses (6), paths, students, enrollments
// ---------------------------------------------------------------------------

export const COURSES: Course[] = [
  { id: "c-1", name: "מבוא להדפסת תלת־ממד", type: "מבוא להדפסת תלת־ממד", start: d(-20), end: d(40), price: 1490, status: "פעיל", zoom: "https://zoom.us/j/teragon-intro", instructorId: "u-oren", isAI: false, blurb: "", ...meta(-40, -1) },
  { id: "c-2", name: "Bambu Studio מהיסוד", type: "Bambu Studio", start: d(5), end: d(60), price: 1290, status: "פתוח להרשמה", zoom: "https://zoom.us/j/teragon-bambu", instructorId: "u-oren", isAI: false, blurb: "", ...meta(-30, -2) },
  { id: "c-3", name: "Fusion 360 לתכנון מוצר", type: "Fusion 360", start: d(-40), end: d(-5), price: 1990, status: "הסתיים", zoom: "https://zoom.us/j/teragon-fusion", instructorId: "u-oren", isAI: false, blurb: "", ...meta(-60, -5) },
  { id: "c-4", name: "פתרון תקלות במדפסות", type: "פתרון תקלות במדפסות", start: d(10), end: d(45), price: 990, status: "מלא", zoom: "https://zoom.us/j/teragon-fix", instructorId: "u-ran", isAI: false, blurb: "", ...meta(-25, -3) },
  { id: "c-5", name: "AI + הדפסת תלת־ממד", type: "AI לתכנון תלת־ממד", start: d(7), end: d(63), price: 2490, status: "פתוח להרשמה", zoom: "https://zoom.us/j/teragon-ai", instructorId: "u-oren", isAI: true, blurb: "מ-Prompt למודל מודפס: תכנון חלקים בעזרת AI (Chat-to-CAD), אימות מידות, GD&T והפיכת תמונה של חלק שבור למודל להדפסה.", ...meta(-20, 0) },
  { id: "c-6", name: "SolidWorks לחלקים טכניים", type: "SolidWorks", start: d(14), end: d(74), price: 2190, status: "פתוח להרשמה", zoom: "https://zoom.us/j/teragon-sw", instructorId: "u-oren", isAI: false, blurb: "", ...meta(-15, -1) },
];

const INTRO_STAGES: LearningPathStage[] = [
  { id: "s1", order: 1, name: "שיחת פתיחה והגדרת מטרות", requiresApproval: true, description: "פגישת היכרות עם המדריך, הגדרת מטרות אישיות ורמת הניסיון.", checklist: ["מטרות הוגדרו", "רמת ניסיון תועדה", "ציפיות תואמו"] },
  { id: "s2", order: 2, name: "הכרת מדפסת תלת־ממד", requiresApproval: false, description: "הכרת חלקי המדפסת, סוגי טכנולוגיות (FDM/רזין) ועקרונות פעולה.", checklist: ["זיהוי חלקי המדפסת", "הבנת FDM", "מושגי יסוד"] },
  { id: "s3", order: 3, name: "בטיחות, תחזוקה וחומרי גלם", requiresApproval: false, description: "כללי בטיחות, תחזוקה שוטפת והיכרות עם חומרי גלם נפוצים.", checklist: ["כללי בטיחות", "תחזוקה בסיסית", "אחסון פילמנט"] },
  { id: "s4", order: 4, name: "התקנת תוכנות וסביבת עבודה", requiresApproval: false, description: "התקנת הסלייסר והתוכנות, הגדרת סביבת עבודה תקינה.", checklist: ["סלייסר מותקן", "פרופיל מדפסת", "חיבור למדפסת"] },
  { id: "s5", order: 5, name: "הכרת Slicer / Bambu Studio", requiresApproval: true, description: "עבודה עם הסלייסר: שכבות, מילוי, מהירות, טמפ׳ ותמיכות.", checklist: ["הגדרות שכבה", "מילוי ותמיכות", "Preview"] },
  { id: "s6", order: 6, name: "כיול מדפסת והדפסה ראשונה", requiresApproval: true, description: "כיול מיטה ו-Flow, הדפסת חלק מבחן ראשון ובדיקת איכות.", checklist: ["כיול מיטה", "כיול Flow", "הדפסה ראשונה"] },
  { id: "s7", order: 7, name: "פתרון תקלות נפוצות", requiresApproval: false, description: "זיהוי וטיפול בתקלות: סטרינגינג, וורפינג, הפרדת שכבות, סתימות.", checklist: ["זיהוי תקלה", "פתרון יושם", "תיעוד"] },
  { id: "s8", order: 8, name: "עבודה עם פילמנטים שונים", requiresApproval: false, description: "הדפסה עם PLA, PETG, ABS וניילון — התאמת הגדרות לכל חומר.", checklist: ["PLA", "PETG/ABS", "התאמת טמפ׳"] },
  { id: "s9", order: 9, name: "תכנון מודל בסיסי", requiresApproval: true, description: "סקיצה ותכנון מודל פשוט לקראת מידול דיגיטלי.", checklist: ["סקיצה", "מידות", "חלוקה לחלקים"] },
  { id: "s10", order: 10, name: "מידול ב-CAD", requiresApproval: true, description: "בניית מודל תלת־ממדי בתוכנת CAD נבחרת.", checklist: ["Sketch", "גוף תלת־ממדי", "פיצ׳רים"] },
  { id: "s11", order: 11, name: "הכנת קובץ להדפסה", requiresApproval: false, description: "ייצוא STL, מיקום בסלייסר, תמיכות והגדרות סופיות.", checklist: ["ייצוא STL", "אוריינטציה", "הגדרות סופיות"] },
  { id: "s12", order: 12, name: "ביצוע פרויקט אישי", requiresApproval: true, description: "תכנון והדפסה של פרויקט אישי מקצה לקצה.", checklist: ["תכנון פרויקט", "הדפסה", "תיעוד"] },
  { id: "s13", order: 13, name: "תיקונים ושיפור איכות הדפסה", requiresApproval: false, description: "איטרציה על הפרויקט, כוונון עדין ושיפור הגימור.", checklist: ["זיהוי שיפורים", "איטרציה", "גימור"] },
  { id: "s14", order: 14, name: "סיכום, המלצות והמשך ליווי", requiresApproval: true, description: "סיכום הקורס, מתן המלצות והגדרת מסלול המשך אישי.", checklist: ["סיכום פרויקט", "משוב", "מסלול המשך"] },
];

const AI_STAGES: LearningPathStage[] = [
  { id: "a1", order: 1, name: "מבוא: איך AI פוגש CAD", requiresApproval: false, description: "מה זה Chat-to-CAD ואיפה זה משתלב בעבודת מעצב/מהנדס.", checklist: ["הבנת זרימת Chat-to-CAD", "סקירת ספקי AI", "מקרי שימוש"] },
  { id: "a2", order: 2, name: "כתיבת Prompt הנדסי מדויק", requiresApproval: true, description: "ניסוח תיאור חלק עם מידות, סבולות ופיצ׳רים כך שה-AI יבנה מודל נכון.", checklist: ["Prompt עם מידות", "הגדרת פיצ׳רים", "תוצאה ראשונה"] },
  { id: "a3", order: 3, name: "אוטו-פירוט: ממילה אחת לספק מלא", requiresApproval: false, description: "הרחבת בקשה קצרה למפרט הנדסי מלא לפני הבנייה.", checklist: ["בקשה קצרה", "פירוט אוטומטי", "השוואת תוצאות"] },
  { id: "a4", order: 4, name: "לולאת אימות מידות (QC)", requiresApproval: true, description: "מדידת התוצאה, השוואה לבקשה ותיקון סטיות.", checklist: ["הבנת לולאת QC", "זיהוי סטייה", "תיקון אוטומטי"] },
  { id: "a5", order: 5, name: "Self-healing: תיקון שגיאות קוד", requiresApproval: false, description: "הזנת שגיאות חזרה ל-AI לתיקון והרצה מחדש.", checklist: ["זיהוי שגיאה", "feedback ל-AI", "הרצה חוזרת"] },
  { id: "a6", order: 6, name: "GD&T בעזרת AI", requiresApproval: true, description: "יצירת datums, מסגרות בקרה וסבולות לפי ASME Y14.5.", checklist: ["datums", "מסגרות בקרה", "סבולות"] },
  { id: "a7", order: 7, name: "Image-to-CAD: מתמונה למודל", requiresApproval: true, description: "מהעלאת תמונה של חלק שבור למודל תלת־ממדי להדפסה.", checklist: ["צילום חלק", "זיהוי AI", "מודל להחלפה"] },
  { id: "a8", order: 8, name: "אופטימיזציית משקל וניתוח ייצור", requiresApproval: false, description: "הקלת משקל תוך שמירת חוזק וניתוח התאמה לתהליך.", checklist: ["ניתוח DFM", "הקלת משקל", "בחירת תהליך"] },
  { id: "a9", order: 9, name: "מ-AI להדפסה: ייצוא וסלייסר", requiresApproval: true, description: "ייצוא STEP/STL, הכנה בסלייסר והדפסה בפועל.", checklist: ["ייצוא STL", "הכנה בסלייסר", "הדפסה"] },
  { id: "a10", order: 10, name: "פרויקט גמר: מ-Prompt למוצר מודפס", requiresApproval: true, description: "תכנון חלק פונקציונלי מקצה לקצה בעזרת AI.", checklist: ["תכנון בעזרת AI", "אימות והדפסה", "תיק פרויקט"] },
];

export const LEARNING_PATHS: LearningPath[] = [
  { id: "lp-1", name: "מסלול מבוא להדפסת תלת־ממד", courseId: "c-1", stages: INTRO_STAGES, ...meta(-40) },
  { id: "lp-2", name: "מסלול AI + הדפסת תלת־ממד", courseId: "c-5", stages: AI_STAGES, ...meta(-20) },
];

export const STUDENTS: Student[] = [
  { id: "st-1", name: "דנה כהן", phone: "054-6100001", email: "dana@example.com", userId: null, status: "פעיל", ...meta(-30) },
  { id: "st-2", name: "יואב לוי", phone: "054-6100002", email: "yoav@example.com", userId: null, status: "פעיל", ...meta(-30) },
  { id: "st-3", name: "מיכל ישראלי", phone: "054-6100003", email: "michal@example.com", userId: null, status: "פעיל", ...meta(-30) },
  { id: "st-4", name: "רועי מזרחי", phone: "054-6100004", email: "roey@example.com", userId: null, status: "פעיל", ...meta(-29) },
  { id: "st-5", name: "תמר אברהם", phone: "054-6100005", email: "tamar@example.com", userId: null, status: "פעיל", ...meta(-29) },
  { id: "st-6", name: "עידו נבון", phone: "054-6100006", email: "ido@example.com", userId: null, status: "פעיל", ...meta(-22) },
  { id: "st-7", name: "הילה שרון", phone: "054-6100007", email: "hila@example.com", userId: null, status: "פעיל", ...meta(-21) },
  { id: "st-8", name: "עמית גור", phone: "054-6100008", email: "amit@example.com", userId: null, status: "פעיל", ...meta(-18) },
];

function buildStages(
  tpl: readonly LearningPathStage[],
  over: Record<string, Partial<StageProgress>>,
): StageProgress[] {
  return tpl.map((t, i) => {
    const base: StageProgress = {
      stageId: t.id,
      status: "לא התחיל" satisfies StageProgressStatus,
      due: d(-28 + i * 5),
      text: "",
      files: [],
      links: [],
      checklistDone: [],
      notes: [],
      help: "",
      updated: d(-35),
    };
    const patch = over[t.id];
    return patch ? { ...base, ...patch } : base;
  });
}

export const ENROLLMENTS: Enrollment[] = [
  {
    id: "en-1", studentId: "st-1", studentName: "דנה כהן", courseId: "c-1", payment: "שולם",
    stages: buildStages(INTRO_STAGES, {
      s1: { status: "אושר", text: "מטרה: להדפיס חלקי חילוף לתחביב הרחפנים שלי.", updated: d(-25), checklistDone: ["מטרות הוגדרו", "רמת ניסיון תועדה", "ציפיות תואמו"], notes: [{ author: "אורן שגב", text: "מטרה ברורה, נתחיל מהבסיס.", date: d(-24) }] },
      s2: { status: "אושר", text: "הכרתי את חלקי המדפסת ועקרון ה-FDM.", updated: d(-20) },
      s3: { status: "אושר", text: "סיכמתי כללי בטיחות ותחזוקת מיטה.", updated: d(-16) },
      s4: { status: "הוגש לבדיקה", text: "התקנתי את Bambu Studio וחיברתי את המדפסת.", updated: d(-2), links: [{ label: "צילום מסך התקנה", url: "https://img.example/dana-setup" }] },
      s5: { status: "בעבודה", text: "מתחילה לעבוד עם הסלייסר.", updated: d(-1) },
    }),
    ...meta(-28, -1),
  },
  {
    id: "en-2", studentId: "st-2", studentName: "יואב לוי", courseId: "c-1", payment: "שולם",
    stages: buildStages(INTRO_STAGES, {
      s1: { status: "אושר", text: "מטרה: ייצור קטן של מחזיקי מפתחות ממותגים.", updated: d(-26) },
      s2: { status: "אושר", text: "הכרת מדפסת.", updated: d(-22) },
      s3: { status: "באיחור", due: d(-11), text: "התחלתי אבל לא סיימתי את נושא התחזוקה.", updated: d(-14) },
    }),
    ...meta(-28, -14),
  },
  {
    id: "en-3", studentId: "st-3", studentName: "מיכל ישראלי", courseId: "c-1", payment: "שולם",
    stages: buildStages(INTRO_STAGES, {
      s1: { status: "אושר", text: "מטרה: מודלים אדריכליים למשרד.", updated: d(-27) },
      s2: { status: "אושר", text: "הכרת מדפסת.", updated: d(-23) },
      s3: { status: "אושר", text: "בטיחות ותחזוקה.", updated: d(-18) },
      s4: { status: "ממתין לאישור מדריך", text: "הגשתי את התקנת הסביבה לאישור.", updated: d(-5), files: [{ name: "setup.png", size: "210KB" }] },
    }),
    ...meta(-28, -5),
  },
  {
    id: "en-4", studentId: "st-4", studentName: "רועי מזרחי", courseId: "c-1", payment: "ממתין",
    stages: buildStages(INTRO_STAGES, {
      s1: { status: "אושר", text: "מטרה: אבי טיפוס למוצר סטארטאפ.", updated: d(-28) },
      s2: { status: "נדרש תיקון", text: "הכרת מדפסת.", updated: d(-9), notes: [{ author: "אורן שגב", text: "חסר תיעוד של סוג ה-Hotend, נא להשלים.", date: d(-8) }] },
      s3: { status: "נדרש תיקון", text: "בטיחות.", updated: d(-7), notes: [{ author: "אורן שגב", text: "לא צוין אחסון נכון של פילמנט נגד לחות.", date: d(-6) }] },
    }),
    ...meta(-28, -7),
  },
  {
    id: "en-5", studentId: "st-5", studentName: "תמר אברהם", courseId: "c-1", payment: "שולם",
    stages: buildStages(INTRO_STAGES, {
      s1: { status: "אושר", text: "מטרה: ללמד תלת־ממד בכיתה שלי.", updated: d(-24) },
      s2: { status: "חסום / צריך עזרה", text: "ניסיתי להכיר את המדפסת.", help: "המדפסת לא מתחברת ל-Bambu Studio ואני לא מצליחה להבין למה. אשמח לעזרה דחופה.", updated: d(-4) },
    }),
    ...meta(-28, -4),
  },
  {
    id: "en-6", studentId: "st-1", studentName: "דנה כהן", courseId: "c-5", payment: "שולם",
    stages: buildStages(AI_STAGES, {
      a1: { status: "אושר", text: "הבנתי את זרימת ה-Chat-to-CAD ואת ספקי ה-AI.", updated: d(-6) },
      a2: { status: "הוגש לבדיקה", text: "כתבתי Prompt: 'פלטה 80×50×12 עם 4 חורי 8' — קיבלתי מודל!", updated: d(-1), links: [{ label: "המודל שנוצר", url: "https://img.example/dana-plate" }] },
      a3: { status: "בעבודה", text: "מתנסה ב-Auto-detail על 'מצמד'.", updated: d(0) },
    }),
    ...meta(-15, 0),
  },
  {
    id: "en-7", studentId: "st-6", studentName: "עידו נבון", courseId: "c-3", payment: "שולם",
    stages: [],
    ...meta(-40, -6),
  },
  {
    id: "en-8", studentId: "st-7", studentName: "הילה שרון", courseId: "c-3", payment: "שולם",
    stages: [],
    ...meta(-40, -6),
  },
  {
    id: "en-9", studentId: "st-8", studentName: "עמית גור", courseId: "c-4", payment: "ממתין",
    stages: [],
    ...meta(-12, -2),
  },
  {
    id: "en-10", studentId: "st-3", studentName: "מיכל ישראלי", courseId: "c-2", payment: "שולם",
    stages: [],
    ...meta(-8, -1),
  },
];

export const COURSE_SESSIONS: CourseSession[] = [
  { id: "cs-1", courseId: "c-1", title: "מפגש 5 — הכרת הסלייסר", scheduledAt: dt(2, 18), durationMinutes: 90, zoomUrl: "https://zoom.us/j/teragon-intro", notes: "", ...meta(-5, -1) },
  { id: "cs-2", courseId: "c-1", title: "מפגש 6 — כיול והדפסה ראשונה", scheduledAt: dt(9, 18), durationMinutes: 90, zoomUrl: "https://zoom.us/j/teragon-intro", notes: "", ...meta(-5) },
  { id: "cs-3", courseId: "c-5", title: "מפגש פתיחה — AI פוגש CAD", scheduledAt: dt(7, 19), durationMinutes: 120, zoomUrl: "https://zoom.us/j/teragon-ai", notes: "מפגש ראשון של הקורס החדש", ...meta(-10, -2) },
  { id: "cs-4", courseId: "c-2", title: "מפגש פתיחה — Bambu Studio", scheduledAt: dt(5, 18), durationMinutes: 90, zoomUrl: "https://zoom.us/j/teragon-bambu", notes: "", ...meta(-7) },
];

export const ASSIGNMENTS: Assignment[] = [
  { id: "as-1", courseId: "c-1", stageId: "s4", title: "צילום מסך סביבת עבודה", description: "התקינו את הסלייסר וצרפו צילום מסך של פרופיל המדפסת.", due: d(3), ...meta(-10) },
  { id: "as-2", courseId: "c-1", stageId: "s6", title: "הדפסת קוביית כיול", description: "הדפיסו קוביית 20 מ\"מ וצלמו את התוצאה משלוש זוויות.", due: d(10), ...meta(-8) },
  { id: "as-3", courseId: "c-5", stageId: "a2", title: "Prompt הנדסי ראשון", description: "נסחו Prompt לחלק עם מידות מלאות וצרפו את המודל שנוצר.", due: d(12), ...meta(-6) },
  { id: "as-4", courseId: "c-3", stageId: null, title: "פרויקט סיום Fusion 360", description: "מודל מוצר מלא כולל שרטוט ייצור.", due: d(-7), ...meta(-30) },
];

// ---------------------------------------------------------------------------
// service (10 tickets) + repair actions
// ---------------------------------------------------------------------------

export const SERVICE_TICKETS: ServiceTicket[] = [
  { id: "t-1", customerName: "דני פרץ", customerId: null, printer: "Creality Ender 3", issue: "שכבה ראשונה לא תקינה", description: "השכבה הראשונה לא נדבקת למשטח ומתקלפת.", priority: "גבוהה", status: "בבדיקה", openedAt: d(-2), ownerId: "u-ran", solution: "", ...meta(-2, -1) },
  { id: "t-2", customerName: "יעל דרור", customerId: null, printer: "Bambu Lab A1", issue: "סתימה בראש הדפסה", description: "הפילמנט לא יוצא, נראה שיש סתימה ב-Hotend.", priority: "גבוהה", status: "ממתין ללקוח", openedAt: d(-1), ownerId: "u-ran", solution: "נשלח מדריך פתיחת סתימה קר, ממתינים לעדכון.", ...meta(-1, 0) },
  { id: "t-3", customerName: "סטודיו דגש", customerId: "cu-2", printer: "Bambu Lab P1S", issue: "פילמנט לא יוצא", description: "האקסטרודר מסתובב אבל לא יוצא חומר.", priority: "בינונית", status: "ממתין לחלק", openedAt: d(-4), ownerId: "u-ran", solution: "הוזמן גלגל שיניים חלופי לאקסטרודר.", ...meta(-4, -2) },
  { id: "t-4", customerName: "ליאור אבן־חן", customerId: "cu-4", printer: "Prusa MK4", issue: "כיול מדפסת", description: "המידות לא מדויקות, צריך כיול מחדש.", priority: "נמוכה", status: "טופל", openedAt: d(-8), ownerId: "u-ran", solution: "בוצע כיול E-step ו-Flow, המידות תקינות.", ...meta(-8, -6) },
  { id: "t-5", customerName: "מותק מוצרי אפייה", customerId: "cu-5", printer: "Bambu Lab A1 Mini", issue: "בעיית תוכנה / Slicer", description: "הסלייסר קורס בעת פתיחת קובץ גדול.", priority: "בינונית", status: "חדש", openedAt: d(0), ownerId: "u-ran", solution: "", ...meta(0) },
  { id: "t-6", customerName: "אבי לוטם", customerId: "cu-1", printer: "Bambu Lab A1", issue: "אחר", description: "מעוניין בשדרוג מדפסת לראש זרימה גבוהה.", priority: "נמוכה", status: "ממתין ללקוח", openedAt: d(-3), ownerId: "u-ran", solution: "נשלחה הצעה לשדרוג Hotend.", ...meta(-3, -2) },
  { id: "t-7", customerName: "בי\"ס אורט עמק חפר", customerId: "cu-3", printer: "Creality K1 (מס' 2)", issue: "רעשים / תנועה לא תקינה", description: "רעש חריג בציר X בזמן הדפסה מהירה.", priority: "בינונית", status: "בבדיקה", openedAt: d(-2), ownerId: "u-ran", solution: "", ...meta(-2, -1) },
  { id: "t-8", customerName: "גיא אשכנזי", customerId: "cu-14", printer: "Bambu Lab X1C", issue: "כיול מדפסת", description: "כיול ראשוני אחרי התקנה — חלק מהעסקה.", priority: "נמוכה", status: "טופל", openedAt: d(-7), ownerId: "u-ran", solution: "בוצע כיול מלא + הדרכת תפעול.", ...meta(-7, -6) },
  { id: "t-9", customerName: "נועם קדם", customerId: "cu-12", printer: "Bambu Lab A1", issue: "הדפסה מתנתקת מהמגש", description: "וורפינג בפינות בהדפסות PETG גדולות.", priority: "בינונית", status: "ממתין ללקוח", openedAt: d(-5), ownerId: "u-ran", solution: "הומלץ על Brim + טמפ' מיטה 70. ממתינים לתוצאה.", ...meta(-5, -3) },
  { id: "t-10", customerName: "אפרת לוין", customerId: "cu-13", printer: "Prusa MK4", issue: "בעיית תוכנה / Slicer", description: "פרופיל הדפסה נמחק אחרי עדכון PrusaSlicer.", priority: "נמוכה", status: "נסגר", openedAt: d(-12), ownerId: "u-ran", solution: "שוחזר פרופיל מגיבוי והוסבר תהליך גיבוי.", ...meta(-12, -10) },
];

export const REPAIR_ACTIONS: RepairAction[] = [
  { id: "ra-1", ticketId: "t-4", description: "כיול E-step ו-Flow, הדפסת קוביית בדיקה 20 מ\"מ", performedById: "u-ran", performedAt: d(-6), partsCost: 0, ...meta(-6) },
  { id: "ra-2", ticketId: "t-3", description: "אבחון אקסטרודר — זוהה גלגל שיניים שחוק, הוזמן חלק", performedById: "u-ran", performedAt: d(-3), partsCost: 85, ...meta(-3) },
  { id: "ra-3", ticketId: "t-8", description: "כיול מלא X1C + הדרכת תפעול ראשונית", performedById: "u-ran", performedAt: d(-6), partsCost: 0, ...meta(-6) },
];

// ---------------------------------------------------------------------------
// tasks, meetings, activities
// ---------------------------------------------------------------------------

export const TASKS: Task[] = [
  { id: "task-1", title: "פולואו-אפ: רותם פלד", description: "לחזור עם המלצת דגם לפי הצרכים שתוארו.", status: "פתוחה", priority: "גבוהה", due: d(0), ownerId: "u-maya", relatedRef: "lead:l-10", ...meta(-2, -1) },
  { id: "task-2", title: "לחדש הצעה לדני פרץ", description: "ההצעה לתיקון פגה — לחדש או לסגור.", status: "פתוחה", priority: "בינונית", due: d(1), ownerId: "u-ran", relatedRef: "quotation:q-4", ...meta(-2, -1) },
  { id: "task-3", title: "להכין מצגת למכללת אפיק", description: "מצגת הקמת מעבדה לפגישת ההמשך.", status: "בתהליך", priority: "גבוהה", due: d(2), ownerId: CEO_USER_ID, relatedRef: "opportunity:opp-1", ...meta(-4, 0) },
  { id: "task-4", title: "לאשר שלב של מיכל ישראלי", description: "s4 ממתין לאישור מדריך כבר 5 ימים.", status: "פתוחה", priority: "בינונית", due: d(0), ownerId: "u-oren", relatedRef: "enrollment:en-3", ...meta(-5, -5) },
  { id: "task-5", title: "לעזור לתמר אברהם — חסומה", description: "המדפסת לא מתחברת ל-Bambu Studio.", status: "בתהליך", priority: "גבוהה", due: d(0), ownerId: "u-oren", relatedRef: "enrollment:en-5", ...meta(-4, -1) },
  { id: "task-6", title: "לבדוק מלאי פילמנט לסדנת אורט", description: "לוודא 6 ק\"ג PETG לפני הסדנה.", status: "פתוחה", priority: "נמוכה", due: d(5), ownerId: "u-ran", relatedRef: "quotation:q-3", ...meta(-3, -3) },
  { id: "task-7", title: "לפרסם את קורס ה-AI", description: "פוסט השקה לקורס AI + תלת־ממד ברשתות.", status: "הושלמה", priority: "בינונית", due: d(-2), ownerId: "u-maya", relatedRef: "course:c-5", ...meta(-6, -2) },
  { id: "task-8", title: "גיבוי חודשי למערכת", description: "ייצוא נתונים + אימות שחזור.", status: "הושלמה", priority: "נמוכה", due: d(-1), ownerId: "u-noa", relatedRef: null, ...meta(-8, -1) },
];

export const MEETINGS: Meeting[] = [
  { id: "m-1", title: "פגישת המשך — מכללת אפיק", scheduledAt: dt(2, 10), durationMinutes: 60, location: "זום", participantIds: [CEO_USER_ID, "u-maya"], agenda: "הצגת תכנית המעבדה + לוח זמנים", relatedRef: "opportunity:opp-1", ...meta(-4, -1) },
  { id: "m-2", title: "סנכרון צוות שבועי", scheduledAt: dt(1, 9), durationMinutes: 30, location: "משרד", participantIds: [CEO_USER_ID, "u-maya", "u-oren", "u-ran"], agenda: "סטטוס לידים, קריאות פתוחות, קורסים", relatedRef: null, ...meta(-7, -1) },
  { id: "m-3", title: "שיחת ליווי — סטודיו דגש", scheduledAt: dt(3, 14), durationMinutes: 45, location: "אצל הלקוח", participantIds: [CEO_USER_ID], agenda: "פתיחת שנת ליווי — יעדים ותחזוקה", relatedRef: "customer:cu-2", ...meta(-3, -1) },
  { id: "m-4", title: "תיאום סדנה — אורט עמק חפר", scheduledAt: dt(6, 12), durationMinutes: 45, location: "זום", participantIds: ["u-oren", "u-maya"], agenda: "לוגיסטיקה, מדפסות וחומרים לסדנה", relatedRef: "quotation:q-3", ...meta(-2, -1) },
];

export const ACTIVITIES: Activity[] = [
  { id: "act-1", kind: "ליד", text: "ליד חדש: ניר שלו — קורס AI + תלת־ממד", actorId: "u-maya", entityRef: "lead:l-13", at: dt(0, 9), ...meta(0) },
  { id: "act-2", kind: "ליד", text: "ליד חדש: עומר כהן — קורס Bambu Studio", actorId: "u-maya", entityRef: "lead:l-6", at: dt(0, 8, 30), ...meta(0) },
  { id: "act-3", kind: "קריאת שירות", text: "נפתחה קריאה: הסלייסר קורס אצל מותק מוצרי אפייה", actorId: "u-ran", entityRef: "ticket:t-5", at: dt(0, 8), ...meta(0) },
  { id: "act-4", kind: "הצעת מחיר", text: "הצעה q-5 אושרה — חבילת ליווי פרמיום לסטודיו דגש", actorId: CEO_USER_ID, entityRef: "quotation:q-5", at: dt(-1, 16), ...meta(-1) },
  { id: "act-5", kind: "קורס", text: "דנה כהן הגישה את שלב a2 בקורס ה-AI", actorId: "u-oren", entityRef: "enrollment:en-6", at: dt(-1, 15), ...meta(-1) },
  { id: "act-6", kind: "סוכן", text: "Hunter זיהה ליד ללא מענה: רותם פלד (יומיים)", actorId: "ag-hunter", entityRef: "lead:l-10", at: dt(-1, 12), ...meta(-1) },
  { id: "act-7", kind: "קריאת שירות", text: "קריאה t-4 נסגרה — כיול Prusa MK4 הושלם", actorId: "u-ran", entityRef: "ticket:t-4", at: dt(-6, 14), ...meta(-6) },
  { id: "act-8", kind: "ליד", text: "גיא אשכנזי נסגר כלקוח — עסקת X1C", actorId: CEO_USER_ID, entityRef: "lead:l-14", at: dt(-9, 17), ...meta(-9) },
  { id: "act-9", kind: "קורס", text: "תמר אברהם סימנה 'צריך עזרה' בשלב s2", actorId: "st-5", entityRef: "enrollment:en-5", at: dt(-4, 11), ...meta(-4) },
  { id: "act-10", kind: "הצעת מחיר", text: "נשלחה הצעה q-6 להקמת מעבדה — מכללת אפיק", actorId: CEO_USER_ID, entityRef: "quotation:q-6", at: dt(-2, 10), ...meta(-2) },
  { id: "act-11", kind: "מערכת", text: "גיבוי חודשי הושלם ואומת", actorId: "u-noa", entityRef: "task:task-8", at: dt(-1, 7), ...meta(-1) },
  { id: "act-12", kind: "סוכן", text: "Fixer הציע פתרון וורפינג לנועם קדם (ממתין לאישור)", actorId: "ag-fixer", entityRef: "ticket:t-9", at: dt(-3, 13), ...meta(-3) },
];

// ---------------------------------------------------------------------------
// documents
// ---------------------------------------------------------------------------

export const DOCUMENTS: Document[] = [
  { id: "doc-1", name: "מדריך כיול מיטה", description: "מדריך מצולם לכיול מיטת ההדפסה.", type: "קובץ", url: null, courseId: "c-1", stageId: "s6", visible: true, ownerId: "u-oren", ...meta(-38) },
  { id: "doc-2", name: "טבלת טמפרטורות פילמנט", description: "טמפ׳ מומלצות ל-PLA/PETG/ABS/ניילון.", type: "קובץ", url: null, courseId: "c-1", stageId: "s8", visible: true, ownerId: "u-oren", ...meta(-38) },
  { id: "doc-3", name: "הורדת Bambu Studio", description: "קישור להורדת הסלייסר הרשמי.", type: "קישור", url: "https://bambulab.com/download", courseId: "c-1", stageId: "s4", visible: true, ownerId: "u-oren", ...meta(-38) },
  { id: "doc-4", name: "סילבוס הקורס המלא", description: "מסמך סילבוס מעודכן.", type: "קובץ", url: null, courseId: "c-1", stageId: null, visible: true, ownerId: "u-oren", ...meta(-40) },
  { id: "doc-5", name: "צ׳ק־ליסט פתרון תקלות", description: "רשימת בדיקה לתקלות נפוצות.", type: "קובץ", url: null, courseId: "c-1", stageId: "s7", visible: true, ownerId: "u-ran", ...meta(-35) },
  { id: "doc-6", name: "חומר בהכנה", description: "טיוטה פנימית — לא לפרסום.", type: "קובץ", url: null, courseId: "c-1", stageId: null, visible: false, ownerId: "u-oren", ...meta(-20) },
  { id: "doc-7", name: "מדריך Prompt-to-CAD", description: "איך לכתוב תיאור חלק שה-AI יבנה נכון.", type: "קובץ", url: null, courseId: "c-5", stageId: "a2", visible: true, ownerId: "u-oren", ...meta(-15) },
  { id: "doc-8", name: "התקנת CAD Assistant ל-Fusion 360", description: "קישור והוראות התקנת התוסף.", type: "קישור", url: "https://example.com/cad-assistant", courseId: "c-5", stageId: "a1", visible: true, ownerId: "u-oren", ...meta(-15) },
];

// ---------------------------------------------------------------------------
// knowledge & memory (with [[wikilinks]] + frontmatter)
// ---------------------------------------------------------------------------

export const KNOWLEDGE_NOTES: KnowledgeNote[] = [
  { id: "kn-1", title: "פתרון וורפינג ב-PETG", category: "תקלות", content: "וורפינג ב-PETG נפתר כמעט תמיד עם Brim של 5 מ\"מ + טמפ' מיטה 70°C. ראו גם [[טבלת טמפרטורות פילמנט]] ואת הקריאה של [[נועם קדם]].", sourceRef: "ticket:t-9", approved: true, tags: ["PETG", "וורפינג", "תקלות"], ...meta(-5, -3) },
  { id: "kn-2", title: "נוהל פתיחת סתימה קרה (Cold Pull)", category: "תקלות", content: "השיטה הבטוחה לפתיחת סתימות ב-Hotend בלי פירוק: חימום ל-90°C, משיכה איטית. נשלח ללקוחות דרך [[מדריך פתיחת סתימה]].", sourceRef: "ticket:t-2", approved: true, tags: ["סתימה", "Hotend"], ...meta(-10, -1) },
  { id: "kn-3", title: "שאלות נפוצות לפני רכישת מדפסת ראשונה", category: "מכירות", content: "המתלבטים בין [[Bambu Lab A1]] ל-[[Bambu Lab A1 Mini]]: גודל משטח, תקציב, ומטרת השימוש. רוב המתחילים מרוצים מה-Mini.", sourceRef: null, approved: true, tags: ["מכירות", "מדפסות"], ...meta(-20, -8) },
  { id: "kn-4", title: "תבנית הצעה לבתי ספר", category: "מכירות", content: "מבנה מנצח: סדנה + מדפסות לתקופה + מסלול המשך. מבוסס על עסקת [[בי\"ס אורט עמק חפר]].", sourceRef: "quotation:q-3", approved: false, tags: ["בתי ספר", "הצעות"], ...meta(-4, -2) },
  { id: "kn-5", title: "צ'ק-ליסט מסירת מדפסת ללקוח", category: "שירות", content: "כיול מלא, הדפסת בדיקה, הדרכת תפעול, וידוא רישום אחריות. יושם לראשונה בעסקת [[גיא אשכנזי]].", sourceRef: "ticket:t-8", approved: true, tags: ["מסירה", "שירות"], ...meta(-6, -5) },
];

export const MEMORY_RECORDS: MemoryRecord[] = [
  {
    id: "mem-1", title: "עסקת מכללת אפיק — הקשר", markdown: "# עסקת מכללת אפיק\n\nההזדמנות הגדולה של הרבעון (86,000 ₪). איש קשר: [[ד\"ר יעל ברקאי]].\n\n- מתעניינים ב-6 מדפסות + הכשרה\n- רגישים ללוח זמנים — פתיחת שנה\n- דרשו פירוק ל-3 תשלומים\n\nקשור: [[הצעת מעבדה q-6]], [[תכנית ההטמעה]]",
    frontmatter: { type: "deal-context", customer: "מכללת אפיק", value: 86000, tags: ["מכירות", "מוסדות"] },
    folder: "עסקאות", tags: ["מכירות", "מוסדות"], links: ["ד\"ר יעל ברקאי", "הצעת מעבדה q-6", "תכנית ההטמעה"], ...meta(-12, -2),
  },
  {
    id: "mem-2", title: "העדפות תקשורת — סטודיו דגש", markdown: "# סטודיו דגש\n\nמעדיפים וואטסאפ על מייל. [[עדי דגן]] היא איש הקשר היחיד לתפעול.\n\nהיסטוריה: שדרגו מ-A1 ל-[[Bambu Lab P1S]] אחרי שנה.",
    frontmatter: { type: "customer-preference", customer: "סטודיו דגש", channel: "וואטסאפ" },
    folder: "לקוחות", tags: ["לקוחות", "תקשורת"], links: ["עדי דגן", "Bambu Lab P1S"], ...meta(-30, -5),
  },
  {
    id: "mem-3", title: "לקח: תיאום ציפיות בקורסי מבוא", markdown: "# לקח מקורס המבוא\n\nתלמידים שמגדירים מטרה מוחשית בשלב s1 מתקדמים מהר יותר. [[תמר אברהם]] נתקעה בגלל בעיה טכנית — לא בגלל מוטיבציה.\n\nפעולה: להוסיף בדיקת חיבור מדפסת כבר במפגש הראשון.",
    frontmatter: { type: "lesson", course: "c-1", tags: ["למידה"] },
    folder: "לקחים", tags: ["למידה", "קורסים"], links: ["תמר אברהם"], ...meta(-4, -4),
  },
  {
    id: "mem-4", title: "החלטה: קורס AI הוא מנוע הצמיחה", markdown: "# החלטת אסטרטגיה\n\nקורס [[AI + הדפסת תלת־ממד]] מקבל עדיפות שיווקית ברבעון. שני לידים ראשונים ([[ניר שלו]]) הגיעו אורגנית.\n\nיעד: 10 נרשמים למחזור הראשון.",
    frontmatter: { type: "decision", decidedBy: "צחי זוסטייהם", date: "2026-07-15" },
    folder: "החלטות", tags: ["אסטרטגיה", "AI"], links: ["AI + הדפסת תלת־ממד", "ניר שלו"], ...meta(-7, -7),
  },
  {
    id: "mem-5", title: "ספק פילמנט מועדף", markdown: "# ספקים\n\nהספק המועדף ל-PETG הוא היבואן הישיר — זמן אספקה 3 ימים. להזמין לפני סדנאות גדולות כמו [[סדנת אורט עמק חפר]].",
    frontmatter: { type: "operations", topic: "ספקים" },
    folder: "תפעול", tags: ["תפעול", "מלאי"], links: ["סדנת אורט עמק חפר"], ...meta(-25, -3),
  },
];

// ---------------------------------------------------------------------------
// automations
// ---------------------------------------------------------------------------

export const AUTOMATIONS: Automation[] = [
  { id: "auto-1", name: "התראת ליד ללא מענה", description: "כשליד לא קיבל מענה 48 שעות — נוצרת משימה לבעלים.", trigger: "ליד ללא פעילות 48 שעות", steps: ["איתור לידים ללא פעילות", "יצירת משימת פולואו-אפ", "עדכון בעל הליד"], enabled: true, requiresApproval: false, ...meta(-60, -10) },
  { id: "auto-2", name: "תזכורת הצעה שפג תוקפה", description: "הצעה שפגה — משימה לחידוש או סגירה.", trigger: "תאריך תוקף הצעה עבר", steps: ["זיהוי הצעות שפגו", "יצירת משימה לבעלים"], enabled: true, requiresApproval: false, ...meta(-60, -10) },
  { id: "auto-3", name: "ברכת סיום קורס + בקשת משוב", description: "בסיום קורס נשלחת הודעת סיכום ובקשת משוב — דורש אישור לפני שליחה.", trigger: "קורס הסתיים", steps: ["ניסוח הודעה אישית", "המתנה לאישור אנושי", "שליחה", "תיעוד"], enabled: true, requiresApproval: true, ...meta(-45, -5) },
  { id: "auto-4", name: "דו\"ח בוקר למנכ\"ל", description: "סיכום יומי: לידים חדשים, קריאות פתוחות, אישורים ממתינים.", trigger: "כל יום ב-07:00", steps: ["איסוף נתונים מה-repositories", "בניית סיכום", "הצגה במרכז הפיקוד"], enabled: true, requiresApproval: false, ...meta(-30, -1) },
];

export const AUTOMATION_RUNS: AutomationRun[] = [
  { id: "ar-1", automationId: "auto-1", startedAt: dt(-1, 7), endedAt: dt(-1, 7, 1), outcome: "הצלחה", stepsLog: ["נמצא ליד אחד ללא מענה: l-10", "נוצרה משימה task-1", "עודכנה מאיה ברק"], triggeredBy: "מתזמן", ...meta(-1) },
  { id: "ar-2", automationId: "auto-2", startedAt: dt(-2, 7), endedAt: dt(-2, 7, 1), outcome: "הצלחה", stepsLog: ["נמצאה הצעה שפגה: q-4", "נוצרה משימה task-2"], triggeredBy: "מתזמן", ...meta(-2) },
  { id: "ar-3", automationId: "auto-4", startedAt: dt(0, 7), endedAt: dt(0, 7, 2), outcome: "הצלחה", stepsLog: ["נאספו נתוני לידים/קריאות/אישורים", "נבנה סיכום בוקר", "הוצג במרכז הפיקוד"], triggeredBy: "מתזמן", ...meta(0) },
];

// ---------------------------------------------------------------------------
// product agents (7) + collaboration trace
// ---------------------------------------------------------------------------

export const AGENTS: Agent[] = [
  { id: "ag-orchestrator", name: "מנהל התזמור", purpose: "מתאם בין כל הסוכנים, מפרק יעדים למשימות ומנתב אותן לסוכן המתאים. לא מבצע פעולות עסקיות בעצמו.", allowedTools: ["קריאת נתונים", "יצירת משימות סוכן", "ניתוב"], allowedDomains: ["תיאום", "תעדוף"], prohibitedDomains: ["שליחת הודעות ללקוחות", "שינוי מחירים", "מחיקה"], promptVersion: "v1.2", limits: { maxTasksPerDay: 50, maxActionsPerTask: 20, dailyBudgetILS: 0 }, status: "פעיל", ...meta(-40, -1) },
  { id: "ag-hunter", name: "Hunter", purpose: "סוכן מכירות: מזהה לידים ללא מענה, מציע פולואו-אפים ומכין טיוטות הצעה. כל טיוטה דורשת אישור אנושי.", allowedTools: ["קריאת לידים", "יצירת משימות", "טיוטות הצעה"], allowedDomains: ["לידים", "הצעות מחיר"], prohibitedDomains: ["שליחה ישירה ללקוח", "שינוי הנחות", "התחייבות כספית"], promptVersion: "v1.4", limits: { maxTasksPerDay: 20, maxActionsPerTask: 10, dailyBudgetILS: 0 }, status: "פעיל", ...meta(-40, -1) },
  { id: "ag-fixer", name: "Fixer", purpose: "סוכן שירות: מנתח קריאות, מציע אבחון ופתרונות מבוסס מאגר הידע. סגירת קריאה דורשת אישור.", allowedTools: ["קריאת קריאות שירות", "חיפוש במאגר ידע", "טיוטת פתרון"], allowedDomains: ["שירות", "תקלות"], prohibitedDomains: ["סגירת קריאה ללא אישור", "הזמנת חלקים"], promptVersion: "v1.3", limits: { maxTasksPerDay: 30, maxActionsPerTask: 8, dailyBudgetILS: 0 }, status: "פעיל", ...meta(-40, -3) },
  { id: "ag-mentor", name: "Mentor", purpose: "סוכן למידה: עוקב אחרי התקדמות תלמידים, מזהה תקיעות ומציע התערבויות למדריך.", allowedTools: ["קריאת הרשמות", "ניתוח התקדמות", "התראות למדריך"], allowedDomains: ["למידה", "תלמידים"], prohibitedDomains: ["פנייה ישירה לתלמיד", "שינוי ציונים/אישורים"], promptVersion: "v1.1", limits: { maxTasksPerDay: 20, maxActionsPerTask: 6, dailyBudgetILS: 0 }, status: "פעיל", ...meta(-38, -4) },
  { id: "ag-nexa", name: "Nexa", purpose: "עוזר אישי למנכ\"ל: מרכז סיכומים, מסדר תעדוף יומי ומכין חומרים לפגישות.", allowedTools: ["קריאת כלל הנתונים", "בניית סיכומים", "טיוטות מסמכים"], allowedDomains: ["סיכומים", "תעדוף", "פגישות"], prohibitedDomains: ["פעולה עסקית ישירה", "שליחת הודעות"], promptVersion: "v1.0", limits: { maxTasksPerDay: 15, maxActionsPerTask: 10, dailyBudgetILS: 0 }, status: "פעיל", ...meta(-35, -2) },
  { id: "ag-wiki", name: "Wiki", purpose: "סוכן ידע: הופך פתרונות חוזרים לרשומות ידע, מציע קישורים בין רשומות. כתיבה קבועה דורשת אישור.", allowedTools: ["קריאת קריאות ופתרונות", "טיוטת רשומת ידע", "קישור רשומות"], allowedDomains: ["מאגר ידע", "זיכרון ארגוני"], prohibitedDomains: ["כתיבת זיכרון קבוע ללא אישור", "מחיקת רשומות"], promptVersion: "v1.2", limits: { maxTasksPerDay: 10, maxActionsPerTask: 5, dailyBudgetILS: 0 }, status: "ממתין", ...meta(-30, -2) },
  { id: "ag-flow", name: "Flow", purpose: "סוכן אוטומציות: מריץ ומנטר את האוטומציות, מדווח על כשלים ומציע שיפורים.", allowedTools: ["הרצת אוטומציות מאושרות", "ניטור ריצות", "דוחות"], allowedDomains: ["אוטומציות"], prohibitedDomains: ["יצירת אוטומציה חדשה ללא אישור", "אוטומציה חיצונית"], promptVersion: "v1.1", limits: { maxTasksPerDay: 40, maxActionsPerTask: 12, dailyBudgetILS: 0 }, status: "פעיל", ...meta(-30, -1) },
];

// A believable collaboration trace: Hunter found a stale lead → orchestrator routed →
// Nexa summarized for the CEO → approval requested for the outreach draft.
export const AGENT_TASKS: AgentTask[] = [
  { id: "at-1", agentId: "ag-hunter", title: "טיפול בליד ללא מענה: רותם פלד", description: "הליד l-10 ללא פעילות יומיים. להכין טיוטת פולואו-אפ ולבקש אישור שליחה.", status: "ממתין לאישור", evidenceIds: ["ev-1", "ev-2"], approvalId: "ap-1", ...meta(-1, 0) },
  { id: "at-2", agentId: "ag-fixer", title: "אבחון וורפינג — נועם קדם", description: "ניתוח קריאה t-9 והצעת פתרון מבוסס רשומת הידע kn-1.", status: "הושלם", evidenceIds: ["ev-3"], approvalId: null, ...meta(-3, -3) },
  { id: "at-3", agentId: "ag-mentor", title: "התראה: תלמידה חסומה", description: "תמר אברהם חסומה בשלב s2 ארבעה ימים — הועברה התראה למדריך.", status: "הושלם", evidenceIds: ["ev-4"], approvalId: null, ...meta(-4, -4) },
  { id: "at-4", agentId: "ag-nexa", title: "סיכום בוקר למנכ\"ל", description: "ריכוז: לידים חדשים, קריאות פתוחות, אישור אחד ממתין.", status: "הושלם", evidenceIds: ["ev-5"], approvalId: null, ...meta(0, 0) },
  { id: "at-5", agentId: "ag-wiki", title: "טיוטת רשומת ידע: וורפינג PETG", description: "הפיכת הפתרון מקריאה t-9 לרשומת ידע קבועה — ממתין לאישור כתיבה.", status: "ממתין לאישור", evidenceIds: ["ev-3"], approvalId: "ap-2", ...meta(-2, -2) },
];

export const AGENT_MESSAGES: AgentMessage[] = [
  { id: "msg-1", taskId: "at-1", fromAgentId: "ag-hunter", toAgentId: "ag-orchestrator", role: "agent", content: "זיהיתי ליד ללא מענה יומיים: רותם פלד (ייעוץ רכישת מדפסת). מבקש ניתוב.", sentAt: dt(-1, 11), ...meta(-1) },
  { id: "msg-2", taskId: "at-1", fromAgentId: "ag-orchestrator", toAgentId: "ag-hunter", role: "agent", content: "מאושר לטיפול. הכן טיוטת פולואו-אפ עם המלצת דגם — אל תשלח, בקש אישור אנושי.", sentAt: dt(-1, 11, 5), ...meta(-1) },
  { id: "msg-3", taskId: "at-1", fromAgentId: "ag-hunter", toAgentId: null, role: "agent", content: "טיוטה מוכנה: המלצה על Bambu Lab A1 לפי הצרכים (עבודות עיצוב, מתחילה). ראיות: שיחת הייעוץ + טבלת דגמים.", sentAt: dt(-1, 12), ...meta(-1) },
  { id: "msg-4", taskId: "at-1", fromAgentId: "ag-orchestrator", toAgentId: null, role: "system", content: "נוצרה בקשת אישור ap-1 עבור שליחת הפולואו-אפ. ממתין להחלטת צחי.", sentAt: dt(-1, 12, 10), ...meta(-1) },
  { id: "msg-5", taskId: "at-2", fromAgentId: "ag-fixer", toAgentId: "ag-wiki", role: "agent", content: "הפתרון לוורפינג PETG (Brim 5 מ\"מ + מיטה 70°C) עבד בעבר. שווה רשומת ידע קבועה.", sentAt: dt(-3, 13), ...meta(-3) },
  { id: "msg-6", taskId: "at-5", fromAgentId: "ag-wiki", toAgentId: "ag-orchestrator", role: "agent", content: "טיוטת רשומת ידע מוכנה. כתיבה קבועה דורשת אישור אנושי — נוצרה בקשה ap-2.", sentAt: dt(-2, 9), ...meta(-2) },
  { id: "msg-7", taskId: "at-4", fromAgentId: "ag-nexa", toAgentId: null, role: "agent", content: "סיכום בוקר: 4 לידים חדשים השבוע, 6 קריאות פתוחות, אישור אחד ממתין (פולואו-אפ רותם פלד).", sentAt: dt(0, 7, 5), ...meta(0) },
  { id: "msg-8", taskId: "at-3", fromAgentId: "ag-mentor", toAgentId: null, role: "agent", content: "תמר אברהם מסומנת 'חסום / צריך עזרה' 4 ימים. נוצרה משימה דחופה לאורן.", sentAt: dt(-4, 11, 30), ...meta(-4) },
];

export const AGENT_HANDOFFS: AgentHandoff[] = [
  { id: "ho-1", taskId: "at-1", fromAgentId: "ag-orchestrator", toAgentId: "ag-hunter", reason: "משימת מכירות — בתחום ההרשאה של Hunter", contextSummary: "ליד l-10 ללא מענה יומיים; דרושה טיוטת פולואו-אפ עם המלצת דגם.", at: dt(-1, 11, 5), ...meta(-1) },
  { id: "ho-2", taskId: "at-5", fromAgentId: "ag-fixer", toAgentId: "ag-wiki", reason: "הפיכת פתרון חוזר לידע ארגוני — בתחום של Wiki", contextSummary: "פתרון וורפינג PETG מקריאה t-9, אומת אצל לקוח.", at: dt(-3, 13, 10), ...meta(-3) },
];

export const AGENT_CONFLICTS: AgentConflict[] = [
  { id: "conf-1", taskId: "at-1", agentIds: ["ag-hunter", "ag-nexa"], description: "Hunter רצה לתעדף פולואו-אפ מיידי; Nexa תעדפה את הכנת מצגת אפיק. הוכרע על ידי מנהל התזמור: שניהם — הפולואו-אפ ממתין לאישור ולא חוסם.", resolution: "תועדף במקביל — הפולואו-אפ בערוץ אישורים, המצגת בעבודה", resolvedById: "ag-orchestrator", resolvedAt: dt(-1, 12, 30), ...meta(-1) },
];

export const AI_RECOMMENDATIONS: AIRecommendation[] = [
  { id: "rec-1", agentId: "ag-hunter", title: "לשלוח פולואו-אפ לרותם פלד עם המלצת A1", reason: "הליד ללא מענה יומיים ותיארה צרכים שמתאימים ל-Bambu Lab A1 (עיצוב, מתחילה).", evidenceIds: ["ev-1", "ev-2"], confidenceMethod: "מנוע חוקים מקומי — התאמת תגי צורך לתגי דגם", nextAction: "אישור ושליחת הטיוטה", approvalRequired: true, approvalId: "ap-1", entityRef: "lead:l-10", ...meta(-1, 0) },
  { id: "rec-2", agentId: "ag-fixer", title: "פתרון וורפינג: Brim 5 מ\"מ + מיטה 70°C", reason: "התסמינים בקריאה t-9 זהים למקרה מתועד שנפתר בהגדרות אלה.", evidenceIds: ["ev-3"], confidenceMethod: "התאמה לרשומת ידע מאומתת (kn-1)", nextAction: "עדכון הלקוח בהמלצה", approvalRequired: false, approvalId: null, entityRef: "ticket:t-9", ...meta(-3, -3) },
  { id: "rec-3", agentId: "ag-mentor", title: "התערבות דחופה: תמר אברהם", reason: "תלמידה מסומנת חסומה 4 ימים — בעיה טכנית (חיבור מדפסת), לא מוטיבציה.", evidenceIds: ["ev-4"], confidenceMethod: null, nextAction: "שיחת תמיכה טכנית עם המדריך", approvalRequired: false, approvalId: null, entityRef: "enrollment:en-5", ...meta(-4, -4) },
];

export const EVIDENCE: Evidence[] = [
  { id: "ev-1", subjectRef: "agent-task:at-1", sourceType: "entity", sourceRef: "lead:l-10", claim: "פעילות אחרונה בליד לפני יומיים (שיחת ייעוץ ראשונית).", capturedAt: dt(-1, 11), ...meta(-1) },
  { id: "ev-2", subjectRef: "agent-task:at-1", sourceType: "computation", sourceRef: "selector:leadStaleness", claim: "הליד עומד בקריטריון '48 שעות ללא מענה' של האוטומציה auto-1.", capturedAt: dt(-1, 11), ...meta(-1) },
  { id: "ev-3", subjectRef: "agent-task:at-2", sourceType: "document", sourceRef: "knowledge:kn-1", claim: "רשומת ידע מאומתת: Brim 5 מ\"מ + מיטה 70°C פותר וורפינג PETG.", capturedAt: dt(-3, 13), ...meta(-3) },
  { id: "ev-4", subjectRef: "agent-task:at-3", sourceType: "entity", sourceRef: "enrollment:en-5", claim: "שלב s2 מסומן 'חסום / צריך עזרה' מזה 4 ימים עם בקשת עזרה מפורשת.", capturedAt: dt(-4, 11), ...meta(-4) },
  { id: "ev-5", subjectRef: "agent-task:at-4", sourceType: "computation", sourceRef: "selector:dashboardKpis", claim: "הסיכום נגזר ישירות מנתוני ה-repositories — לידים, קריאות ואישורים.", capturedAt: dt(0, 7), ...meta(0) },
  { id: "ev-6", subjectRef: "stage-gate:sg-1", sourceType: "document", sourceRef: "docs/BUILD_STATUS.md", claim: "תשתית הנתונים והראוטים עברה טייפצ'ק, בדיקות ובילד ירוקים.", capturedAt: dt(0, 12), ...meta(0) },
];

export const APPROVALS: Approval[] = [
  { id: "ap-1", subjectRef: "agent-task:at-1", requestedById: "ag-hunter", requestedAt: dt(-1, 12, 10), status: "ממתין", decidedById: null, decidedAt: null, note: "שליחת פולואו-אפ ללקוחה — פעולה חיצונית, דורשת אישור.", ...meta(-1, -1) },
  { id: "ap-2", subjectRef: "agent-task:at-5", requestedById: "ag-wiki", requestedAt: dt(-2, 9), status: "ממתין", decidedById: null, decidedAt: null, note: "כתיבת רשומת ידע קבועה — דורשת אישור.", ...meta(-2, -2) },
  { id: "ap-3", subjectRef: "automation:auto-3", requestedById: "ag-flow", requestedAt: dt(-6, 10), status: "אושר", decidedById: CEO_USER_ID, decidedAt: dt(-6, 14), note: "אושרה שליחת ברכות סיום לקורס Fusion 360.", ...meta(-6, -6) },
];

export const AUDIT_EVENTS: AuditEvent[] = [
  { id: "ae-1", at: dt(-1, 12, 10), actor: "ag-hunter", action: "בקשת אישור נוצרה", entityRef: "approval:ap-1", details: "טיוטת פולואו-אפ לרותם פלד ממתינה לאישור.", correlationId: "corr-at1", ...meta(-1) },
  { id: "ae-2", at: dt(-1, 11, 5), actor: "ag-orchestrator", action: "ניתוב משימה", entityRef: "agent-task:at-1", details: "המשימה נותבה ל-Hunter.", correlationId: "corr-at1", ...meta(-1) },
  { id: "ae-3", at: dt(-6, 14), actor: CEO_USER_ID, action: "אישור התקבל", entityRef: "approval:ap-3", details: "צחי אישר שליחת ברכות סיום.", correlationId: "corr-auto3", ...meta(-6) },
  { id: "ae-4", at: dt(-2, 9), actor: "ag-wiki", action: "בקשת אישור נוצרה", entityRef: "approval:ap-2", details: "רשומת ידע חדשה ממתינה לאישור כתיבה.", correlationId: "corr-at5", ...meta(-2) },
  { id: "ae-5", at: dt(-1, 16), actor: CEO_USER_ID, action: "הצעה אושרה", entityRef: "quotation:q-5", details: "חבילת ליווי פרמיום — סטודיו דגש.", correlationId: null, ...meta(-1) },
  { id: "ae-6", at: dt(0, 7), actor: "ag-nexa", action: "סיכום בוקר נוצר", entityRef: "agent-task:at-4", details: "נגזר מנתוני repositories בלבד.", correlationId: "corr-at4", ...meta(0) },
  { id: "ae-7", at: dt(-9, 17), actor: CEO_USER_ID, action: "ליד נסגר כלקוח", entityRef: "lead:l-14", details: "גיא אשכנזי → לקוח cu-14.", correlationId: null, ...meta(-9) },
  { id: "ae-8", at: dt(-1, 7), actor: "u-noa", action: "גיבוי הושלם", entityRef: "task:task-8", details: "גיבוי חודשי + אימות שחזור.", correlationId: null, ...meta(-1) },
];

// ---------------------------------------------------------------------------
// metrics (3 levels). Observations: business metrics derive from selectors;
// AI quality metrics are null — "טרם נמדד". Never invented.
// ---------------------------------------------------------------------------

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { id: "md-1", key: "pipeline_value", name: "שווי צבר מכירות", level: "עסקי", description: "סכום הצעות פתוחות (טיוטה/נשלחה) אחרי הנחה", unit: "₪", derivation: "selectors/revenuePipeline", ...meta(-40) },
  { id: "md-2", key: "leads_new_week", name: "לידים חדשים השבוע", level: "עסקי", description: "לידים שנוצרו ב-7 הימים האחרונים", unit: "לידים", derivation: "selectors/leadsByStage", ...meta(-40) },
  { id: "md-3", key: "revenue_total", name: "הכנסות מצטברות", level: "עסקי", description: "סכום הכנסות הלקוחות", unit: "₪", derivation: "selectors/totalRevenue", ...meta(-40) },
  { id: "md-4", key: "open_tickets", name: "קריאות שירות פתוחות", level: "תפעולי", description: "קריאות שאינן 'טופל'/'נסגר'", unit: "קריאות", derivation: "selectors/openTicketsByPriority", ...meta(-40) },
  { id: "md-5", key: "course_completion", name: "השלמת שלבי למידה", level: "תפעולי", description: "אחוז השלבים שאושרו מכלל השלבים הפעילים", unit: "%", derivation: "selectors/courseCompletion", ...meta(-40) },
  { id: "md-6", key: "pending_approvals", name: "אישורים ממתינים", level: "תפעולי", description: "בקשות אישור בסטטוס 'ממתין'", unit: "בקשות", derivation: "selectors/pendingApprovals", ...meta(-40) },
  { id: "md-7", key: "agent_precision", name: "דיוק המלצות סוכנים", level: "AI", description: "אחוז ההמלצות שאושרו על ידי אדם מתוך כלל ההמלצות", unit: "%", derivation: "טרם נמדד — דורש נתוני פיקוח אנושי מצטברים", ...meta(-40) },
  { id: "md-8", key: "agent_response_time", name: "זמן תגובת סוכן", level: "AI", description: "זמן חציוני מיצירת משימה עד תוצר", unit: "דקות", derivation: "טרם נמדד — ימדד לאחר הפעלה רציפה", ...meta(-40) },
  { id: "md-9", key: "automation_success", name: "הצלחת אוטומציות", level: "AI", description: "אחוז ריצות שהסתיימו בהצלחה", unit: "%", derivation: "selectors/automationSuccessRate", ...meta(-40) },
];

export const METRIC_OBSERVATIONS: MetricObservation[] = [
  { id: "mo-1", metricKey: "agent_precision", observedAt: dt(0, 7), value: null, method: "טרם נמדד — אין עדיין מדגם החלטות אנושיות מספק", ...meta(0) },
  { id: "mo-2", metricKey: "agent_response_time", observedAt: dt(0, 7), value: null, method: "טרם נמדד — המדידה תחל לאחר הפעלה רציפה", ...meta(0) },
  { id: "mo-3", metricKey: "automation_success", observedAt: dt(0, 7), value: 100, method: "חושב מ-3 ריצות אוטומציה מתועדות (AUTOMATION_RUNS) — מדגם קטן", ...meta(0) },
];

// ---------------------------------------------------------------------------
// governance: risks & controls
// ---------------------------------------------------------------------------

export const CONTROLS: Control[] = [
  { id: "ctl-1", name: "אישור אנושי לפעולות חיצוניות", description: "כל שליחת הודעה/שינוי מחיר/מחיקה על ידי סוכן דורשת אישור.", kind: "תהליכי", implemented: true, evidenceIds: ["ev-1"], ...meta(-40, -5) },
  { id: "ctl-2", name: "תחומים אסורים לכל סוכן", description: "prohibitedDomains נאכפים ברמת ההגדרה של כל סוכן.", kind: "טכני", implemented: true, evidenceIds: [], ...meta(-40, -5) },
  { id: "ctl-3", name: "יומן ביקורת מלא", description: "כל פעולת סוכן ואישור נרשמים כ-AuditEvent עם correlation ID.", kind: "טכני", implemented: true, evidenceIds: [], ...meta(-40, -5) },
  { id: "ctl-4", name: "תקציב יומי לסוכנים", description: "dailyBudgetILS = 0 כברירת מחדל — אין הוצאה ללא הגדרה מפורשת.", kind: "טכני", implemented: true, evidenceIds: [], ...meta(-35, -5) },
];

export const RISKS: Risk[] = [
  { id: "risk-1", title: "סוכן שולח הודעה שגויה ללקוח", description: "פגיעה באמון אם טיוטה לא מדויקת נשלחת.", severity: "גבוהה", controlIds: ["ctl-1", "ctl-3"], ownerId: CEO_USER_ID, status: "בטיפול", ...meta(-40, -5) },
  { id: "risk-2", title: "המלצת AI ללא ראיות", description: "המלצה שלא ניתנת לאימות פוגעת בעקרון הכנות.", severity: "בינונית", controlIds: ["ctl-3"], ownerId: "u-noa", status: "בטיפול", ...meta(-40, -5) },
  { id: "risk-3", title: "תלות בספק AI חיצוני", description: "נפילת ספק משביתה יכולות — נדרש fallback מקומי.", severity: "בינונית", controlIds: [], ownerId: "u-noa", status: "פתוח", ...meta(-35, -5) },
  { id: "risk-4", title: "חריגת תקציב AI", description: "שימוש לא מבוקר עלול לייצר עלות בלתי צפויה.", severity: "נמוכה", controlIds: ["ctl-4"], ownerId: CEO_USER_ID, status: "סגור", ...meta(-35, -10) },
];

// ---------------------------------------------------------------------------
// adoption: personas (7), training materials (13), stages (6), gates (6)
// ---------------------------------------------------------------------------

export const PERSONAS: Persona[] = [
  { id: "per-1", name: "המנכ\"ל המתזמר", description: "צחי — רואה הכול, מאשר פעולות רגישות, מודד את העסק ממרכז הפיקוד.", mappedRole: 'מנכ"ל', goals: ["תמונת מצב אחת אמינה", "שליטה בפעולות AI", "צמיחה בהכנסות"], painPoints: ["מידע מפוזר", "חשש מאובדן שליטה על AI"], trainingTrack: "מסלול מנהלים — 3 מפגשים", ...meta(-30) },
  { id: "per-2", name: "אשת המכירות", description: "חיה בלידים ובהצעות; רוצה שהמערכת תעבוד בשבילה ולא להפך.", mappedRole: "מכירות", goals: ["אפס לידים שנופלים", "הצעות מהירות"], painPoints: ["מעקב ידני", "שכחת פולואו-אפים"], trainingTrack: "מסלול מכירות — 2 מפגשים", ...meta(-30) },
  { id: "per-3", name: "המדריך", description: "מלווה תלמידים לאורך מסלול הלמידה ומאשר שלבים.", mappedRole: "מדריך", goals: ["לראות מי תקוע", "לאשר שלבים מהר"], painPoints: ["תלמידים נעלמים", "מעקב התקדמות ידני"], trainingTrack: "מסלול הדרכה — 2 מפגשים", ...meta(-30) },
  { id: "per-4", name: "איש התמיכה", description: "מטפל בקריאות שירות ומתעד פתרונות.", mappedRole: "תמיכה", goals: ["זמן פתרון קצר", "ידע זמין"], painPoints: ["פתרונות חוזרים לא מתועדים"], trainingTrack: "מסלול שירות — 2 מפגשים", ...meta(-30) },
  { id: "per-5", name: "מנהלת המערכת", description: "אחראית תצורה, הרשאות וניטור.", mappedRole: "מנהל מערכת", goals: ["מערכת יציבה", "בקרה מלאה"], painPoints: ["חוסר שקיפות בפעולות אוטומטיות"], trainingTrack: "מסלול ניהול מערכת — מפגש אחד", ...meta(-30) },
  { id: "per-6", name: "התלמידה", description: "לומדת במסלול מובנה ורוצה לדעת בדיוק מה השלב הבא.", mappedRole: "תלמיד", goals: ["מסלול ברור", "משוב מהיר"], painPoints: ["חוסר ודאות מה מצופה"], trainingTrack: "סרטון פתיחה + מדריך אישי", ...meta(-30) },
  { id: "per-7", name: "השותף החיצוני", description: "ספק/מוסד שעובד מול טרגון ללא גישה למערכת.", mappedRole: null, goals: ["תקשורת מסודרת"], painPoints: ["תלות בזמינות הצוות"], trainingTrack: "ללא — ממשק חיצוני בלבד", ...meta(-30) },
];

export const TRAINING_MATERIALS: TrainingMaterial[] = [
  { id: "tm-1", title: "סיור ראשון במרכז הפיקוד", description: "היכרות עם המסך הראשי, ה-KPI והפיד.", kind: "וידאו", audiencePersonaIds: ["per-1"], url: null, stageId: "is-2", ...meta(-25) },
  { id: "tm-2", title: "ניהול לידים מקצה לקצה", description: "מליד חדש ועד סגירה — כולל אוטומציית ההתראות.", kind: "מדריך", audiencePersonaIds: ["per-2"], url: null, stageId: "is-2", ...meta(-25) },
  { id: "tm-3", title: "בניית הצעת מחיר", description: "שורות, הנחות, תוקף ושליחה.", kind: "תרגול", audiencePersonaIds: ["per-2"], url: null, stageId: "is-2", ...meta(-25) },
  { id: "tm-4", title: "אישור שלבי למידה", description: "זרימת האישור של המדריך + טיפול בתלמיד חסום.", kind: "מדריך", audiencePersonaIds: ["per-3"], url: null, stageId: "is-3", ...meta(-24) },
  { id: "tm-5", title: "ניהול קריאת שירות", description: "פתיחה, אבחון, תיעוד פתרון וסגירה.", kind: "מדריך", audiencePersonaIds: ["per-4"], url: null, stageId: "is-3", ...meta(-24) },
  { id: "tm-6", title: "עבודה עם הסוכנים — יסודות", description: "מה סוכן רשאי, מה דורש אישור ואיך קוראים ראיות.", kind: "וידאו", audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4"], url: null, stageId: "is-4", ...meta(-22) },
  { id: "tm-7", title: "מרכז האישורים", description: "אישור/דחייה/בקשת תיקון של פעולות סוכן.", kind: "תרגול", audiencePersonaIds: ["per-1"], url: null, stageId: "is-4", ...meta(-22) },
  { id: "tm-8", title: "זיכרון ארגוני — כתיבה נכונה", description: "רשומות, wikilinks ומתי כותבים זיכרון קבוע.", kind: "מדריך", audiencePersonaIds: ["per-1", "per-5"], url: null, stageId: "is-5", ...meta(-20) },
  { id: "tm-9", title: "ניהול הרשאות ותצורה", description: "משתמשים, תפקידים והגדרות סוכנים.", kind: "מדריך", audiencePersonaIds: ["per-5"], url: null, stageId: "is-2", ...meta(-20) },
  { id: "tm-10", title: "המסלול שלי — לתלמידים", description: "איך עוקבים אחרי השלבים, מגישים ומבקשים עזרה.", kind: "וידאו", audiencePersonaIds: ["per-6"], url: null, stageId: "is-3", ...meta(-18) },
  { id: "tm-11", title: "דוחות וניתוחים — קריאה נכונה", description: "מהיכן כל מספר מגיע ואיך לחקור אותו.", kind: "מדריך", audiencePersonaIds: ["per-1", "per-5"], url: null, stageId: "is-5", ...meta(-16) },
  { id: "tm-12", title: "שאלות נפוצות והתנגדויות", description: "תשובות לחששות נפוצים על AI ואוטומציה.", kind: "מצגת", audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5"], url: null, stageId: "is-6", ...meta(-14) },
  { id: "tm-13", title: "נוהל תמיכה לאחר השקה", description: "איך פותחים בקשת תמיכה ומה ה-SLA.", kind: "מדריך", audiencePersonaIds: ["per-1", "per-2", "per-3", "per-4", "per-5", "per-6"], url: null, stageId: "is-6", ...meta(-12) },
];

export const IMPLEMENTATION_STAGES: ImplementationStage[] = [
  { id: "is-1", order: 1, name: "תשתית ונתונים", description: "הקמת שכבת הנתונים, ישויות, ראוטים ומסד מקומי.", status: "בתהליך", startPlanned: d(-10), endPlanned: d(5), gateId: "sg-1", ...meta(-10, 0) },
  { id: "is-2", order: 2, name: "מסכי ליבה — CRM ומכירות", description: "מרכז פיקוד, לידים, לקוחות, הצעות מחיר.", status: "לא התחיל", startPlanned: d(5), endPlanned: d(20), gateId: "sg-2", ...meta(-10) },
  { id: "is-3", order: 3, name: "למידה ושירות", description: "קורסים, מסלולי למידה, קריאות שירות.", status: "לא התחיל", startPlanned: d(20), endPlanned: d(35), gateId: "sg-3", ...meta(-10) },
  { id: "is-4", order: 4, name: "סוכני AI ואישורים", description: "שבעת הסוכנים, חדר התיאום ומרכז האישורים.", status: "לא התחיל", startPlanned: d(35), endPlanned: d(50), gateId: "sg-4", ...meta(-10) },
  { id: "is-5", order: 5, name: "זיכרון, ידע ודוחות", description: "זיכרון ארגוני, מאגר ידע ואנליטיקה.", status: "לא התחיל", startPlanned: d(50), endPlanned: d(65), gateId: "sg-5", ...meta(-10) },
  { id: "is-6", order: 6, name: "הטמעה והשקה", description: "הדרכות לפי פרסונות, ניסוי מבוקר והשקה מלאה.", status: "לא התחיל", startPlanned: d(65), endPlanned: d(80), gateId: "sg-6", ...meta(-10) },
];

export const STAGE_GATES: StageGate[] = [
  { id: "sg-1", order: 1, name: "שער תשתית", criteria: ["typecheck ירוק", "כל הבדיקות עוברות", "build + preview תקינים", "seed דטרמיניסטי נטען"], evidenceIds: ["ev-6"], status: "בתהליך", decidedAt: null, decidedById: null, ...meta(-10, 0) },
  { id: "sg-2", order: 2, name: "שער מסכי ליבה", criteria: ["כל KPI נגזר מ-selector", "אין כפתור מת", "RTL מלא"], evidenceIds: [], status: "לא התחיל", decidedAt: null, decidedById: null, ...meta(-10) },
  { id: "sg-3", order: 3, name: "שער למידה ושירות", criteria: ["מסלול תלמיד מלא", "זרימת קריאה מקצה לקצה"], evidenceIds: [], status: "לא התחיל", decidedAt: null, decidedById: null, ...meta(-10) },
  { id: "sg-4", order: 4, name: "שער סוכנים", criteria: ["כל פעולה רגישה מאחורי אישור", "יומן ביקורת מלא", "ראיות לכל המלצה"], evidenceIds: [], status: "לא התחיל", decidedAt: null, decidedById: null, ...meta(-10) },
  { id: "sg-5", order: 5, name: "שער ידע ודוחות", criteria: ["זיכרון ארגוני פעיל", "כל דוח ניתן להסבר עד רמת הרשומה"], evidenceIds: [], status: "לא התחיל", decidedAt: null, decidedById: null, ...meta(-10) },
  { id: "sg-6", order: 6, name: "שער השקה", criteria: ["כל הפרסונות עברו הדרכה", "שבועיים ללא תקלה חוסמת", "אישור מנכ\"ל"], evidenceIds: [], status: "לא התחיל", decidedAt: null, decidedById: null, ...meta(-10) },
];

export const SUPPORT_REQUESTS: SupportRequest[] = [
  { id: "sr-1", subject: "איך מוסיפים משתמש חדש?", description: "רוצים לצרף עובד חדש למערכת עם הרשאות מכירות.", requesterId: "u-maya", channel: "מערכת", status: "נסגרה", priority: "נמוכה", resolution: "הוסבר תהליך ההוספה במסך ניהול המערכת.", ...meta(-8, -7) },
  { id: "sr-2", subject: "הסוכן Hunter לא מציע פולואו-אפים", description: "נראה שההתראות לא רצות מאז אתמול.", requesterId: "u-maya", channel: "וואטסאפ", status: "בטיפול", priority: "בינונית", resolution: "", ...meta(-1, 0) },
  { id: "sr-3", subject: "בקשה: ייצוא לידים ל-CSV", description: "צריך ייצוא חודשי של הלידים לדוח חיצוני.", requesterId: CEO_USER_ID, channel: "מייל", status: "פתוחה", priority: "נמוכה", resolution: "", ...meta(-3, -3) },
];
