// TERAGON AI BUSINESS OS — audit explorer (Wave 8, W8-B).
// Pure filtering/derivation over the canonical auditEvents collection + a
// REDACTED export: every exported string passes the W5-B redact() patterns and
// details are truncated — no secrets, no full payloads, ever.
import type { Approval, AuditEvent, Evidence } from "@/domain/types";
import type { AgentEventRecord } from "@/domain/agents";
import type {
  AuditExport,
  AuditQuery,
  AuditSeverity,
  RedactedAuditEventExport,
} from "@/domain/governance";
import { AGENT_IDS } from "@/agents/definitions";
import { redact } from "@/lib/redact";

/** Max exported detail length — exports carry summaries, never full payloads. */
export const EXPORT_DETAIL_MAX_CHARS = 160;

// ---------------------------------------------------------------------------
// derived (heuristic) severity — documented, never stored
// ---------------------------------------------------------------------------

const HIGH_SEVERITY_MARKERS = ["failed", "rollback", "bypass", "sensitive", "נכשל", "עקיפ"];

/**
 * Heuristic severity: failures/rollbacks/sensitive reveals ⇒ "גבוהה";
 * approval-flow events ⇒ "בינונית"; everything else ⇒ "רגילה".
 */
export function deriveAuditSeverity(event: AuditEvent): AuditSeverity {
  const haystack = `${event.action} ${event.details}`.toLowerCase();
  if (HIGH_SEVERITY_MARKERS.some((m) => haystack.includes(m))) return "גבוהה";
  if (event.action.startsWith("approval.") || event.action.includes("אישור")) return "בינונית";
  return "רגילה";
}

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

export function filterAuditEvents(
  events: readonly AuditEvent[],
  query: AuditQuery,
): AuditEvent[] {
  return events
    .filter((e) => {
      if (query.actor && e.actor !== query.actor) return false;
      if (query.agentId && e.actor !== query.agentId) return false;
      if (query.operation && !e.action.startsWith(query.operation)) return false;
      if (query.entityRef && e.entityRef !== query.entityRef) return false;
      if (query.approvalsOnly && !(e.entityRef ?? "").startsWith("approval:")) return false;
      if (query.severity && deriveAuditSeverity(e) !== query.severity) return false;
      if (query.fromAt && e.at < query.fromAt) return false;
      if (query.toAt && e.at > query.toAt) return false;
      if (query.correlationId && e.correlationId !== query.correlationId) return false;
      if (query.freeText) {
        const needle = query.freeText.toLowerCase();
        const hay = `${e.action} ${e.details} ${e.entityRef ?? ""} ${e.actor}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
}

/** All events sharing the given correlationId, oldest first. */
export function correlationChain(
  events: readonly AuditEvent[],
  correlationId: string,
): AuditEvent[] {
  return events
    .filter((e) => e.correlationId === correlationId)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id.localeCompare(b.id)));
}

// ---------------------------------------------------------------------------
// item detail — actor, affected record, before-after (where permitted),
// evidence, approval, correlation chain
// ---------------------------------------------------------------------------

export interface AuditItemDetail {
  event: AuditEvent;
  severity: AuditSeverity;
  actorKind: "סוכן" | "משתמש" | "מערכת";
  /** the affected record ref (collection:id style), when present */
  affectedRef: string | null;
  /** honest before-after summary derived from persisted inverse payloads; null when unavailable */
  beforeAfterHe: string | null;
  evidence: Evidence[];
  approval: Approval | null;
  chain: AuditEvent[];
}

export function deriveAuditItemDetail(
  event: AuditEvent,
  context: {
    allEvents: readonly AuditEvent[];
    approvals: readonly Approval[];
    evidence: readonly Evidence[];
    agentEvents: readonly AgentEventRecord[];
  },
): AuditItemDetail {
  const actorKind =
    event.actor === "system" || event.actor === "governance-bootstrap"
      ? "מערכת"
      : (AGENT_IDS as readonly string[]).includes(event.actor) || event.actor.startsWith("ag-")
        ? "סוכן"
        : "משתמש";

  const approvalId = event.entityRef?.startsWith("approval:")
    ? event.entityRef.slice("approval:".length)
    : null;
  const approval = approvalId
    ? (context.approvals.find((a) => a.id === approvalId) ?? null)
    : null;

  // before-after: derived ONLY from a persisted ExecutionCompleted inverse
  // (restore-field carries the previous value) — anything else is honestly null
  let beforeAfterHe: string | null = null;
  let affectedRef: string | null = event.entityRef;
  if (approvalId) {
    for (const rec of context.agentEvents) {
      const ev = rec.event;
      if (ev.type === "ExecutionCompleted" && ev.approvalId === approvalId && ev.inverse) {
        if (ev.inverse.kind === "restore-field") {
          affectedRef = `${ev.inverse.collection}:${ev.inverse.recordId}`;
          beforeAfterHe = `השדה "${ev.inverse.field}" — ערך קודם: ${JSON.stringify(ev.inverse.previousValue)}`;
        } else if (ev.inverse.kind === "delete-created") {
          affectedRef = `${ev.inverse.collection}:${ev.inverse.recordId}`;
          beforeAfterHe = "לפני: הרשומה לא הייתה קיימת · אחרי: נוצרה בביצוע המאושר";
        }
      }
    }
  }

  const subjectRefs = new Set<string>();
  if (event.entityRef) subjectRefs.add(event.entityRef);
  if (approval) subjectRefs.add(approval.subjectRef);
  const evidence = context.evidence.filter((e) => subjectRefs.has(e.subjectRef));

  const chain = event.correlationId
    ? correlationChain(context.allEvents, event.correlationId)
    : [];

  return {
    event,
    severity: deriveAuditSeverity(event),
    actorKind,
    affectedRef,
    beforeAfterHe,
    evidence,
    approval,
    chain,
  };
}

// ---------------------------------------------------------------------------
// redacted export
// ---------------------------------------------------------------------------

function redactAndTruncate(text: string): string {
  const clean = redact(text);
  return clean.length > EXPORT_DETAIL_MAX_CHARS
    ? `${clean.slice(0, EXPORT_DETAIL_MAX_CHARS)}…`
    : clean;
}

/**
 * Build the redacted export for the current filter. EVERY string field passes
 * redact(); details are truncated. Full payloads (agentEvents envelopes etc.)
 * are NEVER included — the export carries the audit trail summary only.
 */
export function buildAuditExport(
  events: readonly AuditEvent[],
  query: AuditQuery,
  generatedAt: string,
): AuditExport {
  const matched = filterAuditEvents(events, query);
  const exported: RedactedAuditEventExport[] = matched.map((e) => ({
    id: e.id,
    at: e.at,
    actor: redact(e.actor),
    action: redact(e.action),
    entityRef: e.entityRef === null ? null : redact(e.entityRef),
    correlationId: e.correlationId === null ? null : redact(e.correlationId),
    details: redactAndTruncate(e.details),
  }));
  return {
    generatedAt,
    query,
    totalMatched: matched.length,
    redacted: true,
    events: exported,
  };
}
