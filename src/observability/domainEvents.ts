// TERAGON AI BUSINESS OS — Gate S10.0-C: domain failure observability.
// =============================================================================
// The ONE place a failed domain read/write becomes a sanitized event. Everything
// still routes through `reportError`, so the S10.0-B whitelist (kind, code,
// domain, route, correlationId, timestamp) remains the only thing that can leave
// the app — no payloads, ids, names, emails or error messages.
//
// FAILURES ONLY. Success is never reported: a success event would be a
// per-row-volume signal that tells an observer what a tenant is reading.
import { DomainCompositionError } from "@/persistence/composition/domainComposition";
import { DomainReadError } from "@/app/data/useDomainCollection";
import { reportError, type ErrorEventKind } from "./errorSink";

/** Access REFUSALS. Everything else is a plain failure (see classify below). */
const DENIAL_CODES = new Set(["unauthorized", "AUTH_REQUIRED", "PROVIDER_BYPASS_FORBIDDEN"]);

/**
 * One id per ACTUAL operation — never derived from user or entity data, so it
 * can never become a tracking identifier. `crypto.randomUUID` when available;
 * otherwise a random, non-identifying fallback.
 */
export function newCorrelationId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the fallback */
  }
  return `cid-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** The typed code an error carries — never its message. */
function codeOf(error: unknown): string {
  if (error instanceof DomainReadError) return String(error.safe?.code ?? "unknown");
  if (error instanceof DomainCompositionError) return String(error.code ?? "unknown");
  const maybe = (error ?? {}) as { code?: unknown };
  return typeof maybe.code === "string" ? maybe.code : "unknown";
}

/** Current route PATH only — `reportError` strips a query string as well. */
function routeOf(): string {
  return typeof window !== "undefined" ? window.location.pathname : "";
}

/**
 * Report ONE sanitized failure event.
 * @param operation "read" or "write" — selects the event family.
 * @param collection domain/collection name (e.g. "contacts").
 * @param error the thrown/returned error — used ONLY to read its typed code.
 * @param correlationId the id of the operation that failed.
 */
export function reportDomainFailure(
  operation: "read" | "write",
  collection: string,
  error: unknown,
  correlationId: string,
): void {
  const code = codeOf(error);
  const denied = DENIAL_CODES.has(code);
  const kind: ErrorEventKind =
    operation === "read"
      ? denied ? "domain_read_denied" : "domain_read_failed"
      : denied ? "domain_write_denied" : "domain_write_failed";
  reportError({ kind, code, domain: collection, route: routeOf(), correlationId });
}

/** Same classification for a repository SafeError code (mutation seams). */
export function reportSafeCodeFailure(
  operation: "read" | "write",
  collection: string,
  code: string,
  correlationId: string,
): void {
  const denied = DENIAL_CODES.has(code);
  const kind: ErrorEventKind =
    operation === "read"
      ? denied ? "domain_read_denied" : "domain_read_failed"
      : denied ? "domain_write_denied" : "domain_write_failed";
  reportError({ kind, code, domain: collection, route: routeOf(), correlationId });
}
