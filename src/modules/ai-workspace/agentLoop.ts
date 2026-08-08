// S13.5 (PR E) — bounded, HUMAN-CONTROLLED agent loop (NOT autonomous).
// A pure, deterministic state machine over the EXISTING Agent Action Engine
// (same registry, same runAgentAction, same approval gate). Every transition is a
// discrete function called ONLY by an explicit user click — this module contains
// NO code that chains one step into the next, no timers, no recursion, no
// background execution. Max 4 steps, max 1 mutation, one active loop. Fail-closed.
import { runAgentAction, type AgentActionResult } from "@/agents/actions";

export const LOOP_MAX_STEPS = 4;
export const LOOP_OBJECTIVE_HE = "בדיקת והשלמת נתוני לקוח";

export type LoopStatus =
  | "IDLE"
  | "PLANNED"
  | "WAITING_FOR_USER"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "REJECTED"
  | "STOPPED"
  | "BLOCKED"
  | "FAILED";

/** Statuses from which no further step may run. */
export const TERMINAL_STATUSES: readonly LoopStatus[] = ["COMPLETED", "REJECTED", "STOPPED", "BLOCKED", "FAILED"];
export function isTerminal(status: LoopStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface LoopStepResult {
  readonly step: number; // 1..4
  readonly agentId: string;
  readonly actionId: string;
  readonly status: AgentActionResult["status"];
  readonly summary: string;
  readonly evidenceCount: number;
  readonly correlationId: string;
  readonly at: string;
}

export interface LoopState {
  readonly loopId: string;
  readonly objective: string;
  readonly currentStep: number; // 0 = not started; 1..4 completed steps
  readonly maximumSteps: number; // always LOOP_MAX_STEPS
  readonly startedAt: string | null;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly status: LoopStatus;
  readonly stepResults: readonly LoopStepResult[];
  readonly correlationIds: readonly string[];
  readonly stopReason: string | null;
  /** the incomplete-customer recordId Hunter surfaced (drives Fixer steps) */
  readonly targetRecordId: string | null;
  /** Hebrew label of the next explicit user action (null in terminal/awaiting states) */
  readonly nextActionHe: string | null;
}

export interface LoopCtx {
  /** deterministic clock for tests */
  readonly now?: string;
  /** stable id for tests */
  readonly loopId?: string;
  /** active organization — fail-closed if blank */
  readonly orgId?: string;
}

function ts(ctx: LoopCtx): string {
  return ctx.now ?? new Date().toISOString();
}

/** Initial (IDLE) loop — nothing has run. */
export function initialLoop(ctx: LoopCtx = {}): LoopState {
  const at = ts(ctx);
  return {
    loopId: ctx.loopId ?? "loop-1",
    objective: LOOP_OBJECTIVE_HE,
    currentStep: 0,
    maximumSteps: LOOP_MAX_STEPS,
    startedAt: null,
    updatedAt: at,
    completedAt: null,
    status: "IDLE",
    stepResults: [],
    correlationIds: [],
    stopReason: null,
    targetRecordId: null,
    nextActionHe: "התחל תהליך",
  };
}

function toStep(step: number, agentId: string, actionId: string, r: AgentActionResult): LoopStepResult {
  return {
    step,
    agentId,
    actionId,
    status: r.status,
    summary: r.summary,
    evidenceCount: r.evidence.length,
    correlationId: r.correlationId,
    at: r.createdAt,
  };
}

function block(state: LoopState, reason: string, at: string): LoopState {
  return { ...state, status: "BLOCKED", stopReason: reason, updatedAt: at, completedAt: at, nextActionHe: null };
}
function failed(state: LoopState, reason: string, at: string): LoopState {
  return { ...state, status: "FAILED", stopReason: reason, updatedAt: at, completedAt: at, nextActionHe: null };
}

/**
 * PLAN the loop. Does NOT execute Hunter — only the user's explicit Step-1 click
 * runs an agent. Fail-closed if the organization context is missing.
 */
export function startLoop(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status !== "IDLE") return state; // one active loop; no restart mid-flight
  const at = ts(ctx);
  if (ctx.orgId !== undefined && ctx.orgId.trim() === "") {
    return { ...block(state, "זיהוי ארגון חסר — התהליך נחסם (fail-closed).", at), startedAt: at };
  }
  return {
    ...state,
    status: "PLANNED",
    startedAt: at,
    updatedAt: at,
    nextActionHe: "התחל שלב 1 — Hunter (איתור)",
  };
}

/** STEP 1 — Hunter (READ ONLY). Explicit user action. */
export function runHunter(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status !== "PLANNED" || state.currentStep !== 0) return state;
  const at = ts(ctx);
  const r = runAgentAction("hunter.incomplete-customers", {}, ctx.now ? { now: ctx.now } : {});
  if (r.status === "validation_error" || r.status === "execution_error") {
    return failed(state, "פעולת Hunter נכשלה — התהליך נעצר.", at);
  }
  const recordId = r.findings.find((f) => f.recordId)?.recordId ?? null;
  if (r.status === "empty" || !recordId) {
    return block(state, "לא נמצאו לקוחות עם מידע חסר — אין מה לתקן.", at);
  }
  return {
    ...state,
    currentStep: 1,
    status: "WAITING_FOR_USER",
    stepResults: [...state.stepResults, toStep(1, "ag-hunter", "hunter.incomplete-customers", r)],
    correlationIds: [...state.correlationIds, r.correlationId],
    targetRecordId: recordId,
    updatedAt: at,
    nextActionHe: "המשך להצעת תיקון",
  };
}

/** STEP 2 — Fixer proposal (PROPOSAL ONLY). Explicit user action. */
export function runFixerProposal(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status !== "WAITING_FOR_USER" || state.currentStep !== 1) return state;
  const at = ts(ctx);
  if (!state.targetRecordId) return block(state, "ראיה חסרה מ-Hunter — לא ניתן להמשיך.", at);
  const r = runAgentAction("fixer.propose-correction", { recordId: state.targetRecordId }, ctx.now ? { now: ctx.now } : {});
  if (r.status !== "ok") return failed(state, "הצעת התיקון נכשלה או ריקה — התהליך נעצר.", at);
  return {
    ...state,
    currentStep: 2,
    status: "WAITING_FOR_USER",
    stepResults: [...state.stepResults, toStep(2, "ag-fixer", "fixer.propose-correction", r)],
    correlationIds: [...state.correlationIds, r.correlationId],
    updatedAt: at,
    nextActionHe: "המשך לאישור",
  };
}

/** STEP 3 (stage) — run the approval-gated action WITHOUT approval → awaiting_approval.
 *  No mutation occurs. Explicit user action. */
export function stageApproval(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status !== "WAITING_FOR_USER" || state.currentStep !== 2) return state;
  const at = ts(ctx);
  if (!state.targetRecordId) return block(state, "ראיה חסרה — לא ניתן להעמיד לאישור.", at);
  const r = runAgentAction("fixer.apply-correction", { recordId: state.targetRecordId }, ctx.now ? { now: ctx.now } : {});
  if (r.status !== "awaiting_approval") return failed(state, "העמדת האישור נכשלה — התהליך נעצר.", at);
  return {
    ...state,
    currentStep: 3,
    status: "AWAITING_APPROVAL",
    correlationIds: [...state.correlationIds, r.correlationId],
    updatedAt: at,
    nextActionHe: null, // awaiting explicit approve / reject
  };
}

/** STEP 3 — approve: apply the demo mutation exactly once (duplicate blocked by the engine). */
export function approveMutation(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status !== "AWAITING_APPROVAL" || state.currentStep !== 3) return state;
  const at = ts(ctx);
  if (!state.targetRecordId) return block(state, "ראיה חסרה — האישור נחסם.", at);
  const r = runAgentAction("fixer.apply-correction", { recordId: state.targetRecordId }, { approved: true, ...(ctx.now ? { now: ctx.now } : {}) });
  if (r.status !== "applied") return failed(state, "החלת התיקון נכשלה — התהליך נעצר.", at);
  return {
    ...state,
    status: "WAITING_FOR_USER",
    stepResults: [...state.stepResults, toStep(3, "ag-fixer", "fixer.apply-correction", r)],
    correlationIds: [...state.correlationIds, r.correlationId],
    updatedAt: at,
    nextActionHe: "סכם תהליך",
  };
}

/** STEP 3 — reject: no mutation; the loop ends honestly. */
export function rejectMutation(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status !== "AWAITING_APPROVAL") return state;
  const at = ts(ctx);
  return { ...state, status: "REJECTED", stopReason: "התיקון נדחה על ידי המשתמש — לא בוצע שינוי.", updatedAt: at, completedAt: at, nextActionHe: null };
}

/** STEP 4 — Orchestrator summary (READ ONLY). Explicit user action; completes the loop. */
export function runOrchestrator(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status !== "WAITING_FOR_USER" || state.currentStep !== 3) return state;
  const at = ts(ctx);
  if (state.currentStep + 1 > state.maximumSteps) return block(state, "הגעת למספר השלבים המרבי.", at);
  const r = runAgentAction("orch.system-review", {}, ctx.now ? { now: ctx.now } : {});
  if (r.status === "validation_error" || r.status === "execution_error") {
    return failed(state, "סיכום ה-Orchestrator נכשל — התהליך נעצר.", at);
  }
  return {
    ...state,
    currentStep: 4,
    status: "COMPLETED",
    stepResults: [...state.stepResults, toStep(4, "ag-orchestrator", "orch.system-review", r)],
    correlationIds: [...state.correlationIds, r.correlationId],
    updatedAt: at,
    completedAt: at,
    nextActionHe: null,
  };
}

/** Stop — available at every active, non-terminal stage. Never rolls back an
 *  already-applied mutation; records the stop honestly. */
export function stopLoop(state: LoopState, ctx: LoopCtx = {}): LoopState {
  if (state.status === "IDLE" || isTerminal(state.status)) return state;
  const at = ts(ctx);
  return { ...state, status: "STOPPED", stopReason: "התהליך נעצר על ידי המשתמש.", updatedAt: at, completedAt: at, nextActionHe: null };
}
