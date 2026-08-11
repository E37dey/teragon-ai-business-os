// S16 Phase 6 — GOVERNED RECOMMENDATION → PROPOSAL → HUMAN APPROVAL → VERIFIED ACTION.
//
// Turns a REAL Phase-5 workflow recommendation into a governed, auditable, explicitly
// human-approved Obsidian action. This is ORCHESTRATION ONLY — it reuses the existing Phase-3
// write-proposal system (createWriteProposal/approveWriteProposal/rejectWriteProposal/
// executeWriteProposal) and the existing vaultBridgeClient write path. It creates NO second
// proposal system, NO second approval engine, NO second Obsidian write client, and NO new agent
// action. Agents have ZERO authority here: creation, approval, and execution are all explicit
// human actions invoked from the UI; nothing in src/agents/* calls these functions.
//
// Two independent gates are preserved:
//   Gate 1 — TERAGON approval (PROPOSED → APPROVED). Does NOT mutate the Vault.
//   Gate 2 — the native Obsidian confirmation inside executeWriteProposal. The Vault is touched
//            ONLY on the human's in-Obsidian click. TERAGON approval alone cannot mutate.
//
// Every timeline event corresponds to a real state transition; ACTION_VERIFIED is emitted only
// after read-back verification actually succeeds (executeWriteProposal returns WRITTEN).
import {
  approveWriteProposal,
  createWriteProposal,
  executeWriteProposal,
  rejectWriteProposal,
  type Identity,
  type WriteProposal,
} from "@/integration/obsidian/obsidianWrite";
import type { WorkflowState } from "./knowledgeWorkflow";
import { recordWorkflowEvent, type WorkflowEvent, type WorkflowEventType } from "./workflowEvents";

export type GovernedActionStatus =
  | "PROPOSAL_PENDING" // proposal created, awaiting human review (WriteProposal PROPOSED)
  | "APPROVED_STAGING" // TERAGON approved (gate 1); native Obsidian confirmation (gate 2) required
  | "EXECUTED_VERIFIED" // written + read-back verified
  | "REJECTED" // human rejected the TERAGON proposal — no write
  | "CONFLICT" // expectedHash conflict — no overwrite
  | "FAILED"; // native rejection / failure / verification mismatch — fail closed

export const GOVERNED_TERMINAL: readonly GovernedActionStatus[] = ["EXECUTED_VERIFIED", "REJECTED", "CONFLICT", "FAILED"];
export function isGovernedTerminal(s: GovernedActionStatus): boolean {
  return GOVERNED_TERMINAL.includes(s);
}

export interface GovernedActionState {
  readonly workflowRunId: string;
  readonly correlationId: string;
  readonly proposal: WriteProposal;
  readonly status: GovernedActionStatus;
  readonly detailHe: string | null;
}

/** The originating (synthesizing) agent for a Phase-5 knowledge workflow recommendation. */
const ORIGINATING_AGENT = "ag-orchestrator";

// One in-flight proposal per workflow run (idempotency: a repeated "create" for the same run —
// e.g. a double-click or a StrictMode re-invoke — returns the SAME proposal, never a second one).
// Runtime-only; bounded; cleared for tests.
const BY_RUN = new Map<string, GovernedActionState>();

let evSeq = 0;
function ev(runId: string, correlationId: string, type: WorkflowEventType, detailHe: string, extra: Partial<WorkflowEvent> = {}): void {
  evSeq += 1;
  recordWorkflowEvent({
    id: `${runId}-g${evSeq}`,
    workflowRunId: runId,
    type,
    at: extra.at ?? Date.now(),
    correlationId,
    detailHe,
    success: extra.success ?? true,
    ...extra,
  });
}

/** Bounded, provenance-aware governed block built from the REAL recommendation (not the note
 *  body). Appended verbatim to the synthetic target on approval + native confirmation. */
function buildActionBlock(wf: WorkflowState, at: string): string {
  const rec = wf.result?.answer ?? "";
  const sources = (wf.result?.sources ?? []).map((s) => s.path).join(", ");
  const agents = (wf.result?.contributingAgents ?? []).join(", ");
  return `\n## המלצה מאושרת · תהליך ${wf.workflowRunId} · ${at}\n${rec}\nמקורות: ${sources}\nסוכנים תורמים: ${agents}\n`;
}

export interface CreateGovernedProposalInput {
  readonly targetPath: string; // synthetic note (e.g. "Phase6 Governed Action Proof.md")
  readonly vaultName?: string;
  readonly baseContent?: string | null; // current target content (for append conflict guard + diff)
  readonly requester?: Identity;
  readonly now?: string;
}

/**
 * EXPLICIT human action ("הפוך להצעה"): turn a completed Phase-5 recommendation into a governed
 * APPEND proposal against a synthetic note. Performs NO write. Idempotent per workflow run.
 * Requires a real recommendation — never fabricates one, never auto-creates.
 */
export async function createProposalFromRecommendation(
  wf: WorkflowState,
  input: CreateGovernedProposalInput,
): Promise<GovernedActionState> {
  if (!wf.result) throw new Error("no recommendation to propose");
  const existing = BY_RUN.get(wf.workflowRunId);
  if (existing && !isGovernedTerminal(existing.status)) return existing; // no duplicate proposal

  const at = input.now ?? new Date().toISOString();
  const block = buildActionBlock(wf, at);
  const proposal = await createWriteProposal({
    operation: "append",
    vaultName: input.vaultName ?? wf.result.sources[0]?.vaultName ?? "TERAGON OS",
    path: input.targetPath,
    appendBlock: block,
    baseContent: input.baseContent ?? "",
    requester: input.requester,
    now: at,
    // provenance — links the proposal back to the exact workflow that produced it
    correlationId: wf.correlationId,
    workflowRunId: wf.workflowRunId,
    originatingAgentId: ORIGINATING_AGENT,
    sourceNotePaths: wf.result.sources.map((s) => s.path),
    recommendationRef: `${wf.workflowRunId}:result`,
  });
  const state: GovernedActionState = { workflowRunId: wf.workflowRunId, correlationId: wf.correlationId, proposal, status: "PROPOSAL_PENDING", detailHe: `הצעה נוצרה — הוספה ל-${input.targetPath}` };
  BY_RUN.set(wf.workflowRunId, state);
  ev(wf.workflowRunId, wf.correlationId, "PROPOSAL_CREATED", `הומלצה הפכה להצעת פעולה (הוספה ל-${input.targetPath})`, { actorAgentId: ORIGINATING_AGENT, proposalId: proposal.proposalId, mutationId: proposal.mutationId, notePath: input.targetPath });
  ev(wf.workflowRunId, wf.correlationId, "PROPOSAL_REVIEW_REQUIRED", "ממתין לסקירה והחלטת אנוש (אישור/דחייה)", { proposalId: proposal.proposalId });
  return state;
}

/** EXPLICIT human rejection of the TERAGON proposal. Terminal. No write, no native modal. */
export function rejectProposal(state: GovernedActionState): GovernedActionState {
  if (state.proposal.state !== "PROPOSED") return state;
  const proposal = rejectWriteProposal(state.proposal);
  const next: GovernedActionState = { ...state, proposal, status: "REJECTED", detailHe: "ההצעה נדחתה על ידי המשתמש — לא בוצעה כתיבה" };
  BY_RUN.set(state.workflowRunId, next);
  ev(state.workflowRunId, state.correlationId, "PROPOSAL_REJECTED", "המשתמש דחה את ההצעה — אין כתיבה, אין אישור מקומי", { proposalId: proposal.proposalId, success: false });
  return next;
}

/**
 * EXPLICIT human approval (gate 1). Transitions PROPOSED → APPROVED and stages the intent, but
 * performs NO Vault write — the native Obsidian confirmation (gate 2) is still required. Proves
 * "TERAGON approval alone cannot mutate the Vault".
 */
export function approveProposal(state: GovernedActionState, who?: Identity): GovernedActionState {
  if (state.proposal.state !== "PROPOSED") return state;
  const proposal = approveWriteProposal(state.proposal, who);
  const next: GovernedActionState = { ...state, proposal, status: "APPROVED_STAGING", detailHe: "אושר ב-TERAGON — נדרש אישור מקומי ב-Obsidian" };
  BY_RUN.set(state.workflowRunId, next);
  ev(state.workflowRunId, state.correlationId, "PROPOSAL_APPROVED", "המשתמש אישר את ההצעה ב-TERAGON (שער 1)", { proposalId: proposal.proposalId });
  ev(state.workflowRunId, state.correlationId, "ACTION_STAGED", "הפעולה מוכנה — טרם בוצעה כתיבה", { proposalId: proposal.proposalId, mutationId: proposal.mutationId });
  ev(state.workflowRunId, state.correlationId, "NATIVE_CONFIRMATION_REQUIRED", "נדרש אישור אנושי מקומי בתוך Obsidian (שער 2)", { proposalId: proposal.proposalId });
  return next;
}

/**
 * Execute an APPROVED governed proposal: exactly one bounded write behind the native Obsidian
 * confirmation, then read-back verification (all inside executeWriteProposal). Emits truthful
 * terminal events — ACTION_VERIFIED ONLY when the write is confirmed AND read-back matches.
 */
export async function executeApprovedProposal(
  state: GovernedActionState,
  opts: { token?: string | null; writeKey?: string | null; baseUrl?: string } = {},
): Promise<GovernedActionState> {
  if (state.proposal.state !== "APPROVED") return state;
  const proposal = await executeWriteProposal(state.proposal, opts);
  // Post-approval execution outcome. A native-modal rejection (proposal.state "REJECTED") during
  // execution is a fail-closed STOP — never a false success; it maps to FAILED, not EXECUTED.
  const status: GovernedActionStatus = proposal.state === "WRITTEN" ? "EXECUTED_VERIFIED" : proposal.state === "CONFLICT" ? "CONFLICT" : "FAILED";
  let detailHe: string;
  if (status === "EXECUTED_VERIFIED") {
    detailHe = "בוצעה כתיבה אחת ואומתה בקריאה חוזרת";
    ev(state.workflowRunId, state.correlationId, "ACTION_EXECUTED", "בוצעה כתיבה בודדת ל-Obsidian (לאחר אישור מקומי)", { proposalId: proposal.proposalId, mutationId: proposal.mutationId, notePath: proposal.path });
    ev(state.workflowRunId, state.correlationId, "ACTION_VERIFIED", "אומת בקריאה חוזרת — הבלוק קיים והתאמת hash", { proposalId: proposal.proposalId, notePath: proposal.path });
  } else if (status === "CONFLICT") {
    detailHe = "הקובץ השתנה מאז ההצעה — נמנעה דריסה (נדרשת הצעה חדשה)";
    ev(state.workflowRunId, state.correlationId, "ACTION_CONFLICT", "התנגשות expectedHash — אין דריסה, נדרשת סקירה מחדש", { proposalId: proposal.proposalId, notePath: proposal.path, success: false });
  } else {
    detailHe = proposal.failureCode === "REJECTED" ? "האישור המקומי ב-Obsidian נדחה — לא בוצעה כתיבה" : "הפעולה נכשלה — לא נרשמה הצלחה";
    ev(state.workflowRunId, state.correlationId, "ACTION_FAILED", detailHe, { proposalId: proposal.proposalId, notePath: proposal.path, success: false });
  }
  const next: GovernedActionState = { ...state, proposal, status, detailHe };
  BY_RUN.set(state.workflowRunId, next);
  return next;
}

/** The current governed-action state for a run (for cross-selection / lineage), if any. */
export function getGovernedActionForRun(workflowRunId: string): GovernedActionState | null {
  return BY_RUN.get(workflowRunId) ?? null;
}

/** Test-only: clear the per-run proposal registry. */
export function __resetGovernedActionsForTests(): void {
  BY_RUN.clear();
}
