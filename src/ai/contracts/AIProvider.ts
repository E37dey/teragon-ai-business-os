// TERAGON AI BUSINESS OS — canonical AIProvider contract (Wave 5, W5-A).
// Every AI provider (local rules engine, remote server shell, future adapters)
// implements exactly this interface. UI code depends on the contract only —
// never on a concrete provider.
import type { z } from "zod";
import type {
  Activity,
  AIRecommendation,
  Course,
  Customer,
  Enrollment,
  Evidence,
  ISODate,
  Lead,
  LearningPath,
  Meeting,
  PrinterModel,
  Product,
  Quotation,
  ServiceTicket,
  Task,
  User,
} from "@/domain/types";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";

// ---------------------------------------------------------------------------
// stable error codes + Hebrew user messages (no stack traces to the UI, ever)
// ---------------------------------------------------------------------------

export type AIErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_AUTH_FAILED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_DAILY_BUDGET_EXCEEDED"
  | "AI_RESPONSE_INVALID"
  | "AI_EVIDENCE_REQUIRED"
  | "AI_PERMISSION_DENIED"
  | "AI_REQUEST_CANCELLED"
  | "AI_INTERNAL_ERROR";

export const AI_ERROR_CODES: readonly AIErrorCode[] = [
  "AI_PROVIDER_NOT_CONFIGURED",
  "AI_PROVIDER_AUTH_FAILED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_TIMEOUT",
  "AI_RATE_LIMITED",
  "AI_DAILY_BUDGET_EXCEEDED",
  "AI_RESPONSE_INVALID",
  "AI_EVIDENCE_REQUIRED",
  "AI_PERMISSION_DENIED",
  "AI_REQUEST_CANCELLED",
  "AI_INTERNAL_ERROR",
] as const;

/** Precise Hebrew explanation per code — the ONLY text shown to users. */
export const AI_ERROR_MESSAGES_HE: Record<AIErrorCode, string> = {
  AI_PROVIDER_NOT_CONFIGURED:
    "ספק ה-AI טרם הוגדר. יש להגדיר את החיבור בצד השרת — המפתח לעולם אינו נשמר בדפדפן.",
  AI_PROVIDER_AUTH_FAILED: "אימות מול ספק ה-AI נכשל. יש לבדוק את הגדרות המפתח בצד השרת.",
  AI_PROVIDER_UNAVAILABLE: "ספק ה-AI אינו זמין כרגע. ניתן לנסות שוב או לעבור למנוע המקומי.",
  AI_PROVIDER_TIMEOUT: "הבקשה לספק ה-AI חרגה מזמן ההמתנה המוגדר ולכן הופסקה.",
  AI_RATE_LIMITED: "חרגתם מקצב הבקשות המותר. יש להמתין מעט ולנסות שוב.",
  AI_DAILY_BUDGET_EXCEEDED: "תקציב ה-AI היומי מוצה. הבקשות ייחסמו עד לאיפוס התקציב.",
  AI_RESPONSE_INVALID: "תשובת הספק לא עמדה במבנה החוזה ולכן נדחתה. לא הוצג תוכן שגוי.",
  AI_EVIDENCE_REQUIRED: "הפעולה מחייבת ראיות מרשומות אמיתיות ולא נמצאו — הפלט נחסם.",
  AI_PERMISSION_DENIED: "אין לכם הרשאה לבצע פעולת AI זו.",
  AI_REQUEST_CANCELLED: "הבקשה בוטלה לפני שהושלמה.",
  AI_INTERNAL_ERROR: "אירעה שגיאה פנימית במערכת ה-AI. הצוות הטכני יקבל דיווח.",
};

/** Structured AI error — carries a stable code + safe Hebrew message. */
export class AIError extends Error {
  readonly code: AIErrorCode;
  /** true ⇒ the caller may retry / fall back; false ⇒ terminal for this request */
  readonly recoverable: boolean;
  readonly correlationId: string | null;
  /** the user-facing Hebrew message (never a stack trace) */
  readonly userMessageHe: string;

  constructor(
    code: AIErrorCode,
    options: { recoverable?: boolean; correlationId?: string | null; detail?: string } = {},
  ) {
    super(options.detail ? `${code}: ${options.detail}` : code);
    this.name = "AIError";
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.correlationId = options.correlationId ?? null;
    this.userMessageHe = AI_ERROR_MESSAGES_HE[code];
  }
}

export function isAIError(err: unknown): err is AIError {
  return err instanceof AIError;
}

// ---------------------------------------------------------------------------
// provider health + capabilities
// ---------------------------------------------------------------------------

/** Provider connection state — exact Hebrew product values. */
export type AIProviderHealthState =
  | "לא הוגדר"
  | "בודק חיבור"
  | "מחובר"
  | "חיבור מוגבל"
  | "לא זמין"
  | "מגבלת תקציב"
  | "שגיאת אימות"
  | "מושבת";

export interface AIProviderHealth {
  state: AIProviderHealthState;
  checkedAt: ISODate;
  /** short Hebrew explanation of the state (never a stack trace) */
  detail: string;
}

export type AIOperationKind = "summarize" | "classify" | "recommend" | "explain";

export interface AICapabilities {
  operations: AIOperationKind[];
  streaming: boolean;
  structuredOutput: boolean;
  /** hard input limit when known; absent = not declared (never invented) */
  maxInputChars?: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// request
// ---------------------------------------------------------------------------

/**
 * Typed record slices handed to the provider — NEVER free text. The caller
 * selects exactly the records the operation may see (data minimization).
 */
export interface BoundedContext {
  leads?: readonly Lead[];
  customers?: readonly Customer[];
  serviceTickets?: readonly ServiceTicket[];
  quotations?: readonly Quotation[];
  tasks?: readonly Task[];
  meetings?: readonly Meeting[];
  activities?: readonly Activity[];
  courses?: readonly Course[];
  enrollments?: readonly Enrollment[];
  learningPaths?: readonly LearningPath[];
  printerModels?: readonly PrinterModel[];
  products?: readonly Product[];
  users?: readonly User[];
  aiRecommendations?: readonly AIRecommendation[];
  evidence?: readonly Evidence[];
}

/** Scalar operation parameters (e.g. budget, useCase) — typed, not free prose. */
export type AIRequestParams = Readonly<
  Record<string, string | number | boolean | readonly string[]>
>;

export interface AIRelatedEntity {
  /** entity kind, e.g. "lead" | "customer" | "aiRecommendation" */
  type: string;
  id: string;
}

export interface AIRequest {
  /** operation key, e.g. "summarize.weekly-leads" (see AI_ARCHITECTURE.md) */
  operation: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  /** caller-supplied correlation id; providers generate one when absent */
  correlationId?: string;
  relatedEntities: AIRelatedEntity[];
  /** typed record slices — NOT free text */
  boundedContext: BoundedContext;
  /** scalar parameters for the operation */
  params?: AIRequestParams;
  /** version of the output contract the caller expects, e.g. "v1" */
  outputSchemaVersion: string;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// streaming + structured results
// ---------------------------------------------------------------------------

export type AIStreamEvent =
  | { type: "start"; requestId: string; correlationId: string; provider: string }
  | { type: "delta"; text: string }
  | { type: "done"; envelope: AIResponseEnvelopeV2 }
  | { type: "error"; code: AIErrorCode; messageHe: string; recoverable: boolean };

export interface AIProviderResult<T> {
  /** the schema-validated structured value */
  value: T;
  /** the full canonical envelope wrapping the value */
  envelope: AIResponseEnvelopeV2;
}

// ---------------------------------------------------------------------------
// the provider contract
// ---------------------------------------------------------------------------

export interface AIProvider {
  /** stable provider id, e.g. "local-rules" | "remote" */
  readonly id: string;
  /** Hebrew display name, e.g. "מנוע מקומי מבוסס כללים" */
  readonly displayName: string;

  health(): Promise<AIProviderHealth>;
  capabilities(): Promise<AICapabilities>;

  /** token/segment streaming; ends with a "done" (full envelope) or "error" event */
  stream(req: AIRequest): AsyncIterable<AIStreamEvent>;

  /** structured output validated against the caller's zod schema */
  generateStructured<T>(req: AIRequest, schema: z.ZodType<T>): Promise<AIProviderResult<T>>;

  summarize(req: AIRequest): Promise<AIResponseEnvelopeV2>;
  classify(req: AIRequest): Promise<AIResponseEnvelopeV2>;
  recommend(req: AIRequest): Promise<AIResponseEnvelopeV2>;
  explain(req: AIRequest): Promise<AIResponseEnvelopeV2>;
}
