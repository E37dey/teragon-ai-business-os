// W6-E — service → memory/knowledge DRAFT hooks (Phase 6.18 data side).
// PURE draft-producing functions ONLY: a completed repair yields a
// MemoryProposal draft object; a recurring issue yields a KnowledgeQuestion
// draft. Every draft REQUIRES the canonical approval flow — nothing here
// auto-approves, persists, or touches a repository (tested). The parallel
// memory/knowledge workstreams own the concrete collection records; these
// drafts carry their data in a stable, defensively-consumable shape.
import type { RepairAction, ServiceTicket } from "@/domain/types";
import type { RecurringIssue } from "@/modules/support/lib";

/** Every W6-E draft is born pending — the ONLY path onward is human approval. */
export const DRAFT_STATUS = "ממתין לאישור" as const;

export interface DraftEvidenceRef {
  sourceType: "entity";
  sourceRef: string;
  claim: string;
}

interface DraftBase {
  status: typeof DRAFT_STATUS;
  approvalRequired: true;
  /** honest provenance: which hook produced the draft */
  producedBy: string;
}

export interface MemoryProposalDraft extends DraftBase {
  kind: "memory-proposal";
  layer: "customer" | "service";
  title: string;
  markdownDraft: string;
  customerId: string | null;
  sourceRef: string;
  evidence: DraftEvidenceRef[];
}

export interface KnowledgeQuestionDraft extends DraftBase {
  kind: "knowledge-question";
  question: string;
  category: string;
  sourceRefs: string[];
  occurrences: number;
}

/** Ticket states that count as a completed repair. */
const COMPLETED_TICKET: ReadonlySet<string> = new Set(["טופל", "נסגר"]);

/**
 * Completed repair → MemoryProposal DRAFT (null when the ticket is not done
 * or nothing was actually recorded — no invented memories).
 */
export function proposalFromCompletedRepair(
  ticket: ServiceTicket,
  actions: readonly RepairAction[],
): MemoryProposalDraft | null {
  if (!COMPLETED_TICKET.has(ticket.status)) return null;
  const mine = actions
    .filter((a) => a.ticketId === ticket.id)
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.id.localeCompare(b.id));
  if (mine.length === 0 && ticket.solution.trim().length === 0) return null;
  const lines = [
    `# תיקון שהושלם — ${ticket.printer}`,
    "",
    `תקלה: ${ticket.issue}`,
    ticket.solution.trim().length > 0 ? `פתרון: ${ticket.solution.trim()}` : null,
    mine.length > 0 ? "" : null,
    ...mine.map((a) => `- ${a.performedAt.slice(0, 10)}: ${a.description}`),
  ].filter((l): l is string => l !== null);
  return {
    kind: "memory-proposal",
    status: DRAFT_STATUS,
    approvalRequired: true,
    producedBy: "serviceMemoryHooks.proposalFromCompletedRepair",
    layer: ticket.customerId ? "customer" : "service",
    title: `לקח משירות: ${ticket.issue} (${ticket.printer})`,
    markdownDraft: lines.join("\n"),
    customerId: ticket.customerId,
    sourceRef: `serviceTicket:${ticket.id}`,
    evidence: [
      {
        sourceType: "entity",
        sourceRef: `serviceTicket:${ticket.id}`,
        claim: `קריאת שירות בסטטוס "${ticket.status}" עם ${mine.length} פעולות תיקון מתועדות`,
      },
      ...mine.slice(0, 3).map((a) => ({
        sourceType: "entity" as const,
        sourceRef: `repairAction:${a.id}`,
        claim: a.description,
      })),
    ],
  };
}

/**
 * Recurring support issue → KnowledgeQuestion DRAFT for the knowledge desk.
 * Uses the deterministic recurring-issue detection of the support module.
 */
export function questionFromRecurringIssue(issue: RecurringIssue): KnowledgeQuestionDraft {
  return {
    kind: "knowledge-question",
    status: DRAFT_STATUS,
    approvalRequired: true,
    producedBy: "serviceMemoryHooks.questionFromRecurringIssue",
    question: `הקטגוריה «${issue.category}» חזרה ${issue.count} פעמים בתקופה האחרונה — האם קיימת רשומת ידע קבועה שתסגור את הפער?`,
    category: issue.category,
    sourceRefs: issue.requestIds.map((id) => `supportRequest:${id}`),
    occurrences: issue.count,
  };
}

/**
 * Draft-only guard: throws when a draft was tampered into an auto-approved
 * shape. Consumers MUST call this before handing a draft to any workflow.
 */
export function assertDraftOnly(draft: DraftBase): void {
  if (draft.status !== DRAFT_STATUS || draft.approvalRequired !== true) {
    throw new Error(
      "W6-E draft contract violated: כל טיוטה חייבת להיוולד במצב 'ממתין לאישור' עם approvalRequired=true — אין אישור אוטומטי",
    );
  }
}
