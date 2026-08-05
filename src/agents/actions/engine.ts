// S11.3 — deterministic implementations of the 14 agent business actions.
// Pure, local, no remote model, no external side effects. Approval-gated actions
// mutate ONLY an isolated in-memory demo store (never Customers/Contacts
// persistence) and are idempotent (duplicate application is blocked).
import { newCorrelationId } from "@/observability/domainEvents";
import {
  DEMO_CONTACTS,
  DEMO_CUSTOMERS,
  DEMO_KNOWLEDGE,
  DEMO_RECOMMENDATIONS,
  FIELD_LABELS_HE,
  REQUIRED_CONTACT_FIELDS,
  REQUIRED_CUSTOMER_FIELDS,
  type DemoCustomer,
} from "./demoData";
import { getActionDefinition } from "./registry";
import type {
  AgentActionEvidence,
  AgentActionFinding,
  AgentActionRecommendation,
  AgentActionResult,
  AgentActionInputs,
  AgentActionWhy,
  ActionStatus,
  RunContext,
} from "./contract";
import { LOCAL_ENGINE_LABEL } from "./contract";

// ── isolated in-memory demo mutation store (NOT customers/contacts persistence) ──
const appliedCorrections = new Set<string>();
const savedAutomations = new Map<string, { trigger: string; at: string }>();

/** Test-only: reset the demo mutation store between cases. */
export function __resetAgentActionStore(): void {
  appliedCorrections.clear();
  savedAutomations.clear();
}
export function appliedCorrectionCount(): number {
  return appliedCorrections.size;
}
export function savedAutomationCount(): number {
  return savedAutomations.size;
}

function missingFields(c: DemoCustomer): string[] {
  return REQUIRED_CUSTOMER_FIELDS.filter((f) => c[f] == null || String(c[f]).trim() === "").map(String);
}

function proposedValue(field: string): string {
  switch (field) {
    case "email": return "update@example.com";
    case "phone": return "03-5559999";
    case "city": return "לא ידוע — לעדכון";
    case "segment": return "כללי";
    default: return "לעדכון";
  }
}

interface Assembled {
  status: ActionStatus;
  summary: string;
  findings?: AgentActionFinding[];
  recommendations?: AgentActionRecommendation[];
  evidence?: AgentActionEvidence[];
  affectedRecordIds?: string[];
  navigationTarget?: string | null;
  why: AgentActionWhy;
}

function assemble(a: Assembled, ctx: RunContext): AgentActionResult {
  return {
    status: a.status,
    summary: a.summary,
    findings: a.findings ?? [],
    recommendations: a.recommendations ?? [],
    evidence: a.evidence ?? [],
    affectedRecordIds: a.affectedRecordIds ?? [],
    navigationTarget: a.navigationTarget ?? null,
    createdAt: ctx.now ?? new Date().toISOString(),
    correlationId: ctx.correlationId ?? newCorrelationId(),
    why: a.why,
    engineLabel: LOCAL_ENGINE_LABEL,
  };
}

function validationError(messageHe: string, ctx: RunContext): AgentActionResult {
  return assemble({
    status: "validation_error",
    summary: messageHe,
    why: {
      foundHe: "הקלט אינו תקין.", importanceHe: "בלי קלט תקין לא ניתן להריץ פעולה בטוחה.",
      basedOnHe: "בדיקת הקלט המקומית.", recommendedHe: messageHe, isProposalOnly: true,
    },
  }, ctx);
}

// ── per-action implementations ──────────────────────────────────────────────
type Impl = (inputs: AgentActionInputs, ctx: RunContext) => AgentActionResult;

const orchSystemReview: Impl = (_i, ctx) => {
  const incomplete = DEMO_CUSTOMERS.filter((c) => missingFields(c).length > 0);
  const custWithoutPrimary = DEMO_CUSTOMERS.filter(
    (c) => !DEMO_CONTACTS.some((k) => k.customerId === c.id && k.isPrimary),
  );
  const findings: AgentActionFinding[] = [
    { id: "f-cust", severity: "info", textHe: `סה"כ ${DEMO_CUSTOMERS.length} לקוחות ו-${DEMO_CONTACTS.length} אנשי קשר (דמו).` },
    { id: "f-incomplete", severity: incomplete.length ? "medium" : "info", textHe: `${incomplete.length} לקוחות עם רשומה לא שלמה.` },
    { id: "f-noprimary", severity: custWithoutPrimary.length ? "high" : "info", textHe: `${custWithoutPrimary.length} לקוחות ללא איש קשר ראשי.` },
    { id: "f-recs", severity: "info", textHe: `${DEMO_RECOMMENDATIONS.length} ממצאי סוכנים דטרמיניסטיים אחרונים.` },
  ];
  return assemble({
    status: "ok",
    summary: `סקירת מצב: ${incomplete.length} רשומות חסרות, ${custWithoutPrimary.length} ללא איש קשר ראשי.`,
    findings,
    recommendations: DEMO_RECOMMENDATIONS.map((r) => ({ id: r.id, textHe: r.titleHe, severity: r.severity, navigationTarget: "/customers" })),
    evidence: incomplete.map((c) => ({ kind: "customer", refId: c.id, labelHe: c.name })),
    affectedRecordIds: incomplete.map((c) => c.id),
    navigationTarget: "/customers",
    why: {
      foundHe: `${incomplete.length} לקוחות חסרים ו-${custWithoutPrimary.length} ללא איש קשר ראשי.`,
      importanceHe: "רשומות חסרות פוגעות במעקב, בפילוח ובאיכות הדמו.",
      basedOnHe: "נתוני הדגמה סינתטיים בלבד (לקוחות ואנשי קשר).",
      recommendedHe: "לטפל תחילה בלקוחות ללא איש קשר ראשי, ואז בשדות החסרים.",
      isProposalOnly: false,
    },
  }, ctx);
};

const orchActionPlan: Impl = (_i, ctx) => {
  const recs: AgentActionRecommendation[] = [];
  const noPrimary = DEMO_CUSTOMERS.filter((c) => !DEMO_CONTACTS.some((k) => k.customerId === c.id && k.isPrimary));
  const incomplete = DEMO_CUSTOMERS.filter((c) => missingFields(c).length > 0);
  noPrimary.forEach((c) => recs.push({ id: `plan-primary-${c.id}`, textHe: `להוסיף איש קשר ראשי ל«${c.name}».`, severity: "high", ownerHe: "צוות מכירות", navigationTarget: "/contacts" }));
  incomplete.forEach((c) => recs.push({ id: `plan-fields-${c.id}`, textHe: `להשלים ${missingFields(c).map((f) => FIELD_LABELS_HE[f] ?? f).join(", ")} ל«${c.name}».`, severity: "medium", ownerHe: "צוות תפעול", navigationTarget: "/customers" }));
  return assemble({
    status: recs.length ? "ok" : "empty",
    summary: recs.length ? `תוכנית פעולה מדורגת עם ${recs.length} צעדים (הצעה בלבד).` : "אין פערים פתוחים — לא נדרשת תוכנית.",
    recommendations: recs,
    evidence: [...noPrimary, ...incomplete].map((c) => ({ kind: "customer", refId: c.id, labelHe: c.name })),
    affectedRecordIds: [...new Set([...noPrimary, ...incomplete].map((c) => c.id))],
    navigationTarget: "/customers",
    why: {
      foundHe: `${noPrimary.length} פערי איש קשר ראשי ו-${incomplete.length} רשומות חסרות.`,
      importanceHe: "תעדוף לפי חומרה מכוון את הצוות לפעולה בעלת ההשפעה הגבוהה ביותר קודם.",
      basedOnHe: "נתוני הדגמה סינתטיים בלבד.",
      recommendedHe: "לבצע לפי הסדר — חומרה גבוהה תחילה.",
      isProposalOnly: true,
    },
  }, ctx);
};

const hunterIncompleteCustomers: Impl = (_i, ctx) => {
  const incomplete = DEMO_CUSTOMERS.map((c) => ({ c, miss: missingFields(c) })).filter((x) => x.miss.length > 0);
  if (!incomplete.length) {
    return assemble({ status: "empty", summary: "כל רשומות הלקוח (דמו) שלמות.", navigationTarget: "/customers", why: emptyWhy("לקוחות", "/customers") }, ctx);
  }
  return assemble({
    status: "ok",
    summary: `${incomplete.length} לקוחות עם מידע חסר.`,
    findings: incomplete.map(({ c, miss }) => ({ id: `miss-${c.id}`, severity: "medium", recordId: c.id, textHe: `«${c.name}» חסר: ${miss.map((f) => FIELD_LABELS_HE[f] ?? f).join(", ")}.` })),
    evidence: incomplete.map(({ c }) => ({ kind: "customer", refId: c.id, labelHe: c.name })),
    affectedRecordIds: incomplete.map(({ c }) => c.id),
    navigationTarget: "/customers",
    why: {
      foundHe: `${incomplete.length} רשומות לקוח חסרות שדות חובה.`,
      importanceHe: "פרטים חסרים מונעים מעקב, פילוח ופנייה יעילה.",
      basedOnHe: `סריקת ${DEMO_CUSTOMERS.length} רשומות דמו מול שדות החובה.`,
      recommendedHe: "לפתוח את מסך הלקוחות ולהשלים את השדות המסומנים.",
      isProposalOnly: false,
    },
  }, ctx);
};

const hunterMissingContacts: Impl = (_i, ctx) => {
  const noPrimary = DEMO_CUSTOMERS.filter((c) => !DEMO_CONTACTS.some((k) => k.customerId === c.id && k.isPrimary));
  const badContacts = DEMO_CONTACTS.filter((k) => REQUIRED_CONTACT_FIELDS.some((f) => k[f] == null || String(k[f]).trim() === ""));
  const findings: AgentActionFinding[] = [
    ...noPrimary.map((c) => ({ id: `np-${c.id}`, severity: "high" as const, recordId: c.id, textHe: `«${c.name}» ללא איש קשר ראשי.` })),
    ...badContacts.map((k) => ({ id: `bc-${k.id}`, severity: "low" as const, recordId: k.id, textHe: `איש הקשר «${k.name}» חסר ${REQUIRED_CONTACT_FIELDS.filter((f) => k[f] == null || String(k[f]).trim() === "").map((f) => FIELD_LABELS_HE[f] ?? f).join(", ")}.` })),
  ];
  if (!findings.length) {
    return assemble({ status: "empty", summary: "לכל הלקוחות איש קשר ראשי ופרטים מלאים.", navigationTarget: "/contacts", why: emptyWhy("אנשי קשר", "/contacts") }, ctx);
  }
  return assemble({
    status: "ok",
    summary: `${noPrimary.length} לקוחות ללא איש קשר ראשי, ${badContacts.length} אנשי קשר עם פרטים חסרים.`,
    findings,
    evidence: [...noPrimary.map((c) => ({ kind: "customer", refId: c.id, labelHe: c.name })), ...badContacts.map((k) => ({ kind: "contact", refId: k.id, labelHe: k.name }))],
    affectedRecordIds: [...noPrimary.map((c) => c.id), ...badContacts.map((k) => k.id)],
    navigationTarget: "/contacts",
    why: {
      foundHe: `${noPrimary.length} ללא איש קשר ראשי ו-${badContacts.length} עם פרטים חסרים.`,
      importanceHe: "בלי איש קשר ראשי אין נקודת מגע ברורה מול הלקוח.",
      basedOnHe: `הצלבת ${DEMO_CUSTOMERS.length} לקוחות מול ${DEMO_CONTACTS.length} אנשי קשר.`,
      recommendedHe: "להגדיר איש קשר ראשי ולהשלים טלפון/דוא\"ל.",
      isProposalOnly: false,
    },
  }, ctx);
};

const fixerPropose: Impl = (inputs, ctx) => {
  const rec = DEMO_CUSTOMERS.find((c) => c.id === inputs.recordId);
  if (!rec) return validationError(`רשומת דמו «${inputs.recordId}» לא נמצאה.`, ctx);
  const miss = missingFields(rec);
  if (!miss.length) {
    return assemble({ status: "empty", summary: `רשומת «${rec.name}» שלמה — אין תיקון נדרש.`, affectedRecordIds: [rec.id], navigationTarget: "/customers", why: emptyWhy("לקוחות", "/customers") }, ctx);
  }
  const findings: AgentActionFinding[] = miss.map((f) => ({ id: `fix-${f}`, severity: "medium", recordId: rec.id, textHe: `${FIELD_LABELS_HE[f] ?? f}: «(ריק)» → «${proposedValue(f)}»` }));
  return assemble({
    status: "ok",
    summary: `הצעת תיקון ל«${rec.name}» — ${miss.length} שדות (לפני/אחרי). הצעה בלבד.`,
    findings,
    recommendations: [{ id: `apply-${rec.id}`, textHe: "לאשר ולהחיל את התיקון (דמו מקומי).", severity: "medium", navigationTarget: "/customers" }],
    evidence: [{ kind: "customer", refId: rec.id, labelHe: rec.name }],
    affectedRecordIds: [rec.id],
    navigationTarget: "/customers",
    why: {
      foundHe: `${miss.length} שדות חסרים ב«${rec.name}».`,
      importanceHe: "תיקון מוצע בשקיפות מלאה (לפני/אחרי) לפני כל שינוי.",
      basedOnHe: "רשומת הדמו הנבחרת מול שדות החובה.",
      recommendedHe: "לבדוק את ההצעה ולאשר ידנית את ההחלה.",
      isProposalOnly: true,
    },
  }, ctx);
};

const fixerApply: Impl = (inputs, ctx) => {
  const rec = DEMO_CUSTOMERS.find((c) => c.id === inputs.recordId);
  if (!rec) return validationError(`רשומת דמו «${inputs.recordId}» לא נמצאה.`, ctx);
  if (ctx.approved !== true) {
    return assemble({
      status: "awaiting_approval",
      summary: `התיקון ל«${rec.name}» ממתין לאישור אנושי מפורש — לא בוצע שינוי.`,
      evidence: [{ kind: "customer", refId: rec.id, labelHe: rec.name }],
      affectedRecordIds: [rec.id], navigationTarget: "/customers",
      why: { foundHe: `הצעת תיקון ל«${rec.name}».`, importanceHe: "שינוי דמו מחייב אישור אנושי מפורש (HITL).", basedOnHe: "מדיניות האישורים המקומית.", recommendedHe: "לאשר כדי להחיל, או לבטל.", isProposalOnly: true },
    }, ctx);
  }
  const already = appliedCorrections.has(rec.id);
  if (!already) appliedCorrections.add(rec.id);
  return assemble({
    status: "applied",
    summary: already ? `התיקון ל«${rec.name}» כבר הוחל — חסימת כפילות (ללא שינוי נוסף).` : `התיקון ל«${rec.name}» הוחל בהצלחה (דמו מקומי).`,
    evidence: [{ kind: "customer", refId: rec.id, labelHe: rec.name }],
    affectedRecordIds: [rec.id], navigationTarget: "/customers",
    why: {
      foundHe: already ? "התיקון כבר הוחל בעבר." : `הוחל תיקון דמו ל«${rec.name}».`,
      importanceHe: "החלה חד-פעמית בלבד — הרצה חוזרת אינה משנה דבר.",
      basedOnHe: "אישור אנושי מפורש + מאגר החלות מקומי.",
      recommendedHe: "אין פעולה נוספת נדרשת.",
      isProposalOnly: false,
    },
  }, ctx);
};

const flowFollowup: Impl = (inputs, ctx) => {
  const rec = DEMO_CUSTOMERS.find((c) => c.id === inputs.recordId);
  if (!rec) return validationError(`לקוח דמו «${inputs.recordId}» לא נמצא.`, ctx);
  const steps: AgentActionRecommendation[] = [
    { id: "s1", textHe: `יום 0 — לתעד את «${rec.name}» ולוודא איש קשר ראשי.`, severity: "medium", navigationTarget: "/contacts" },
    { id: "s2", textHe: "יום 2 — להכין טיוטת פנייה (ללא שליחה בפועל).", severity: "low", navigationTarget: "/documents" },
    { id: "s3", textHe: "יום 5 — לתזמן משימת מעקב.", severity: "low", navigationTarget: "/tasks" },
  ];
  return assemble({
    status: "ok",
    summary: `רצף פולואו-אפ דטרמיניסטי ל«${rec.name}» (${steps.length} צעדים) — ללא שליחה.`,
    recommendations: steps,
    evidence: [{ kind: "customer", refId: rec.id, labelHe: rec.name }],
    affectedRecordIds: [rec.id], navigationTarget: "/tasks",
    why: {
      foundHe: `לקוח «${rec.name}» ללא רצף מעקב מוגדר.`,
      importanceHe: "רצף מסודר מונע נשירת לקוחות בין השלבים.",
      basedOnHe: "רשומת הלקוח הנבחרת (דמו).",
      recommendedHe: "לעקוב אחר הצעדים לפי התזמון — כל שליחה נשארת ידנית.",
      isProposalOnly: true,
    },
  }, ctx);
};

const flowAutomation: Impl = (inputs, ctx) => {
  const trigger = inputs.trigger ?? "";
  const triggerLabel = trigger === "incomplete-customer" ? "רשומת לקוח לא שלמה" : "לקוח ללא איש קשר ראשי";
  const preview: AgentActionFinding[] = [
    { id: "a-when", severity: "info", textHe: `מתי: כאשר מזוהה ${triggerLabel}.` },
    { id: "a-then", severity: "info", textHe: "אז: לפתוח משימת דמו מקומית לצוות (ללא טריגר חיצוני / webhook)." },
  ];
  const autoEvidence: AgentActionEvidence[] = [{ kind: "automation", refId: `auto-${trigger}`, labelHe: triggerLabel }];
  if (ctx.approved !== true) {
    return assemble({
      status: "awaiting_approval",
      summary: "תצוגה מקדימה של אוטומציה — ממתינה לאישור לפני שמירה מקומית.",
      findings: preview, evidence: autoEvidence, navigationTarget: "/automations",
      why: { foundHe: `הצעת אוטומציה לטריגר «${triggerLabel}».`, importanceHe: "שמירת אוטומציה מחייבת אישור אנושי מפורש.", basedOnHe: "בחירת הטריגר המקומית.", recommendedHe: "לאשר כדי לשמור מקומית, או לבטל.", isProposalOnly: true },
    }, ctx);
  }
  const already = savedAutomations.has(trigger);
  if (!already) savedAutomations.set(trigger, { trigger, at: ctx.now ?? new Date().toISOString() });
  return assemble({
    status: "applied",
    summary: already ? "האוטומציה כבר נשמרה — חסימת כפילות." : "האוטומציה נשמרה מקומית (ללא טריגר חיצוני).",
    findings: preview, evidence: autoEvidence, navigationTarget: "/automations",
    why: { foundHe: `אוטומציית «${triggerLabel}».`, importanceHe: "שמירה חד-פעמית; ללא הפעלה חיצונית.", basedOnHe: "אישור אנושי + מאגר אוטומציות מקומי.", recommendedHe: "לצפות באוטומציה במסך האוטומציות.", isProposalOnly: false },
  }, ctx);
};

const mentorExplain: Impl = (inputs, ctx) => {
  const rec = DEMO_RECOMMENDATIONS.find((r) => r.id === inputs.recommendationId);
  if (!rec) return validationError("ההמלצה המבוקשת לא נמצאה.", ctx);
  return assemble({
    status: "ok",
    summary: `הסבר: «${rec.titleHe}».`,
    findings: [{ id: "why", severity: rec.severity, textHe: rec.rationaleHe }],
    evidence: rec.basedOnRecordIds.map((id) => ({ kind: "customer", refId: id, labelHe: DEMO_CUSTOMERS.find((c) => c.id === id)?.name ?? id })),
    affectedRecordIds: [...rec.basedOnRecordIds], navigationTarget: "/customers",
    why: {
      foundHe: rec.rationaleHe,
      importanceHe: "שקיפות ההמלצה מאפשרת החלטה אנושית מושכלת.",
      basedOnHe: `הרשומות: ${rec.basedOnRecordIds.join(", ")}.`,
      recommendedHe: "לבחון את הראיות ואז להחליט.",
      isProposalOnly: false,
    },
  }, ctx);
};

const mentorChecklist: Impl = (_i, ctx) => {
  const noPrimary = DEMO_CUSTOMERS.filter((c) => !DEMO_CONTACTS.some((k) => k.customerId === c.id && k.isPrimary));
  const incomplete = DEMO_CUSTOMERS.filter((c) => missingFields(c).length > 0);
  const items: AgentActionRecommendation[] = [
    { id: "chk-1", textHe: `להגדיר איש קשר ראשי ל-${noPrimary.length} לקוחות (משימת דמו).`, severity: "high", navigationTarget: "/contacts" },
    { id: "chk-2", textHe: `להשלים שדות חסרים ב-${incomplete.length} רשומות (משימת דמו).`, severity: "medium", navigationTarget: "/customers" },
    { id: "chk-3", textHe: "לעיין במדיניות האישורים לפני החלת שינוי (משימת דמו).", severity: "low", navigationTarget: "/governance" },
  ];
  return assemble({
    status: "ok",
    summary: `רשימת שיפור מודרכת — ${items.length} משימות דמו עם מעקב השלמה מקומי.`,
    recommendations: items,
    evidence: [...noPrimary, ...incomplete].slice(0, 5).map((c) => ({ kind: "customer", refId: c.id, labelHe: c.name })),
    navigationTarget: "/learning",
    why: {
      foundHe: `${noPrimary.length} פערי איש קשר ו-${incomplete.length} רשומות חסרות.`,
      importanceHe: "רשימה קצרה ממקדת את השיפור ומאפשרת מעקב.",
      basedOnHe: "נתוני הדגמה סינתטיים.",
      recommendedHe: "לסמן משימות כהושלמו במעקב המקומי.",
      isProposalOnly: true,
    },
  }, ctx);
};

const nexaQuestion: Impl = (inputs, ctx) => {
  const q = (inputs.query ?? "").trim();
  const hit = rankKnowledge(q)[0];
  if (!hit) return assemble({ status: "empty", summary: "לא נמצאה תשובה במאגר המקומי.", navigationTarget: "/knowledge", why: emptyWhy("ידע", "/knowledge") }, ctx);
  return assemble({
    status: "ok",
    summary: hit.bodyHe,
    findings: [{ id: "ans", severity: "info", textHe: hit.bodyHe }],
    evidence: [{ kind: "knowledge", refId: hit.id, labelHe: `${hit.title} · ${hit.sourceHe}` }],
    navigationTarget: routeForKnowledge(hit.id),
    why: {
      foundHe: `נמצאה תשובה בערך «${hit.title}».`,
      importanceHe: "תשובות מבוססות מקור מקומי בלבד — ללא המצאה.",
      basedOnHe: `${hit.title} (${hit.sourceHe}).`,
      recommendedHe: "לעבור למסך הרלוונטי לפי הקישור.",
      isProposalOnly: false,
    },
  }, ctx);
};

const NAV_KEYWORDS: readonly { kw: readonly string[]; route: string; labelHe: string }[] = [
  { kw: ["לקוח", "לקוחות"], route: "/customers", labelHe: "מסך הלקוחות" },
  { kw: ["ליד", "לידים", "crm", "הזדמנות"], route: "/crm", labelHe: "מסך ה-CRM" },
  { kw: ["איש קשר", "אנשי קשר", "קשר"], route: "/contacts", labelHe: "מסך אנשי הקשר" },
  { kw: ["אוטומציה", "אוטומציות"], route: "/automations", labelHe: "מסך האוטומציות" },
  { kw: ["ידע", "מאגר"], route: "/knowledge", labelHe: "מאגר הידע" },
  { kw: ["אישור", "ממשל"], route: "/governance", labelHe: "ממשל ובקרת AI" },
];

const nexaNavigation: Impl = (inputs, ctx) => {
  const q = (inputs.query ?? "").trim();
  const match = NAV_KEYWORDS.find((m) => m.kw.some((k) => q.includes(k)));
  if (!match) return assemble({ status: "empty", summary: "לא זוהה יעד ניווט מתאים לבקשה.", navigationTarget: "/knowledge", why: emptyWhy("ניווט", "/knowledge") }, ctx);
  return assemble({
    status: "ok",
    summary: `היעד המתאים: ${match.labelHe}.`,
    recommendations: [{ id: "go", textHe: `לפתוח את ${match.labelHe}.`, navigationTarget: match.route }],
    evidence: [{ kind: "route", refId: match.route, labelHe: match.labelHe }],
    navigationTarget: match.route,
    why: {
      foundHe: `הבקשה תואמת ל${match.labelHe}.`,
      importanceHe: "הכוונה בטוחה חוסכת חיפוש ומונעת פעולה שגויה.",
      basedOnHe: "מילות מפתח מקומיות בבקשה.",
      recommendedHe: `לעבור אל ${match.labelHe} — ללא ביצוע כתיבה.`,
      isProposalOnly: false,
    },
  }, ctx);
};

const wikiSearch: Impl = (inputs, ctx) => {
  const results = rankKnowledge((inputs.query ?? "").trim());
  if (!results.length) return assemble({ status: "empty", summary: "לא נמצאו ערכי ידע תואמים.", navigationTarget: "/knowledge", why: emptyWhy("ידע", "/knowledge") }, ctx);
  return assemble({
    status: "ok",
    summary: `${results.length} תוצאות ידע מדורגות.`,
    findings: results.map((k, i) => ({ id: `r-${k.id}`, severity: "info", textHe: `${i + 1}. ${k.title} — ${k.category} (${k.sourceHe})` })),
    evidence: results.map((k) => ({ kind: "knowledge", refId: k.id, labelHe: `${k.title} · ${k.sourceHe}` })),
    navigationTarget: "/knowledge",
    why: {
      foundHe: `${results.length} ערכים תואמים למונח.`,
      importanceHe: "דירוג לפי רלוונטיות מזרז מציאת מקור אמין.",
      basedOnHe: `חיפוש ב-${DEMO_KNOWLEDGE.length} ערכי ידע מקומיים.`,
      recommendedHe: "לפתוח את הערך המדורג ראשון.",
      isProposalOnly: false,
    },
  }, ctx);
};

const wikiSummarize: Impl = (inputs, ctx) => {
  const k = DEMO_KNOWLEDGE.find((e) => e.id === inputs.entryId);
  if (!k) return validationError("ערך הידע המבוקש לא נמצא.", ctx);
  return assemble({
    status: "ok",
    summary: `${k.title}: ${k.bodyHe}`,
    findings: [{ id: "sum", severity: "info", textHe: k.bodyHe }],
    evidence: [{ kind: "knowledge", refId: k.id, labelHe: `${k.title} · ${k.sourceHe}` }],
    navigationTarget: "/knowledge",
    why: {
      foundHe: `סוכם הערך «${k.title}».`,
      importanceHe: "סיכום עם ייחוס מקור מונע אובדן הקשר.",
      basedOnHe: `הערך «${k.title}» (${k.sourceHe}) — ללא תוכן שאינו במקור.`,
      recommendedHe: "לעיין במקור המלא בעת הצורך.",
      isProposalOnly: false,
    },
  }, ctx);
};

// ── helpers ──────────────────────────────────────────────────────────────────
function emptyWhy(subjectHe: string, route: string): AgentActionWhy {
  return { foundHe: `לא נמצאו ${subjectHe} רלוונטיים.`, importanceHe: "מצב תקין — אין פערים לטפל בהם.", basedOnHe: "סריקת נתוני הדמו המקומיים.", recommendedHe: `ניתן להמשיך במסך (${route}).`, isProposalOnly: false };
}
function rankKnowledge(q: string): typeof DEMO_KNOWLEDGE[number][] {
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return DEMO_KNOWLEDGE
    .map((k) => ({ k, score: terms.reduce((s, t) => s + (k.keywords.some((w) => w.includes(t) || t.includes(w)) ? 2 : 0) + (k.title.includes(t) || k.bodyHe.includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.k);
}
function routeForKnowledge(id: string): string {
  return id === "kn-2" ? "/crm" : id === "kn-3" ? "/governance" : id === "kn-4" ? "/stage-gates" : "/knowledge";
}

const IMPLS: Readonly<Record<string, Impl>> = {
  "orch.system-review": orchSystemReview,
  "orch.action-plan": orchActionPlan,
  "hunter.incomplete-customers": hunterIncompleteCustomers,
  "hunter.missing-contacts": hunterMissingContacts,
  "fixer.propose-correction": fixerPropose,
  "fixer.apply-correction": fixerApply,
  "flow.followup-sequence": flowFollowup,
  "flow.automation-proposal": flowAutomation,
  "mentor.explain-recommendation": mentorExplain,
  "mentor.improvement-checklist": mentorChecklist,
  "nexa.system-question": nexaQuestion,
  "nexa.navigation-guidance": nexaNavigation,
  "wiki.knowledge-search": wikiSearch,
  "wiki.summarize-entry": wikiSummarize,
};

/**
 * Run a business action. Deterministic, local, fail-closed. Validates required
 * inputs, then dispatches. Never throws for expected conditions — returns a
 * typed result with a safe Hebrew message instead.
 */
export function runAgentAction(
  actionId: string,
  inputs: AgentActionInputs = {},
  ctx: RunContext = {},
): AgentActionResult {
  const def = getActionDefinition(actionId);
  if (!def) return validationError("פעולה לא מוכרת.", ctx);
  for (const spec of def.requiredInputs) {
    if (spec.required && (inputs[spec.id] == null || String(inputs[spec.id]).trim() === "")) {
      return validationError(`יש להזין ${spec.labelHe}.`, ctx);
    }
  }
  const impl = IMPLS[actionId];
  if (!impl) return validationError("פעולה לא ממומשת.", ctx);
  try {
    return impl(inputs, ctx);
  } catch {
    // fail closed — never surface a stack trace or a false success
    return assemble({
      status: "execution_error",
      summary: "אירעה תקלה בהרצת הפעולה. לא בוצע שינוי.",
      why: { foundHe: "תקלה בלתי צפויה.", importanceHe: "כשל נחסם כדי למנוע תוצאה שגויה.", basedOnHe: "הרצה מקומית.", recommendedHe: "ניתן לנסות שוב.", isProposalOnly: true },
    }, ctx);
  }
}
