// TERAGON AI BUSINESS OS — request guards (Wave 5, W5-B).
// Hard limits enforced BEFORE any provider work: request size, bounded-context
// length, output cap, per-request duration budget. Limits are honest constants
// documented in docs/AI_SERVER_SECURITY.md.
import { ServerAIError } from "./errors";

/** max raw request body size — 256KB */
export const MAX_REQUEST_BYTES = 256 * 1024;

/** max total characters across all serialized boundedContext records */
export const MAX_CONTEXT_CHARS = 120_000;

/** max characters returned in any text output (recommendation/delta stream) */
export const MAX_OUTPUT_CHARS = 40_000;

/**
 * total wall-clock budget per request — kept under Netlify's synchronous
 * function limit so we fail with a typed AI_PROVIDER_TIMEOUT, not a platform 502.
 */
export const MAX_DURATION_MS = 25_000;

/** Throws AI_RESPONSE_INVALID (413) when the raw body exceeds the size cap. */
export function assertRequestSize(rawBody: string): void {
  const bytes = new TextEncoder().encode(rawBody).byteLength;
  if (bytes > MAX_REQUEST_BYTES) {
    throw new ServerAIError("AI_RESPONSE_INVALID", {
      httpStatus: 413,
      recoverable: false,
      detail: `request body ${bytes}B exceeds ${MAX_REQUEST_BYTES}B`,
    });
  }
}

/** Total serialized character length of a bounded context. */
export function contextChars(
  boundedContext: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>,
): number {
  let total = 0;
  for (const records of Object.values(boundedContext)) {
    total += JSON.stringify(records).length;
  }
  return total;
}

/** Throws AI_RESPONSE_INVALID (413) when the bounded context is too large. */
export function assertContextLength(
  boundedContext: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>,
): void {
  const total = contextChars(boundedContext);
  if (total > MAX_CONTEXT_CHARS) {
    throw new ServerAIError("AI_RESPONSE_INVALID", {
      httpStatus: 413,
      recoverable: false,
      detail: `bounded context ${total} chars exceeds ${MAX_CONTEXT_CHARS}`,
    });
  }
}

export interface CappedOutput {
  text: string;
  truncated: boolean;
}

/** Cap output text; truncation is DISCLOSED, never silent. */
export function capOutput(text: string, maxChars: number = MAX_OUTPUT_CHARS): CappedOutput {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

/** Remaining wall-clock budget; ≤0 means the duration budget is exhausted. */
export function remainingDurationMs(
  startedAtMs: number,
  nowMs: number,
  budgetMs: number = MAX_DURATION_MS,
): number {
  return budgetMs - (nowMs - startedAtMs);
}
