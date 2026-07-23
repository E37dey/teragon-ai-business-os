// TERAGON AI BUSINESS OS — correlation id handling (Wave 5, W5-B).
// The client sends header "x-correlation-id"; the server echoes it into every
// envelope / error body / stream event / audit line. A missing or malformed id
// is replaced by a server-generated one (never blank, never trusted blindly).
import { CORRELATION_ID_HEADER } from "@/ai/contracts/serverDto";

export { CORRELATION_ID_HEADER };

/** conservative shape: 1–128 chars of [A-Za-z0-9._:-] — no header injection */
const CORRELATION_SHAPE = /^[A-Za-z0-9._:-]{1,128}$/u;

export function isValidCorrelationId(value: string | null | undefined): value is string {
  return typeof value === "string" && CORRELATION_SHAPE.test(value);
}

export function generateCorrelationId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `srv-${cryptoObj.randomUUID()}`;
  }
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Resolve the effective correlation id: prefer the request header, fall back
 * to the request body's correlationId, else generate. Malformed values are
 * DISCARDED (they could carry log-injection payloads), never echoed raw.
 */
export function resolveCorrelationId(
  headerValue: string | null,
  bodyValue?: string | undefined,
): string {
  if (isValidCorrelationId(headerValue)) return headerValue;
  if (isValidCorrelationId(bodyValue)) return bodyValue;
  return generateCorrelationId();
}
