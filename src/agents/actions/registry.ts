// S11.3 — the registry of the 14 agent business actions (exactly 2 per agent).
// Administrative controls (enable/disable, select, emergency-stop) are NOT here —
// this registry is business actions only.
import type { AgentActionDefinition } from "./contract";

const RESULT_SCHEMA = "AgentActionResult.v1";

export const AGENT_ACTIONS: readonly AgentActionDefinition[] = Object.freeze(
  [
    // ── Teragon Orchestrator ──────────────────────────────────────────────
    {
      id: "orch.system-review", agentId: "ag-orchestrator",
      titleHe: "סקירת מצב המערכת",
      descriptionHe: "מסכם לקוחות, אנשי קשר, רשומות חסרות וממצאי סוכנים אחרונים — עם עדיפויות וראיות.",
      requiredInputs: [], capability: "summarize", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["customers", "contacts", "agentRuns"], resultSchema: RESULT_SCHEMA,
    },
    {
      id: "orch.action-plan", agentId: "ag-orchestrator",
      titleHe: "בניית תוכנית פעולה",
      descriptionHe: "מפיק תוכנית פעולה מדורגת לפי חומרה, עם בעלים מומלץ ויעד ניווט — הצעה בלבד.",
      requiredInputs: [], capability: "plan", riskLevel: "low",
      approvalRequired: false, executionMode: "PROPOSAL_ONLY",
      domains: ["customers", "contacts"], resultSchema: RESULT_SCHEMA,
    },

    // ── Hunter ────────────────────────────────────────────────────────────
    {
      id: "hunter.incomplete-customers", agentId: "ag-hunter",
      titleHe: "איתור לקוחות חסרי מידע",
      descriptionHe: "מזהה רשומות לקוח לא שלמות ומצביע על השדות החסרים — פותח תצוגת תוצאות ממוקדת.",
      requiredInputs: [], capability: "identify-missing", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["customers"], resultSchema: RESULT_SCHEMA,
    },
    {
      id: "hunter.missing-contacts", agentId: "ag-hunter",
      titleHe: "איתור אנשי קשר חסרים",
      descriptionHe: "מוצא לקוחות ללא איש קשר ראשי ואנשי קשר עם פרטי דמו חסרים — ללא שינוי אוטומטי.",
      requiredInputs: [], capability: "identify-missing", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["customers", "contacts"], resultSchema: RESULT_SCHEMA,
    },

    // ── Fixer ─────────────────────────────────────────────────────────────
    {
      id: "fixer.propose-correction", agentId: "ag-fixer",
      titleHe: "הצעת תיקון לרשומה",
      descriptionHe: "מפיק הצעת תיקון עם תצוגת לפני/אחרי לרשומת דמו — לעולם אינו משנה בשקט.",
      requiredInputs: [
        { id: "recordId", labelHe: "מזהה רשומת לקוח (דמו)", kind: "recordId", required: true, placeholderHe: "לדוגמה: dc-2" },
      ],
      capability: "draft", riskLevel: "low",
      approvalRequired: false, executionMode: "PROPOSAL_ONLY",
      domains: ["customers"], resultSchema: RESULT_SCHEMA,
    },
    {
      id: "fixer.apply-correction", agentId: "ag-fixer",
      titleHe: "החלת תיקון דמו מאושר",
      descriptionHe: "מחיל תיקון דמו מקומי לאחר אישור אנושי מפורש — חד-פעמי, חסום לכפילויות.",
      requiredInputs: [
        { id: "recordId", labelHe: "מזהה רשומת לקוח (דמו)", kind: "recordId", required: true, placeholderHe: "לדוגמה: dc-2" },
      ],
      capability: "draft", riskLevel: "medium",
      approvalRequired: true, executionMode: "LOCAL_DEMO_MUTATION_WITH_APPROVAL",
      domains: ["customers"], resultSchema: RESULT_SCHEMA,
    },

    // ── Flow ──────────────────────────────────────────────────────────────
    {
      id: "flow.followup-sequence", agentId: "ag-flow",
      titleHe: "יצירת רצף המשך טיפול",
      descriptionHe: "מפיק רצף פולואו-אפ דטרמיניסטי עם שלבים מסודרים ותזמון מומלץ — ללא שליחה בפועל.",
      requiredInputs: [
        { id: "recordId", labelHe: "מזהה לקוח (דמו)", kind: "recordId", required: true, placeholderHe: "לדוגמה: dc-5" },
      ],
      capability: "draft", riskLevel: "low",
      approvalRequired: false, executionMode: "PROPOSAL_ONLY",
      domains: ["customers"], resultSchema: RESULT_SCHEMA,
    },
    {
      id: "flow.automation-proposal", agentId: "ag-flow",
      titleHe: "הצעת אוטומציה מקומית",
      descriptionHe: "בונה תצוגה מקדימה של אוטומציה — נשמרת מקומית רק לאחר אישור, ללא טריגר חיצוני.",
      requiredInputs: [
        { id: "trigger", labelHe: "טריגר", kind: "select", required: true, options: [
          { value: "missing-contact", labelHe: "לקוח ללא איש קשר ראשי" },
          { value: "incomplete-customer", labelHe: "רשומת לקוח לא שלמה" },
        ] },
      ],
      capability: "prepare-automation-plan", riskLevel: "medium",
      approvalRequired: true, executionMode: "LOCAL_DEMO_MUTATION_WITH_APPROVAL",
      domains: ["automations"], resultSchema: RESULT_SCHEMA,
    },

    // ── Mentor ────────────────────────────────────────────────────────────
    {
      id: "mentor.explain-recommendation", agentId: "ag-mentor",
      titleHe: "הסבר המלצה",
      descriptionHe: "מסביר מדוע נוצרה המלצה נבחרת ומצטט את הראיות המקומיות הרלוונטיות.",
      requiredInputs: [
        { id: "recommendationId", labelHe: "המלצה", kind: "select", required: true, options: [
          { value: "rec-1", labelHe: "השלמת פרטי קשר לשני לקוחות" },
          { value: "rec-2", labelHe: "בניית רצף פולואו-אפ ללקוח חדש" },
          { value: "rec-3", labelHe: "תיוג מקטע שוק חסר" },
        ] },
      ],
      capability: "explain", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["aiRecommendations"], resultSchema: RESULT_SCHEMA,
    },
    {
      id: "mentor.improvement-checklist", agentId: "ag-mentor",
      titleHe: "יצירת רשימת שיפור",
      descriptionHe: "מפיק צ'ק-ליסט שיפור קצר ומודרך — משימות דמו עם מעקב השלמה מקומי.",
      requiredInputs: [], capability: "recommend", riskLevel: "low",
      approvalRequired: false, executionMode: "PROPOSAL_ONLY",
      domains: ["customers", "contacts"], resultSchema: RESULT_SCHEMA,
    },

    // ── Nexa ──────────────────────────────────────────────────────────────
    {
      id: "nexa.system-question", agentId: "ag-nexa",
      titleHe: "שאלת מערכת",
      descriptionHe: "עונה על שאלות מהמאגר המקומי בלבד — עם ציון מקור וקישורי ניווט.",
      requiredInputs: [
        { id: "query", labelHe: "השאלה", kind: "text", required: true, placeholderHe: "לדוגמה: היכן מנהלים לידים?" },
      ],
      capability: "explain", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["knowledgeNotes"], resultSchema: RESULT_SCHEMA,
    },
    {
      id: "nexa.navigation-guidance", agentId: "ag-nexa",
      titleHe: "הכוונה לפעולה",
      descriptionHe: "מזהה את המסך או התהליך הנכון לבקשה ומחזיר יעד ניווט בטוח — ללא ביצוע כתיבה.",
      requiredInputs: [
        { id: "query", labelHe: "מה תרצו לעשות?", kind: "text", required: true, placeholderHe: "לדוגמה: להוסיף לקוח" },
      ],
      capability: "explain", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["knowledgeNotes"], resultSchema: RESULT_SCHEMA,
    },

    // ── Wiki ──────────────────────────────────────────────────────────────
    {
      id: "wiki.knowledge-search", agentId: "ag-wiki",
      titleHe: "חיפוש במאגר הידע",
      descriptionHe: "מחפש בערכי הידע המקומיים ומחזיר תוצאות מדורגות עם כותרת מקור וקטגוריה.",
      requiredInputs: [
        { id: "query", labelHe: "מונח חיפוש", kind: "text", required: true, placeholderHe: "לדוגמה: אישור" },
      ],
      capability: "search", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["knowledgeNotes"], resultSchema: RESULT_SCHEMA,
    },
    {
      id: "wiki.summarize-entry", agentId: "ag-wiki",
      titleHe: "סיכום ערך ידע",
      descriptionHe: "מסכם ערך ידע נבחר תוך שמירת ייחוס המקור — ללא המצאת מידע שאינו נתמך.",
      requiredInputs: [
        { id: "entryId", labelHe: "ערך ידע", kind: "select", required: true, options: [
          { value: "kn-1", labelHe: "מדיניות מצב הדגמה" },
          { value: "kn-2", labelHe: "היכן מנהלים לקוחות ולידים" },
          { value: "kn-3", labelHe: "מדיניות אישורים אנושיים" },
          { value: "kn-4", labelHe: "שערי מעבר וראיות" },
        ] },
      ],
      capability: "summarize", riskLevel: "none",
      approvalRequired: false, executionMode: "READ_ONLY_LOCAL",
      domains: ["knowledgeNotes"], resultSchema: RESULT_SCHEMA,
    },
  ].map((a) => Object.freeze({ ...a, requiredInputs: Object.freeze(a.requiredInputs), domains: Object.freeze(a.domains) })) as AgentActionDefinition[],
);

const BY_ID = new Map(AGENT_ACTIONS.map((a) => [a.id, a]));

export function getActionDefinition(actionId: string): AgentActionDefinition | undefined {
  return BY_ID.get(actionId);
}

export function getActionsForAgent(agentId: string): readonly AgentActionDefinition[] {
  return AGENT_ACTIONS.filter((a) => a.agentId === agentId);
}
