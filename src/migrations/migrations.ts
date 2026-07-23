// W6-E — MIGRATIONS m001-m007 (Phase 6.16, per WAVE_6_DATA_MIGRATION_PLAN.md).
// Each up() is pure and idempotent: existing canonical fields always win, so a
// forced double-run deep-equals a single run. Legacy sources (⟦…⟧ markers /
// localStorage) are preserved — markers move into `legacyMarker`, localStorage
// keys are NOT deleted this wave (rollback path).
import type { AgentEventRecord } from "@/domain/agents";
import type { BaseEntity } from "@/domain/types";
import type {
  ApprovalExtendedState,
  ApprovalX,
  CourseSessionX,
  CustomerPrinterX,
  DocumentX,
  OpportunityX,
  QuotationX,
  ServiceTicketX,
  SupportRequestX,
  TaskWorkState,
  TaskX,
} from "@/integration/domainExtensions";
import { loadLegacyVersions } from "@/integration/quotationVersions";
import { parseMarkers } from "@/modules/tasks/lib";
import { categorize, parseSupport } from "@/modules/support/lib";
import { loadJourneyPositions, stepIndex, type JourneyPositions } from "@/modules/sales/journey";
import type { Migration, MigrationEnv } from "./framework";

// ---------------------------------------------------------------------------
// m001 — Task ⟦…⟧ markers → workState / ownership (+legacyMarker)
// ---------------------------------------------------------------------------

const HAS_MARKER = /⟦/;

function isTaskLike(r: BaseEntity): r is TaskX {
  const t = r as Partial<TaskX>;
  return typeof t.description === "string" && typeof t.status === "string";
}

function derivedWorkState(t: TaskX, markerState: TaskWorkState | null): TaskWorkState {
  if (t.status === "הושלמה" || t.status === "בוטלה") return "הושלם";
  if (markerState) return markerState;
  return t.status === "בתהליך" ? "בביצוע" : "לביצוע";
}

export const m001TaskMarkers: Migration = {
  id: "m001",
  description: "פירוק מרקרי ⟦…⟧ ממשימות → שדות workState/ownership (המקור נשמר ב-legacyMarker)",
  collections: ["tasks"],
  idempotencyKey: "w6e-m001-task-markers",
  up(record) {
    if (!isTaskLike(record)) return null;
    const t = record;
    const hadMarker = HAS_MARKER.test(t.description);
    const parsed = parseMarkers(t.description);
    const next: TaskX = {
      ...t,
      description: parsed.clean,
      workState: t.workState ?? derivedWorkState(t, parsed.state),
      ownership: t.ownership ?? (parsed.shared ? "משותפת" : "אנושית"),
    };
    if (hadMarker && t.legacyMarker === undefined) next.legacyMarker = t.description;
    return next;
  },
};

// ---------------------------------------------------------------------------
// m002 — SupportRequest markers → tier / assigneeId / category / feedback
// ---------------------------------------------------------------------------

function isSupportLike(r: BaseEntity): r is SupportRequestX {
  const s = r as Partial<SupportRequestX>;
  return typeof s.description === "string" && typeof s.subject === "string";
}

export const m002SupportMarkers: Migration = {
  id: "m002",
  description:
    "פירוק מרקרים מפניות תמיכה → tier/assigneeId/category/feedback (המקור נשמר ב-legacyMarker)",
  collections: ["supportRequests"],
  idempotencyKey: "w6e-m002-support-markers",
  up(record) {
    if (!isSupportLike(record)) return null;
    const s = record;
    const hadMarker = HAS_MARKER.test(s.description);
    const parsed = parseSupport(s.description);
    const next: SupportRequestX = {
      ...s,
      description: parsed.clean,
      tier: s.tier ?? parsed.tier,
      assigneeId: s.assigneeId !== undefined ? s.assigneeId : parsed.assigneeId,
      feedback: s.feedback !== undefined ? s.feedback : parsed.feedback,
      category: s.category ?? categorize(s.subject, parsed.clean),
    };
    if (hadMarker && s.legacyMarker === undefined) next.legacyMarker = s.description;
    return next;
  },
};

// ---------------------------------------------------------------------------
// m003 — sales journey localStorage → Opportunity.journeyStepId
// ---------------------------------------------------------------------------

export const m003JourneySteps: Migration = {
  id: "m003",
  description: "מיקום מסע המכירות מ-localStorage → שדה journeyStepId על ההזדמנות",
  collections: ["opportunities"],
  idempotencyKey: "w6e-m003-journey-localstorage",
  prepare(env: MigrationEnv): Promise<JourneyPositions> {
    return Promise.resolve(env.localStorage ? loadJourneyPositions(env.localStorage) : {});
  },
  up(record, prepared) {
    const positions = (prepared ?? {}) as JourneyPositions;
    const o = record as OpportunityX;
    if (o.journeyStepId !== undefined) return o; // already canonical
    const stored = positions[o.id];
    const journeyStepId = stored && stepIndex(stored) !== -1 ? stored : null;
    return { ...o, journeyStepId };
  },
};

// ---------------------------------------------------------------------------
// m004 — quotation version localStorage → Quotation.version
// ---------------------------------------------------------------------------

export const m004QuotationVersions: Migration = {
  id: "m004",
  description: "מונה גרסאות הצעות מחיר מ-localStorage → שדה version על ההצעה",
  collections: ["quotations"],
  idempotencyKey: "w6e-m004-quotation-versions",
  prepare(env: MigrationEnv): Promise<Record<string, number>> {
    return Promise.resolve(loadLegacyVersions(env.localStorage));
  },
  up(record, prepared) {
    const legacy = (prepared ?? {}) as Record<string, number>;
    const q = record as QuotationX;
    if (typeof q.version === "number" && q.version >= 1) return q;
    return { ...q, version: legacy[q.id] ?? 1 };
  },
};

// ---------------------------------------------------------------------------
// m005 — Approval extended state (derived from agentEvents) → persisted field
// ---------------------------------------------------------------------------

const ROLLBACK_MARKER = "rollback:"; // mirrors approvalEngine's private marker

/** Fold the run events into the extended state — same reduction as the engine. */
export function deriveExtendedStates(
  events: readonly AgentEventRecord[],
): Map<string, ApprovalExtendedState> {
  const byApproval = new Map<string, ApprovalExtendedState>();
  const sorted = [...events].sort(
    (a, b) => a.runId.localeCompare(b.runId) || a.seq - b.seq,
  );
  for (const rec of sorted) {
    const e = rec.event;
    if (e.type === "ApprovalRequested") {
      if (!byApproval.has(e.approvalId)) byApproval.set(e.approvalId, "pending");
    } else if (e.type === "ApprovalDecided") {
      byApproval.set(e.approvalId, e.decision);
    } else if (e.type === "ExecutionCompleted") {
      byApproval.set(
        e.approvalId,
        e.detailHe.startsWith(ROLLBACK_MARKER)
          ? "rolled-back"
          : e.outcome === "הצלחה"
            ? "executed"
            : "execution-failed",
      );
    }
  }
  return byApproval;
}

function baseExtendedState(status: string): ApprovalExtendedState {
  switch (status) {
    case "אושר":
      return "approved";
    case "נדחה":
      return "rejected";
    default:
      return "pending";
  }
}

export const m005ApprovalExtendedState: Migration = {
  id: "m005",
  description:
    "מצב Approval מורחב הנגזר מ-agentEvents → שדה extendedState (האירועים נשארים מקור אמת משני)",
  collections: ["approvals"],
  idempotencyKey: "w6e-m005-approval-extended-state",
  async prepare(env: MigrationEnv) {
    const events = await env.stores.collection<AgentEventRecord>("agentEvents").list();
    return deriveExtendedStates(events);
  },
  up(record, prepared) {
    const map = (prepared ?? new Map()) as Map<string, ApprovalExtendedState>;
    const a = record as ApprovalX;
    if (typeof a.status !== "string") return null;
    if (a.extendedState !== undefined) return a;
    return { ...a, extendedState: map.get(a.id) ?? baseExtendedState(a.status) };
  },
};

// ---------------------------------------------------------------------------
// m006 — Nexa purpose alignment (frozen W5-C spec wins over the old seed text)
// ---------------------------------------------------------------------------

/** The frozen definition (src/agents/definitions.ts, NEXA.purposeHe) — canonical. */
export const NEXA_CANONICAL_PURPOSE =
  "מציע קמפיינים וטקסטים לפולואו-אפ על בסיס לידים ופעילות. אינו מפרסם ואינו שולח דבר בעצמו.";

export const NEXA_AGENT_ID = "ag-nexa";

export const m006NexaPurpose: Migration = {
  id: "m006",
  description: "יישור purpose של Nexa לרשומת agents החיה לפי המפרט הקפוא (סוכן שיווק וצמיחה)",
  collections: ["agents"],
  idempotencyKey: "w6e-m006-nexa-purpose",
  async prepare(env: MigrationEnv) {
    const nexa = await env.stores.collection("agents").get(NEXA_AGENT_ID);
    const purpose = (nexa as { purpose?: unknown } | undefined)?.purpose;
    return typeof purpose === "string" ? purpose : null;
  },
  up(record) {
    const a = record as BaseEntity & { name?: unknown; purpose?: unknown };
    if (record.id !== NEXA_AGENT_ID) return record;
    if (typeof a.purpose !== "string") return null;
    if (a.purpose === NEXA_CANONICAL_PURPOSE) return record;
    return { ...record, purpose: NEXA_CANONICAL_PURPOSE };
  },
  auditDetail(prepared) {
    const old = prepared as string | null;
    return old && old !== NEXA_CANONICAL_PURPOSE ? `ערך קודם: "${old}"` : "";
  },
};

// ---------------------------------------------------------------------------
// m007 — additive optional fields with safe defaults (no invented values)
// ---------------------------------------------------------------------------

export const m007AdditiveDefaults: Migration = {
  id: "m007",
  description:
    "שדות אופציונליים חדשים עם ברירות מחדל בטוחות: ServiceTicket.closedAt, Document.customerId, CourseSession.attendance, CustomerPrinter warranty/maintenance",
  collections: ["serviceTickets", "documents", "courseSessions", "customerPrinters"],
  idempotencyKey: "w6e-m007-additive-defaults",
  up(record, _prepared, collection) {
    switch (collection) {
      case "serviceTickets": {
        const t = record as ServiceTicketX;
        if (typeof t.status !== "string") return null;
        if (t.closedAt !== undefined) return t;
        // honest default: closed tickets get their last update time; open ⇒ null
        return { ...t, closedAt: t.status === "נסגר" ? t.updatedAt : null };
      }
      case "documents": {
        const d = record as DocumentX;
        if (d.customerId !== undefined) return d;
        return { ...d, customerId: null };
      }
      case "courseSessions": {
        const s = record as CourseSessionX;
        if (s.attendance !== undefined) return s;
        return { ...s, attendance: [] };
      }
      case "customerPrinters": {
        const p = record as CustomerPrinterX;
        if (
          p.warrantyUntil !== undefined &&
          p.lastMaintenanceAt !== undefined &&
          p.maintenanceIntervalDays !== undefined
        ) {
          return p;
        }
        // honest defaults: unknown stays null — the module policy derivation
        // (12 months / 180 days) remains the documented fallback
        return {
          ...p,
          warrantyUntil: p.warrantyUntil ?? null,
          lastMaintenanceAt: p.lastMaintenanceAt ?? null,
          maintenanceIntervalDays: p.maintenanceIntervalDays ?? null,
        };
      }
      default:
        return record;
    }
  },
};

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

export const ALL_MIGRATIONS: readonly Migration[] = [
  m001TaskMarkers,
  m002SupportMarkers,
  m003JourneySteps,
  m004QuotationVersions,
  m005ApprovalExtendedState,
  m006NexaPurpose,
  m007AdditiveDefaults,
];
