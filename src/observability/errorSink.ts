// TERAGON AI BUSINESS OS — Gate S10.0-B: provider-neutral error sink.
// =============================================================================
// The ONE place a sanitized operational event leaves the app. Deliberately
// vendor-free: no Sentry, no SDK, no network client, no package dependency. A
// host wires its own transport via `setErrorReportProvider`; the default is a
// no-op, so the shipped app reports nowhere until someone opts in.
//
// HONESTY / SAFETY CONTRACT — enforced at RUNTIME, not just in the type system:
//   * A STRICT WHITELIST is applied. Only kind/code/domain/route/correlationId/
//     timestamp survive; every other key is dropped, including keys an
//     unsanitized caller may have spread in (message, stack, rows, payload,
//     email, userId, session, headers, token, body…).
//   * Values are coerced to short scalars — an object/array/function can never
//     ride through a whitelisted key.
//   * `reportError` NEVER throws and NEVER rejects. A provider that throws is
//     swallowed: observability must not be able to break the product.
// This is why the sink takes a typed event rather than an Error — an Error's
// message and stack are exactly the fields that leak rows and PII.
import { REDACTED } from "@/lib/redact";

/** What kind of operational event this is. Extend deliberately, never freely. */
export type ErrorEventKind =
  | "render_error" // an unexpected React render/lifecycle failure
  | "domain_read_error"
  | "domain_write_error"
  | "authorization_denied";

/** The ONLY fields allowed to leave the app. */
export interface SafeErrorEvent {
  readonly kind: ErrorEventKind;
  /** A typed, non-free-text code (e.g. "AUTH_REQUIRED", "unauthorized"). */
  readonly code: string;
  /** Domain/collection the event belongs to (e.g. "contacts"). */
  readonly domain?: string;
  /** Route PATH only — never a query string (ids/filters can be personal). */
  readonly route?: string;
  readonly correlationId?: string;
  /** ISO timestamp; filled in by the sink when omitted. */
  readonly timestamp?: string;
}

/** A host-supplied transport. Must be side-effect-safe; may throw — we absorb it. */
export type ErrorReportProvider = (event: Required<SafeErrorEvent>) => void;

/** The shipped default: report nowhere. */
const noopProvider: ErrorReportProvider = () => undefined;

let provider: ErrorReportProvider = noopProvider;

/** Install a transport. Test-only injection uses the same door. */
export function setErrorReportProvider(next: ErrorReportProvider): void {
  provider = typeof next === "function" ? next : noopProvider;
}

/** Restore the no-op default — call in afterEach so tests stay isolated. */
export function resetErrorReportProvider(): void {
  provider = noopProvider;
}

/** The exact key whitelist. Anything absent from this list is DROPPED. */
const ALLOWED_KEYS = ["kind", "code", "domain", "route", "correlationId", "timestamp"] as const;

const MAX_LEN = 120;

/**
 * Coerce to a short, safe scalar. Objects/arrays/functions collapse to REDACTED
 * rather than being serialized — serializing is how payloads and PII escape.
 */
function safeScalar(value: unknown): string {
  if (typeof value === "string") return value.slice(0, MAX_LEN);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return REDACTED;
}

/** Strip a route to its PATH — a query string can carry ids, emails, filters. */
function safeRoute(value: unknown): string {
  const raw = safeScalar(value);
  const cut = raw.split("?")[0]?.split("#")[0] ?? "";
  return cut.slice(0, MAX_LEN);
}

/**
 * Apply the whitelist. Exported so a test can assert the sanitizer directly,
 * without having to observe it through a provider.
 */
export function sanitizeErrorEvent(input: SafeErrorEvent): Required<SafeErrorEvent> {
  // via unknown: callers may legitimately pass an object carrying extra keys —
  // dropping them is the whole point of this function.
  const source = (input ?? {}) as unknown as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    out[key] = key === "route" ? safeRoute(source[key]) : safeScalar(source[key]);
  }
  return {
    kind: (out.kind || "render_error") as ErrorEventKind,
    code: out.code || "unknown",
    domain: out.domain ?? "",
    route: out.route ?? "",
    correlationId: out.correlationId ?? "",
    timestamp: out.timestamp || new Date().toISOString(),
  };
}

/**
 * Report ONE sanitized operational event. Never throws, never rejects.
 * @returns the event actually handed to the provider (useful in tests).
 */
export function reportError(event: SafeErrorEvent): Required<SafeErrorEvent> {
  let sanitized: Required<SafeErrorEvent>;
  try {
    sanitized = sanitizeErrorEvent(event);
  } catch {
    // Sanitizing must not be able to fail the caller either.
    sanitized = {
      kind: "render_error", code: "unknown", domain: "", route: "",
      correlationId: "", timestamp: new Date().toISOString(),
    };
  }
  try {
    provider(sanitized);
  } catch {
    // A failing transport is absorbed on purpose: observability must never be
    // able to break the product it observes.
  }
  return sanitized;
}
