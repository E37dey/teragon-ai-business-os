// TERAGON AI BUSINESS OS — server error mapping (Wave 5, W5-B).
// EVERYTHING that can go wrong maps to one of the 11 stable AIErrorCodes with
// its Hebrew user message. The server NEVER returns a stack trace or a raw
// provider error body; correlationId is echoed on every error.
//
// DOCUMENTED DECISION — invalid client request: DTO v1 enumerates exactly 11
// codes and has no dedicated "invalid request" code. Request-shape violations
// (bad JSON, DTO validation failure, oversized body) are returned as
// AI_RESPONSE_INVALID with an HTTP 4xx status and recoverable=false. A correct
// client (RemoteAIProvider zod-validates before sending) never triggers this
// path; it exists for broken/hostile callers. See docs/AI_SERVER_SECURITY.md.
import { AI_ERROR_MESSAGES_HE, type AIErrorCode } from "@/ai/contracts/AIProvider";
import { AI_DTO_VERSION, type AiErrorResponseDtoV1 } from "@/ai/contracts/serverDto";

export type { AIErrorCode };
export { AI_ERROR_MESSAGES_HE };

/** default HTTP status per code (call sites may override, e.g. 400 vs 502) */
export const HTTP_STATUS_BY_CODE: Record<AIErrorCode, number> = {
  AI_PROVIDER_NOT_CONFIGURED: 503,
  AI_PROVIDER_AUTH_FAILED: 502,
  AI_PROVIDER_UNAVAILABLE: 502,
  AI_PROVIDER_TIMEOUT: 504,
  AI_RATE_LIMITED: 429,
  AI_DAILY_BUDGET_EXCEEDED: 429,
  AI_RESPONSE_INVALID: 502,
  AI_EVIDENCE_REQUIRED: 422,
  AI_PERMISSION_DENIED: 403,
  AI_REQUEST_CANCELLED: 499,
  AI_INTERNAL_ERROR: 500,
};

/** default recoverable flag per code (contract semantics; sites may override) */
export const RECOVERABLE_BY_CODE: Record<AIErrorCode, boolean> = {
  AI_PROVIDER_NOT_CONFIGURED: false,
  AI_PROVIDER_AUTH_FAILED: false,
  AI_PROVIDER_UNAVAILABLE: true,
  AI_PROVIDER_TIMEOUT: true,
  AI_RATE_LIMITED: true,
  AI_DAILY_BUDGET_EXCEEDED: false,
  AI_RESPONSE_INVALID: true,
  AI_EVIDENCE_REQUIRED: false,
  AI_PERMISSION_DENIED: false,
  AI_REQUEST_CANCELLED: false,
  AI_INTERNAL_ERROR: false,
};

/** transient codes — the ONLY ones the limited-retry policy may retry */
export const TRANSIENT_CODES: ReadonlySet<AIErrorCode> = new Set<AIErrorCode>([
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_TIMEOUT",
]);

export interface ServerAIErrorOptions {
  recoverable?: boolean;
  httpStatus?: number;
  /** internal-only detail — logged (redacted), NEVER sent to the client */
  detail?: string;
  /** transient errors are eligible for the limited retry policy */
  transient?: boolean;
}

/** Typed server-side error carrying a stable code. Safe to map to a response. */
export class ServerAIError extends Error {
  readonly code: AIErrorCode;
  readonly recoverable: boolean;
  readonly httpStatus: number;
  readonly transient: boolean;

  constructor(code: AIErrorCode, options: ServerAIErrorOptions = {}) {
    super(options.detail ? `${code}: ${options.detail}` : code);
    this.name = "ServerAIError";
    this.code = code;
    this.recoverable = options.recoverable ?? RECOVERABLE_BY_CODE[code];
    this.httpStatus = options.httpStatus ?? HTTP_STATUS_BY_CODE[code];
    this.transient = options.transient ?? TRANSIENT_CODES.has(code);
  }
}

export function isServerAIError(err: unknown): err is ServerAIError {
  return err instanceof ServerAIError;
}

/** Map ANY thrown value to a ServerAIError. Unknown ⇒ AI_INTERNAL_ERROR. */
export function toServerAIError(err: unknown): ServerAIError {
  if (isServerAIError(err)) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ServerAIError("AI_REQUEST_CANCELLED");
  }
  if (err instanceof Error && err.name === "AbortError") {
    return new ServerAIError("AI_REQUEST_CANCELLED");
  }
  const detail = err instanceof Error ? err.message : String(err);
  return new ServerAIError("AI_INTERNAL_ERROR", { detail });
}

/** The ONLY error body shape the server returns — DTO v1, no stack traces. */
export function errorResponseBody(
  code: AIErrorCode,
  correlationId: string,
  recoverable?: boolean,
): AiErrorResponseDtoV1 {
  return {
    dtoVersion: AI_DTO_VERSION,
    error: {
      code,
      messageHe: AI_ERROR_MESSAGES_HE[code],
      correlationId,
      recoverable: recoverable ?? RECOVERABLE_BY_CODE[code],
    },
  };
}
