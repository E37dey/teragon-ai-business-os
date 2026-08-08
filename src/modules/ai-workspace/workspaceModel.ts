// S13.3 — AI Workspace composition (PRESENTATION/ORCHESTRATION ONLY).
// This module DOES NOT implement any AI logic. It composes the existing
// deterministic Agent Action Engine (src/agents/actions) — same registry, same
// runAgentAction, same result schema, same approval gate — into the four
// Workspace questions: what needs attention · which agent helps · what did agents
// find · what needs approval. Every number derives from real local demo state
// produced by read-only deterministic actions. No remote model, no new engine.
import {
  runAgentAction,
  AGENT_ACTIONS,
  type AgentActionResult,
  type FindingSeverity,
} from "@/agents/actions";
import { AGENT_IDS, getAgentDefinition } from "@/agents/definitions";

/** One prioritized attention row derived from real agent findings. */
export interface AttentionItem {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly titleHe: string;
  readonly sourceAgentId: string;
  readonly sourceAgentHe: string;
  readonly evidenceCount: number;
  readonly recommendedActionHe: string;
  readonly navigationTarget: string;
  readonly recordId?: string;
  /** user-triggered handoff target (never auto-executed) */
  readonly handoffAgentId?: string;
  readonly handoffInputs?: Readonly<Record<string, string>>;
}

/** One approval-gated proposal derived from a real incomplete demo record. */
export interface ApprovalCandidate {
  readonly recordId: string;
  readonly customerNameHe: string;
  /** the fixer.propose-correction result (before/after, why, evidence) */
  readonly proposal: AgentActionResult;
}

const SEV_ORDER: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

function agentNameHe(agentId: string): string {
  return getAgentDefinition(agentId)?.nameHe ?? agentId;
}

/**
 * Prioritized "what needs attention now" — composed from read-only Hunter +
 * Orchestrator scans over the synthetic demo data. Deterministic (inject `now`
 * for stable tests). Customer-completeness findings offer a user-triggered
 * handoff to Fixer; nothing auto-executes.
 */
export function buildAttention(now?: string): AttentionItem[] {
  const ctx = now ? { now } : {};
  const runs: readonly { agentId: string; res: AgentActionResult }[] = [
    { agentId: "ag-hunter", res: runAgentAction("hunter.missing-contacts", {}, ctx) },
    { agentId: "ag-hunter", res: runAgentAction("hunter.incomplete-customers", {}, ctx) },
    { agentId: "ag-orchestrator", res: runAgentAction("orch.system-review", {}, ctx) },
  ];
  const items: AttentionItem[] = [];
  for (const { agentId, res } of runs) {
    for (const f of res.findings) {
      // A Hunter finding about an incomplete customer record can hand off to Fixer.
      const canFix = agentId === "ag-hunter" && f.id.startsWith("miss-") && f.recordId != null;
      items.push({
        id: `${agentId}:${f.id}`,
        severity: f.severity,
        titleHe: f.textHe,
        sourceAgentId: agentId,
        sourceAgentHe: agentNameHe(agentId),
        evidenceCount: res.evidence.length,
        recommendedActionHe: canFix
          ? "העבר ל-Fixer להצעת תיקון"
          : (res.recommendations[0]?.textHe ?? "לפתוח את המסך הרלוונטי לבדיקה"),
        navigationTarget: res.navigationTarget ?? "/agents",
        ...(f.recordId ? { recordId: f.recordId } : {}),
        ...(canFix ? { handoffAgentId: "ag-fixer", handoffInputs: { recordId: f.recordId as string } } : {}),
      });
    }
  }
  items.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return items;
}

/**
 * Approval-gated proposals derived from the REAL incomplete demo customers.
 * Each is a fixer.propose-correction result (proposal only, no mutation). The
 * Workspace approves by calling fixer.apply-correction with explicit approval —
 * the same gate as /agents; approval applies once and blocks duplicates.
 */
export function buildApprovalCandidates(now?: string): ApprovalCandidate[] {
  const ctx = now ? { now } : {};
  const scan = runAgentAction("hunter.incomplete-customers", {}, ctx);
  const recordIds = [...new Set(scan.findings.map((f) => f.recordId).filter((v): v is string => v != null))];
  return recordIds
    .map((recordId) => {
      const proposal = runAgentAction("fixer.propose-correction", { recordId }, ctx);
      return { recordId, customerNameHe: proposal.evidence[0]?.labelHe ?? recordId, proposal };
    })
    .filter((c) => c.proposal.status === "ok");
}

/** Enabled/available agents in the local demo — the 7 frozen definitions. */
export function availableAgentCount(): number {
  return AGENT_IDS.length;
}

/** The 14 business actions available through the shared registry (no duplicate). */
export function workspaceActionCount(): number {
  return AGENT_ACTIONS.length;
}
