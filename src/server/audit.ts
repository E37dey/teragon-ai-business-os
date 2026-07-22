// TERAGON AI BUSINESS OS — server-side audit events (Wave 5, W5-B).
//
// AUDIT BOUNDARY (documented): the SERVER emits operational audit events —
// redacted, structured log lines + the event object available to handlers.
// The BROWSER owns the persisted PRODUCT audit records (IndexedDB via the
// canonical repositories); the server is stateless and does not persist.
// The correlationId ties both sides of the boundary together.
import { serverLog, type ServerLogSink } from "./redact";
import type { AIErrorCode } from "./errors";

export interface ServerAuditEvent {
  kind: "ai.request";
  correlationId: string;
  operation: string;
  endpoint: string;
  organizationId: string;
  userId: string;
  /** demo auth ⇒ always false — persisted honestly */
  authTrusted: boolean;
  outcome: "success" | "error";
  errorCode: AIErrorCode | null;
  provider: string | null;
  /** model actually used; null when none — never invented */
  model: string | null;
  durationMs: number;
  /** usage honesty: was provider usage actually measured? */
  usageMeasured: boolean;
  /** prompt-security findings (pattern ids), empty when clean */
  injectionFlags: string[];
  warnings: string[];
  at: string;
}

export function buildAuditEvent(
  fields: Omit<ServerAuditEvent, "kind" | "at">,
  nowMs: number = Date.now(),
): ServerAuditEvent {
  return { kind: "ai.request", at: new Date(nowMs).toISOString(), ...fields };
}

/** Emit through the redacted logger; returns the redacted line (for tests). */
export function emitAudit(event: ServerAuditEvent, sink?: ServerLogSink): string {
  return serverLog(event.outcome === "error" ? "warn" : "info", "ai.audit", { ...event }, sink);
}
