// TERAGON AI BUSINESS OS — derived governance views (Wave 8, W8-B).
// The permission matrix, human-AI boundary map and provider configuration are
// READ-ONLY DERIVATIONS over the frozen AGENT_DEFINITIONS and the honest AI
// provider constants — nothing here is hand-duplicated or persisted, so the
// governance page can never drift from the real enforcement layer.
import { AGENT_DEFINITIONS, AGENT_IDS } from "@/agents/definitions";
import {
  APPROVAL_ACTION_LABELS_HE,
  APPROVAL_REQUIRED_ACTIONS,
  AUTONOMOUS_OPERATIONS,
} from "@/domain/agents";
import type { Agent } from "@/domain/types";
import type {
  AgentPermissionView,
  ModelConfigurationRecord,
  ProviderConfigurationState,
  ToolPermissionView,
} from "@/domain/governance";
import {
  LOCAL_OPERATIONS,
  LOCAL_RULES_DISPLAY_NAME,
  LOCAL_RULES_PROVIDER_ID,
} from "@/ai/providers/LocalRulesProvider";
import { REMOTE_PROVIDER_DISPLAY_NAME, REMOTE_PROVIDER_ID } from "@/ai/providers/RemoteAIProvider";

// ---------------------------------------------------------------------------
// agent permission matrix — DERIVED from the frozen definitions
// ---------------------------------------------------------------------------

/**
 * Build the permission matrix. Every field is read straight off the frozen
 * definition; the only external input is the live agents collection, used
 * SOLELY for the runtime (emergency-stop) status.
 */
export function derivePermissionMatrix(agents: readonly Agent[]): AgentPermissionView[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  return AGENT_IDS.map((id) => {
    const def = AGENT_DEFINITIONS[id];
    if (!def) throw new Error(`הגדרת סוכן חסרה: ${id}`);
    return {
      agentId: def.id,
      nameHe: def.nameHe,
      codeName: def.codeName,
      operations: def.allowedOperations,
      allowedDomains: def.allowedDomains,
      prohibitedDomains: def.prohibitedDomains,
      prohibitedActionsHe: def.prohibitedActionsHe,
      tools: def.tools,
      providerPolicy: def.providerPolicy,
      maxExecutionMs: def.maxExecutionMs,
      maxUsageBudgetILS: def.maxUsageBudgetILS,
      maxTaskDepth: def.maxTaskDepth,
      maxHandoffs: def.maxHandoffs,
      approvalRequiredFor: def.approvalRequiredFor,
      promptVersion: def.promptVersion,
      runtimeStatus: byId.get(def.id)?.status ?? null,
    } satisfies AgentPermissionView;
  });
}

/** Tool-centric inversion of the matrix. */
export function deriveToolPermissions(): ToolPermissionView[] {
  const byTool = new Map<string, string[]>();
  for (const id of AGENT_IDS) {
    const def = AGENT_DEFINITIONS[id];
    if (!def) continue;
    for (const tool of def.tools) {
      const list = byTool.get(tool) ?? [];
      list.push(def.id);
      byTool.set(tool, list);
    }
  }
  return [...byTool.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tool, agentIds]) => ({ tool, agentIds }));
}

// ---------------------------------------------------------------------------
// human-AI boundaries — the 4 operation categories, DERIVED from the
// governance constants (never hardcoded prose)
// ---------------------------------------------------------------------------

export interface BoundaryCategory {
  key: "autonomous" | "approval-required" | "prohibited" | "human-only";
  titleHe: string;
  descriptionHe: string;
  /** the real derived items (operation names / Hebrew action labels) */
  items: readonly string[];
  sourceRef: string;
}

/**
 * The 4 boundary categories:
 * 1. autonomous          — AUTONOMOUS_OPERATIONS (read/draft only)
 * 2. approval-required   — the canonical 12 APPROVAL_REQUIRED_ACTIONS
 * 3. prohibited          — union of every definition's prohibitedActionsHe
 * 4. human-only          — decisions the system reserves for named humans
 *    (approval decisions, permission changes, policy activation, rollbacks) —
 *    derived from the approval engine + definitions contract.
 */
export function deriveBoundaryCategories(): BoundaryCategory[] {
  const prohibited = new Set<string>();
  for (const id of AGENT_IDS) {
    const def = AGENT_DEFINITIONS[id];
    for (const action of def?.prohibitedActionsHe ?? []) prohibited.add(action);
  }
  return [
    {
      key: "autonomous",
      titleHe: "אוטונומי — קריאה וטיוטה בלבד",
      descriptionHe: "פעולות שסוכן רשאי לבצע ללא אישור — אף אחת מהן אינה משנה נתונים או יוצאת מהמערכת.",
      items: AUTONOMOUS_OPERATIONS,
      sourceRef: "src/domain/agents/types.ts#AUTONOMOUS_OPERATIONS",
    },
    {
      key: "approval-required",
      titleHe: "טעון אישור אנושי — 12 הפעולות הקנוניות",
      descriptionHe: "כל פעולה משנה/יוצאת עוברת דרך מנוע האישורים — אין נתיב ביצוע ללא רשומת Approval.",
      items: APPROVAL_REQUIRED_ACTIONS.map((a) => APPROVAL_ACTION_LABELS_HE[a]),
      sourceRef: "src/domain/agents/types.ts#APPROVAL_REQUIRED_ACTIONS",
    },
    {
      key: "prohibited",
      titleHe: "אסור לסוכנים — בשום מצב",
      descriptionHe: "איסורים קשיחים מתוך הגדרות הסוכנים הקפואות — deny-by-default.",
      items: [...prohibited].sort((a, b) => a.localeCompare(b)),
      sourceRef: "src/agents/definitions.ts#prohibitedActionsHe",
    },
    {
      key: "human-only",
      titleHe: "אנושי בלבד — סמכויות שמורות",
      descriptionHe:
        "החלטות שהמערכת שומרת לבני אדם בשם: הכרעת אישורים, שינוי הרשאות, הפעלת מדיניות, ביטול כללים (rollback) והכרעת קונפליקטים.",
      items: [
        "הכרעת בקשת אישור (אישור / עריכה / דחייה)",
        APPROVAL_ACTION_LABELS_HE["permission-change"],
        "הפעלת מדיניות ממשל (אישור בשם)",
        "ביטול כלל למידה (rollback)",
        "הכרעת קונפליקט בין סוכנים",
      ],
      sourceRef: "src/agents/approvalEngine.ts + docs/AGENT_GOVERNANCE.md",
    },
  ];
}

// ---------------------------------------------------------------------------
// provider / model configuration — HONEST derived state (Mode A)
// ---------------------------------------------------------------------------

/** מקומי פעיל, מרוחק מושבת — derived from the real provider constants. */
export function deriveProviderConfiguration(): ProviderConfigurationState[] {
  return [
    {
      providerId: LOCAL_RULES_PROVIDER_ID,
      displayNameHe: LOCAL_RULES_DISPLAY_NAME,
      kind: "מקומי",
      enabled: true,
      statusHe: "פעיל",
      model: null, // the rules engine NEVER pretends to be a model
      operations: LOCAL_OPERATIONS,
      noteHe: "מנוע הכללים המקומי הוא הספק הראשי במצב A — model:null, usage.measured:false",
    },
    {
      providerId: REMOTE_PROVIDER_ID,
      displayNameHe: REMOTE_PROVIDER_DISPLAY_NAME,
      kind: "מרוחק",
      enabled: false,
      statusHe: "מושבת",
      model: null, // the model name lives server-side only — never in the client
      operations: [],
      noteHe: "הספק המרוחק מושבת (remoteEnabled=false). שם המודל לעולם אינו נשמר בצד הלקוח.",
    },
  ];
}

/** Flat model-configuration rows for the UI (derived, with source refs). */
export function deriveModelConfiguration(): ModelConfigurationRecord[] {
  return [
    {
      key: "mode",
      labelHe: "מצב הפעלה",
      valueHe: "מצב A — מנוע מקומי מבוסס כללים",
      sourceRef: "src/ai/providers/registry.ts#RegistryConfig",
    },
    {
      key: "remote-enabled",
      labelHe: "ספק מרוחק",
      valueHe: "מושבת",
      sourceRef: "src/ai/providers/registry.ts#remoteEnabled",
    },
    {
      key: "budget",
      labelHe: "תקציב שימוש לסוכנים",
      valueHe: "0 ₪ — אין הוצאה מותרת",
      sourceRef: "src/agents/definitions.ts#maxUsageBudgetILS",
    },
    {
      key: "model-name",
      labelHe: "שם מודל בצד הלקוח",
      valueHe: "לא נשמר — מגיע מהשרת בלבד בתוך המעטפת",
      sourceRef: "src/ai/providers/RemoteAIProvider.ts",
    },
  ];
}
