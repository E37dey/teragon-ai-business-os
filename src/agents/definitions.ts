// TERAGON AI BUSINESS OS — the 7 governed product agents (Wave 5, W5-C).
// Definitions are keyed to the seeded Agent record ids (seedData.ts) and are
// DEEPLY FROZEN: agents can never modify definitions or permissions at
// runtime. Permission model is deny-by-default — canAgent() returns true only
// for an explicit grant that is not prohibited.
import type { AgentOperation, ApprovalRequiredAction } from "@/domain/agents";
import type { CollectionKey } from "@/repositories/collections";

export type AgentProviderPolicy = "local-first" | "remote-allowed";

export interface AgentDefinition {
  /** stable id — MUST equal the seeded Agent record id */
  readonly id: string;
  readonly nameHe: string;
  readonly codeName: string;
  readonly purposeHe: string;
  readonly allowedOperations: readonly AgentOperation[];
  /** collection keys the agent may read/operate on */
  readonly allowedDomains: readonly CollectionKey[];
  /** hard bans — checked BEFORE allowedDomains */
  readonly prohibitedDomains: readonly CollectionKey[];
  /** documented hard-banned actions (Hebrew) — for the governance table + UI */
  readonly prohibitedActionsHe: readonly string[];
  readonly tools: readonly string[];
  readonly providerPolicy: AgentProviderPolicy;
  readonly maxExecutionMs: number;
  /** ILS; 0 = no spending allowed */
  readonly maxUsageBudgetILS: number;
  readonly maxTaskDepth: number;
  readonly maxHandoffs: number;
  readonly approvalRequiredFor: readonly ApprovalRequiredAction[];
  readonly promptVersion: string;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const ORCHESTRATOR: AgentDefinition = {
  id: "ag-orchestrator",
  nameHe: "מנהל התזמור",
  codeName: "Teragon Orchestrator",
  purposeHe:
    "מתכנן, מנתב ומסנתז בלבד: מפרק יעד למשימות, בוחר מומחים ומאחד את תוצריהם. לעולם אינו מבצע פעולה עסקית בעצמו.",
  allowedOperations: ["plan", "dispatch", "synthesize"],
  allowedDomains: [
    "agents",
    "agentRuns",
    "agentTasks",
    "agentMessages",
    "agentHandoffs",
    "agentConflicts",
    "agentEvents",
    "agentErrors",
  ],
  prohibitedDomains: ["approvals", "auditEvents", "users", "roles"],
  prohibitedActionsHe: ["ביצוע פעולה עסקית ישירה", "הכרעה שקטה בקונפליקט", "שינוי הרשאות סוכן"],
  tools: ["ניתוב משימות", "בחירת מומחים", "סינתזה"],
  providerPolicy: "local-first",
  maxExecutionMs: 60_000,
  maxUsageBudgetILS: 0,
  maxTaskDepth: 3,
  maxHandoffs: 3,
  approvalRequiredFor: [],
  promptVersion: "v1.2",
};

const HUNTER: AgentDefinition = {
  id: "ag-hunter",
  nameHe: "סוכן מכירות",
  codeName: "Hunter",
  purposeHe:
    "קורא לקוחות, לידים, מוצרים, הצעות ופעילות; מכין טיוטות והמלצות מכירה. אינו מאשר הנחות ואינו שולח הודעות.",
  allowedOperations: [
    "read",
    "search",
    "summarize",
    "classify",
    "explain",
    "identify-missing",
    "draft",
    "recommend",
  ],
  allowedDomains: ["customers", "leads", "products", "printerModels", "quotations", "activities"],
  prohibitedDomains: ["approvals", "auditEvents", "users", "roles", "serviceTickets"],
  prohibitedActionsHe: ["אישור הנחה", "שליחת הודעה ללקוח", "שינוי מחיר"],
  tools: ["קריאת לידים", "התאמת דגמים", "טיוטות הצעה"],
  providerPolicy: "local-first",
  maxExecutionMs: 30_000,
  maxUsageBudgetILS: 0,
  maxTaskDepth: 3,
  maxHandoffs: 3,
  approvalRequiredFor: ["customer-message", "quotation-change", "price-change", "discount"],
  promptVersion: "v1.4",
};

const FIXER: AgentDefinition = {
  id: "ag-fixer",
  nameHe: "סוכן שירות",
  codeName: "Fixer",
  purposeHe:
    "קורא מדפסות, קריאות שירות וידע מאושר; מכין טיוטת אבחון. אינו סוגר קריאות ואינו עוקף החלטת טכנאי.",
  allowedOperations: ["read", "search", "summarize", "classify", "explain", "draft", "recommend"],
  allowedDomains: [
    "printerModels",
    "customerPrinters",
    "serviceTickets",
    "repairActions",
    "knowledgeNotes",
    "aiRecommendations",
    "evidence",
  ],
  prohibitedDomains: ["approvals", "auditEvents", "users", "roles", "quotations"],
  prohibitedActionsHe: ["סגירת קריאה", "עקיפת החלטת טכנאי", "הזמנת חלקים"],
  tools: ["קריאת קריאות שירות", "חיפוש בידע מאושר", "טיוטת אבחון"],
  providerPolicy: "local-first",
  maxExecutionMs: 30_000,
  maxUsageBudgetILS: 0,
  maxTaskDepth: 3,
  maxHandoffs: 3,
  approvalRequiredFor: ["ticket-closure", "customer-message", "external-notification"],
  promptVersion: "v1.3",
};

const MENTOR: AgentDefinition = {
  id: "ag-mentor",
  nameHe: "סוכן הדרכה",
  codeName: "Mentor",
  purposeHe:
    "קורא קורסים, תלמידים, התקדמות ותוכן לימודי; ממליץ על תרגילים. אינו מאשר השלמת שלבים.",
  allowedOperations: ["read", "search", "summarize", "classify", "explain", "recommend"],
  allowedDomains: [
    "courses",
    "students",
    "enrollments",
    "learningPaths",
    "courseSessions",
    "assignments",
    "trainingMaterials",
  ],
  prohibitedDomains: ["approvals", "auditEvents", "users", "roles", "quotations"],
  prohibitedActionsHe: ["אישור השלמת שלב/קורס", "פנייה ישירה לתלמיד", "שינוי ציונים"],
  tools: ["ניתוח התקדמות", "המלצת תרגילים", "התראות למדריך"],
  providerPolicy: "local-first",
  maxExecutionMs: 30_000,
  maxUsageBudgetILS: 0,
  maxTaskDepth: 3,
  maxHandoffs: 3,
  approvalRequiredFor: ["customer-message", "external-notification"],
  promptVersion: "v1.1",
};

const NEXA: AgentDefinition = {
  id: "ag-nexa",
  nameHe: "סוכן שיווק וצמיחה",
  codeName: "Nexa",
  purposeHe:
    "מציע קמפיינים וטקסטים לפולואו-אפ על בסיס לידים ופעילות. אינו מפרסם ואינו שולח דבר בעצמו.",
  allowedOperations: [
    "read",
    "search",
    "summarize",
    "classify",
    "explain",
    "draft",
    "recommend",
    "propose-campaign",
  ],
  allowedDomains: ["leads", "customers", "activities", "meetings", "products"],
  prohibitedDomains: ["approvals", "auditEvents", "users", "roles", "serviceTickets"],
  prohibitedActionsHe: ["פרסום קמפיין", "שליחת הודעה", "התחייבות תקציבית"],
  tools: ["ניתוח לידים", "טיוטות קמפיין", "טקסטים לפולואו-אפ"],
  providerPolicy: "local-first",
  maxExecutionMs: 30_000,
  maxUsageBudgetILS: 0,
  maxTaskDepth: 3,
  maxHandoffs: 3,
  approvalRequiredFor: ["customer-message", "external-notification", "financial-commitment"],
  promptVersion: "v1.0",
};

const WIKI: AgentDefinition = {
  id: "ag-wiki",
  nameHe: "סוכן ידע",
  codeName: "Wiki",
  purposeHe:
    "מחפש בידע מאושר, מסמן סתירות ומציע עדכונים. אינו מאשר ואינו משנה ידע באופן קבוע ללא אישור.",
  allowedOperations: [
    "read",
    "search",
    "summarize",
    "classify",
    "explain",
    "flag-contradiction",
    "propose-update",
  ],
  allowedDomains: ["knowledgeNotes", "memoryRecords", "aiRecommendations", "evidence", "documents"],
  prohibitedDomains: ["approvals", "auditEvents", "users", "roles", "quotations"],
  prohibitedActionsHe: ["אישור רשומת ידע", "שינוי קבוע במאגר", "מחיקת רשומות"],
  tools: ["חיפוש בידע מאושר", "סימון סתירות", "הצעת עדכון"],
  providerPolicy: "local-first",
  maxExecutionMs: 30_000,
  maxUsageBudgetILS: 0,
  maxTaskDepth: 3,
  maxHandoffs: 3,
  approvalRequiredFor: ["permanent-knowledge-update", "permanent-memory-update", "record-deletion"],
  promptVersion: "v1.2",
};

const FLOW: AgentDefinition = {
  id: "ag-flow",
  nameHe: "סוכן אוטומציות",
  codeName: "Flow",
  purposeHe: "מכין תוכניות אוטומציה ומנטר ריצות. אינו מפעיל פעולה חיצונית בעצמו.",
  allowedOperations: [
    "read",
    "search",
    "summarize",
    "classify",
    "explain",
    "draft",
    "prepare-automation-plan",
  ],
  allowedDomains: ["automations", "automationRuns", "tasks", "notifications"],
  prohibitedDomains: ["approvals", "auditEvents", "users", "roles", "customers"],
  prohibitedActionsHe: ["הפעלת פעולה חיצונית", "יצירת אוטומציה חדשה ללא אישור"],
  tools: ["ניטור ריצות", "תוכניות אוטומציה", "דוחות כשלים"],
  providerPolicy: "local-first",
  maxExecutionMs: 30_000,
  maxUsageBudgetILS: 0,
  maxTaskDepth: 3,
  maxHandoffs: 3,
  approvalRequiredFor: ["external-automation", "external-notification"],
  promptVersion: "v1.1",
};

/** The 7 governed agents — deeply frozen; runtime mutation throws. */
export const AGENT_DEFINITIONS: Readonly<Record<string, AgentDefinition>> = deepFreeze({
  [ORCHESTRATOR.id]: ORCHESTRATOR,
  [HUNTER.id]: HUNTER,
  [FIXER.id]: FIXER,
  [MENTOR.id]: MENTOR,
  [NEXA.id]: NEXA,
  [WIKI.id]: WIKI,
  [FLOW.id]: FLOW,
});

export const AGENT_IDS: readonly string[] = Object.freeze(Object.keys(AGENT_DEFINITIONS));

export function getAgentDefinition(agentId: string): AgentDefinition | undefined {
  return AGENT_DEFINITIONS[agentId];
}

/**
 * Deny-by-default permission checker. True ONLY when:
 * - the agent id is one of the 7 governed definitions, AND
 * - the operation is explicitly granted, AND
 * - the domain is NOT in prohibitedDomains (hard ban wins), AND
 * - the domain is explicitly in allowedDomains.
 * Unknown agent / operation / domain ⇒ false. No exceptions.
 */
export function canAgent(agentId: string, operation: AgentOperation, domain: CollectionKey): boolean {
  const def = AGENT_DEFINITIONS[agentId];
  if (!def) return false;
  if (!def.allowedOperations.includes(operation)) return false;
  if (def.prohibitedDomains.includes(domain)) return false;
  return def.allowedDomains.includes(domain);
}
