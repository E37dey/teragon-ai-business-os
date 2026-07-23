// TERAGON AI BUSINESS OS — conflict detection + resolution (Wave 5, W5-C).
// Detection runs over specialist envelopes (deterministic — no model):
// 1. The demo rule: Hunter recommends printer X while an OPEN service ticket
//    exists for X ⇒ Fixer flags repeated-support-risk on X.
// 2. Generic claim-contradiction: two envelopes cite the same record with
//    opposing stances (recommendation vs. risk wording).
// The orchestrator NEVER silently picks a side — every detected conflict
// forces the run through the human approval gate.
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import type { AgentConflict, ServiceTicket } from "@/domain/types";
import type { ConflictDetail } from "@/domain/agents";
import type { AgentStores } from "@/repositories/agentStores";
import { AgentGovernanceError } from "./errors";
import { appendEvent, writeAudit, type Clock } from "./runlog";

// ---------------------------------------------------------------------------
// detection
// ---------------------------------------------------------------------------

export interface SpecialistOutput {
  taskId: string;
  agentId: string;
  envelope: AIResponseEnvelopeV2;
}

export interface DetectedConflict {
  /** the task the conflict is anchored on (Hunter's task for the demo rule) */
  taskId: string;
  descriptionHe: string;
  detail: ConflictDetail;
}

/** Ticket statuses that count as still-open support load. */
const OPEN_TICKET_STATUSES: ReadonlySet<string> = new Set([
  "חדש",
  "בבדיקה",
  "ממתין ללקוח",
  "ממתין לחלק",
]);

const RISK_MARKERS = /סיכון|תקלה|אזהרה|בעיה|כשל|לא מומלץ/;
const RECOMMEND_MARKERS = /מומלץ|המלצה|ההתאמה|מתאימ/;

/** Extract "דגם: X" evidence titles → model names cited by an envelope. */
function citedModelNames(envelope: AIResponseEnvelopeV2): { name: string; sourceId: string }[] {
  const out: { name: string; sourceId: string }[] = [];
  for (const ev of envelope.evidence) {
    const m = /^דגם: (.+)$/.exec(ev.title);
    if (m?.[1]) out.push({ name: m[1], sourceId: ev.sourceId });
  }
  return out;
}

/**
 * Deterministic detection. Pure: same inputs ⇒ same conflicts.
 * Returns conflicts in a stable order (by anchoring task id).
 */
export function detectConflicts(
  outputs: readonly SpecialistOutput[],
  context: { serviceTickets: readonly ServiceTicket[] },
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  // --- rule 1: Hunter printer recommendation vs. open support tickets (Fixer) ---
  const hunter = outputs.find(
    (o) => o.agentId === "ag-hunter" && o.envelope.operation === "recommend.printer-match",
  );
  const fixer = outputs.find((o) => o.agentId === "ag-fixer");
  if (hunter && fixer) {
    const models = citedModelNames(hunter.envelope);
    const top = models[0];
    if (top) {
      const openTickets = context.serviceTickets
        .filter((t) => t.printer === top.name && OPEN_TICKET_STATUSES.has(t.status))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (openTickets.length > 0) {
        const ticketIds = openTickets.map((t) => t.id);
        conflicts.push({
          taskId: hunter.taskId,
          descriptionHe:
            `Hunter ממליץ על ${top.name} בעוד Fixer מסמן סיכון תמיכה: ` +
            `${openTickets.length} קריאות שירות פתוחות על דגם זה (${ticketIds.join(", ")}).`,
          detail: {
            participants: [hunter.agentId, fixer.agentId],
            claims: [
              {
                agentId: hunter.agentId,
                claimHe: `הדגם ${top.name} הוא ההתאמה המובילה לצורכי הלקוח`,
                evidenceRefs: [top.sourceId],
              },
              {
                agentId: fixer.agentId,
                claimHe: `לדגם ${top.name} קריאות שירות פתוחות — סיכון תמיכה חוזר`,
                evidenceRefs: ticketIds,
              },
            ],
            missingEvidenceHe: [
              "שיעור תקלות ביחס לכמות היחידות שנמכרו מדגם זה — לא נמדד",
              "האם התקלות הפתוחות נגרמו מפגם בדגם או משימוש שגוי — טרם אובחן",
            ],
            severity: "בינונית",
            suggestedResolutionPathHe:
              "להציג ללקוח את ההמלצה יחד עם גילוי נאות על עומס התמיכה, או לבקש חלופה מ-Hunter",
            humanDecisionState: "ממתין להחלטה",
          },
        });
      }
    }
  }

  // --- rule 2: generic claim contradiction over a shared record ---
  for (let i = 0; i < outputs.length; i += 1) {
    for (let j = i + 1; j < outputs.length; j += 1) {
      const a = outputs[i];
      const b = outputs[j];
      if (!a || !b || a.agentId === b.agentId) continue;
      // skip pairs already covered by rule 1
      if (
        conflicts.some(
          (c) =>
            c.detail.participants.includes(a.agentId) && c.detail.participants.includes(b.agentId),
        )
      ) {
        continue;
      }
      const aSources = new Set(a.envelope.evidence.map((e) => e.sourceId));
      const shared = b.envelope.evidence.map((e) => e.sourceId).filter((id) => aSources.has(id));
      if (shared.length === 0) continue;
      const aText = `${a.envelope.recommendation} ${a.envelope.reason}`;
      const bText = `${b.envelope.recommendation} ${b.envelope.reason}`;
      const opposing =
        (RECOMMEND_MARKERS.test(aText) && RISK_MARKERS.test(bText)) ||
        (RECOMMEND_MARKERS.test(bText) && RISK_MARKERS.test(aText));
      if (!opposing) continue;
      const first = shared[0] as string;
      conflicts.push({
        taskId: a.taskId,
        descriptionHe: `טענות סותרות של ${a.agentId} ו-${b.agentId} על אותה רשומה (${first}).`,
        detail: {
          participants: [a.agentId, b.agentId],
          claims: [
            { agentId: a.agentId, claimHe: a.envelope.recommendation, evidenceRefs: [...shared] },
            { agentId: b.agentId, claimHe: b.envelope.recommendation, evidenceRefs: [...shared] },
          ],
          missingEvidenceHe: ["ראיה מכרעת המיישבת בין שתי הטענות — לא נמצאה ברשומות"],
          severity: "בינונית",
          suggestedResolutionPathHe: "העברה להכרעה אנושית עם שתי הטענות והראיות של כל צד",
          humanDecisionState: "ממתין להחלטה",
        },
      });
    }
  }

  return conflicts.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

// ---------------------------------------------------------------------------
// resolution — the 5 human actions (each audited, each an engine function)
// ---------------------------------------------------------------------------

export type ConflictResolutionAction =
  | "בקש ראיות נוספות"
  | "בקש חלופה"
  | "העבר למומחה אנושי"
  | "אשר חריגה"
  | "דחה את ההמלצה";

export const CONFLICT_RESOLUTION_ACTIONS: readonly ConflictResolutionAction[] = [
  "בקש ראיות נוספות",
  "בקש חלופה",
  "העבר למומחה אנושי",
  "אשר חריגה",
  "דחה את ההמלצה",
] as const;

export interface ResolveConflictInput {
  runId: string;
  conflictId: string;
  action: ConflictResolutionAction;
  resolvedById: string;
  noteHe?: string;
}

/**
 * Apply one of the 5 resolution actions to a persisted conflict.
 * Updates the AgentConflict record, appends a ConflictResolved event and
 * writes an AuditEvent. Throws structured errors — never silent.
 */
export async function resolveConflict(
  stores: AgentStores,
  clock: Clock,
  input: ResolveConflictInput,
): Promise<AgentConflict> {
  if (!CONFLICT_RESOLUTION_ACTIONS.includes(input.action)) {
    throw new AgentGovernanceError("AGENT_INTERNAL_ERROR", {
      detail: `פעולת הכרעה לא מוכרת: "${input.action}"`,
      runId: input.runId,
    });
  }
  const conflict = await stores.conflicts.get(input.conflictId);
  if (!conflict) {
    throw new AgentGovernanceError("AGENT_RUN_NOT_FOUND", {
      detail: `קונפליקט "${input.conflictId}" לא נמצא`,
      runId: input.runId,
    });
  }
  if (conflict.resolution !== null) {
    throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
      detail: `הקונפליקט "${input.conflictId}" כבר הוכרע ("${conflict.resolution}")`,
      runId: input.runId,
    });
  }
  const note = input.noteHe ?? "";
  const resolvedAt = clock();
  const updated = await stores.conflicts.update(input.conflictId, {
    resolution: note ? `${input.action} — ${note}` : input.action,
    resolvedById: input.resolvedById,
    resolvedAt,
    updatedAt: resolvedAt,
  });
  await appendEvent(stores, input.runId, clock, input.resolvedById, {
    type: "ConflictResolved",
    conflictId: input.conflictId,
    action: input.action,
    resolvedById: input.resolvedById,
    noteHe: note,
  });
  await writeAudit(stores, input.runId, clock, {
    actor: input.resolvedById,
    action: "conflict.resolve",
    entityRef: `agent-conflict:${input.conflictId}`,
    detailsHe: `הכרעת קונפליקט: ${input.action}${note ? ` — ${note}` : ""}`,
  });
  return updated;
}
