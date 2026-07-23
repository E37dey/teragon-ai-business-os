// TERAGON AI BUSINESS OS — structured governance errors (Wave 5, W5-C).
// Same philosophy as AIError (src/ai/contracts/AIProvider.ts): stable code +
// safe Hebrew message, never a stack trace to the user. Limit violations carry
// the exact limit that was hit — no open loops, no silent degradation.

export type AgentErrorCode =
  | "AGENT_PERMISSION_DENIED"
  | "AGENT_LIMIT_EXCEEDED"
  | "AGENT_LOOP_DETECTED"
  | "AGENT_APPROVAL_STATE_INVALID"
  | "AGENT_EXECUTION_WITHOUT_APPROVAL"
  | "AGENT_ROLLBACK_UNSUPPORTED"
  | "AGENT_RUN_NOT_FOUND"
  | "AGENT_BUDGET_EXCEEDED"
  | "AGENT_TIMEOUT"
  | "AGENT_INTERNAL_ERROR";

export const AGENT_ERROR_MESSAGES_HE: Record<AgentErrorCode, string> = {
  AGENT_PERMISSION_DENIED: "לסוכן אין הרשאה לפעולה זו בתחום זה — נדחה כברירת מחדל.",
  AGENT_LIMIT_EXCEEDED: "הריצה חרגה ממגבלה קשיחה של המנוע ולכן נעצרה באופן מובנה.",
  AGENT_LOOP_DETECTED: "זוהתה לולאת העברות בין סוכנים — השרשרת נקטעה במגבלת העומק.",
  AGENT_APPROVAL_STATE_INVALID: "מצב האישור אינו מאפשר את הפעולה המבוקשת.",
  AGENT_EXECUTION_WITHOUT_APPROVAL: "אין נתיב ביצוע ללא רשומת אישור במצב מאושר. הפעולה נחסמה.",
  AGENT_ROLLBACK_UNSUPPORTED: "rollback לא נתמך עבור סוג הפעולה הזה — הוצהר מראש בבקשת האישור.",
  AGENT_RUN_NOT_FOUND: "ריצת הסוכנים המבוקשת לא נמצאה.",
  AGENT_BUDGET_EXCEEDED: "הריצה חרגה מתקציב השימוש שהוגדר ולכן נעצרה.",
  AGENT_TIMEOUT: "הריצה חרגה ממשך הזמן המרבי שהוגדר ולכן נעצרה.",
  AGENT_INTERNAL_ERROR: "אירעה שגיאה פנימית במנוע הסוכנים. הצוות הטכני יקבל דיווח.",
};

export interface LimitViolation {
  /** e.g. "maxSpecialists" | "maxModelCallsPerRun" | "maxRunDurationMs" */
  name: string;
  max: number;
  attempted: number;
}

export class AgentGovernanceError extends Error {
  readonly code: AgentErrorCode;
  readonly userMessageHe: string;
  readonly limit: LimitViolation | null;
  readonly runId: string | null;
  readonly agentId: string | null;

  constructor(
    code: AgentErrorCode,
    options: {
      detail?: string;
      limit?: LimitViolation;
      runId?: string;
      agentId?: string;
    } = {},
  ) {
    super(options.detail ? `${code}: ${options.detail}` : code);
    this.name = "AgentGovernanceError";
    this.code = code;
    this.userMessageHe = AGENT_ERROR_MESSAGES_HE[code];
    this.limit = options.limit ?? null;
    this.runId = options.runId ?? null;
    this.agentId = options.agentId ?? null;
  }
}

export function isAgentGovernanceError(err: unknown): err is AgentGovernanceError {
  return err instanceof AgentGovernanceError;
}
