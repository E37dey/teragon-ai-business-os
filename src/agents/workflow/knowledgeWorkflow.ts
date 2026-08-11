// S15 Phase 5 — bounded, human-controlled multi-agent KNOWLEDGE workflow.
//
//   User request → Orchestrator → Wiki → (real Obsidian note) → Orchestrator
//                → recommendation → HUMAN decision
//
// This is NOT an autonomous loop: it runs one bounded pass to the next human gate, with a
// finite step budget, no timers, no recursion, no background execution, no self-dispatch.
// It reuses the real systems only: the Phase-4 AgentObsidianReadAdapter (the ONLY Vault
// access — capability-gated, bounded, fail-closed), the retrievalTrace (Agent→Note), and the
// canonical agent ids. Every state change emits a REAL workflow event. The recommendation is
// a DETERMINISTIC transform of the real note (title + first line + wikilink targets) — no
// remote model, no fabricated reasoning, no hidden chain-of-thought. Agents have ZERO write
// authority here; the workflow ends at a recommendation + human decision, never a mutation.
import { agentReadVaultNote, agentSearchVault, canAgentReadObsidian } from "@/agents/obsidian/agentObsidianAccess";
import type { ObsidianSource } from "@/agents/obsidian/agentObsidianAccess";
import { recordWorkflowEvent, type WorkflowEvent, type WorkflowEventType } from "./workflowEvents";

export type WorkflowStatus = "IDLE" | "RUNNING" | "WAITING_FOR_USER" | "WAITING_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
export const WORKFLOW_TERMINAL: readonly WorkflowStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
export function isWorkflowTerminal(s: WorkflowStatus): boolean {
  return WORKFLOW_TERMINAL.includes(s);
}

/** Hard bounds — a workflow can never exceed these. */
export const WORKFLOW_MAX_STEPS = 10;
export const WORKFLOW_MAX_VAULT_READS = 1;

export interface WorkflowResult {
  readonly answer: string;
  readonly sources: readonly ObsidianSource[];
  readonly contributingAgents: readonly string[];
}
export interface WorkflowState {
  readonly workflowRunId: string;
  readonly correlationId: string;
  readonly intent: string;
  readonly status: WorkflowStatus;
  readonly currentAgentId: string | null;
  readonly contributingAgents: readonly string[];
  readonly sources: readonly ObsidianSource[];
  readonly result: WorkflowResult | null;
  readonly stepCount: number;
  readonly vaultReads: number;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
  readonly stopReason: string | null;
  readonly nextActionHe: string | null;
}

export interface WorkflowCtx {
  readonly now?: number;
  readonly workflowRunId?: string;
  readonly correlationId?: string;
}

let runSeq = 0;
function nowMs(ctx?: WorkflowCtx): number {
  return ctx?.now ?? (typeof performance !== "undefined" ? Math.floor(performance.timeOrigin + performance.now()) : 0);
}
function mkRunId(ctx?: WorkflowCtx): string {
  if (ctx?.workflowRunId) return ctx.workflowRunId;
  runSeq += 1;
  return `wf-${nowMs(ctx).toString(36)}-${runSeq.toString(36)}`;
}

let evSeq = 0;
function ev(state: WorkflowState, type: WorkflowEventType, detailHe: string, extra: Partial<WorkflowEvent> = {}): void {
  evSeq += 1;
  recordWorkflowEvent({
    id: `${state.workflowRunId}-e${evSeq}`,
    workflowRunId: state.workflowRunId,
    type,
    at: extra.at ?? state.updatedAt,
    correlationId: state.correlationId,
    detailHe,
    success: extra.success ?? true,
    ...extra,
  });
}

/** Derive a bounded search query from the user's intent (no whole-vault dump). */
function deriveQuery(intent: string): string {
  const cleaned = intent.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  // prefer an ASCII/latin knowledge topic if present (note titles are latin), else the intent
  const latin = cleaned.match(/[A-Za-z][A-Za-z ]{2,}/g);
  return (latin ? latin.sort((a, b) => b.length - a.length)[0]!.trim() : cleaned).slice(0, 60);
}

/** Deterministic, provenance-preserving recommendation built from the REAL note content.
 *  Extracts title + first meaningful line + [[wikilink]] targets — a transform of real data,
 *  never an invented LLM answer. */
function buildRecommendation(title: string, content: string): string {
  const firstLine = content.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l.length > 0) ?? title;
  const links = Array.from(new Set([...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim()))).slice(0, 8);
  const linksHe = links.length ? `נושאים מקושרים במסמך: ${links.join(", ")}.` : "אין קישורים במסמך.";
  const rec = links.length
    ? `המלצה מבוססת-ידע: לעיין ב-${links.slice(0, 3).join(", ")} להעמקה בהקשר של ${title}.`
    : `המלצה מבוססת-ידע: להעשיר את ${title} בקישורים לנושאים קשורים.`;
  return `תקציר "${title}": ${firstLine.slice(0, 200)}. ${linksHe} ${rec}`;
}

/** Start a workflow (explicit user action). Emits WORKFLOW_STARTED + USER_REQUEST_RECEIVED. */
export function startKnowledgeWorkflow(intent: string, ctx: WorkflowCtx = {}): WorkflowState {
  const at = nowMs(ctx);
  const workflowRunId = mkRunId(ctx);
  const correlationId = ctx.correlationId ?? `${workflowRunId}-corr`;
  const state: WorkflowState = {
    workflowRunId,
    correlationId,
    intent: intent.trim(),
    status: "RUNNING",
    currentAgentId: null,
    contributingAgents: [],
    sources: [],
    result: null,
    stepCount: 0,
    vaultReads: 0,
    startedAt: at,
    updatedAt: at,
    completedAt: null,
    stopReason: null,
    nextActionHe: null,
  };
  ev(state, "WORKFLOW_STARTED", "התהליך התחיל");
  ev(state, "USER_REQUEST_RECEIVED", `בקשת משתמש: ${state.intent.slice(0, 120)}`);
  return state;
}

function fail(state: WorkflowState, at: number, reason: string, evType: WorkflowEventType, detailHe: string): WorkflowState {
  const next: WorkflowState = { ...state, status: "FAILED", updatedAt: at, completedAt: at, stopReason: reason, currentAgentId: null, nextActionHe: null };
  ev(next, evType, detailHe, { success: false, at });
  ev(next, "WORKFLOW_FAILED", reason, { success: false, at });
  return next;
}

/**
 * Run the bounded workflow to the next human gate. One pass: Orchestrator dispatches Wiki,
 * Wiki performs a REAL bounded search + single-note read, hands back to the Orchestrator which
 * synthesizes a deterministic recommendation → WAITING_FOR_USER. Fail-closed at each real
 * dependency. NOT called recursively; no timers; bounded by WORKFLOW_MAX_STEPS.
 */
export async function runKnowledgeWorkflowToGate(state0: WorkflowState, ctx: WorkflowCtx = {}): Promise<WorkflowState> {
  if (state0.status !== "RUNNING") return state0;
  let state = state0;
  const at = nowMs(ctx);
  const step = (): void => {
    state = { ...state, stepCount: state.stepCount + 1, updatedAt: at };
  };

  // 1) Orchestrator starts + dispatches Wiki (real handoff transition).
  step();
  state = { ...state, currentAgentId: "ag-orchestrator", contributingAgents: ["ag-orchestrator"] };
  ev(state, "AGENT_STARTED", "מנהל התזמור התחיל לתכנן", { actorAgentId: "ag-orchestrator" });
  step();
  ev(state, "HANDOFF_REQUESTED", "מנהל התזמור מנתב לסוכן ידע", { source: "ag-orchestrator", target: "ag-wiki" });
  if (!canAgentReadObsidian("ag-wiki")) {
    return fail(state, at, "סוכן ידע חסר הרשאת קריאה ל-Obsidian.", "CAPABILITY_DENIED", "הרשאה נדחתה");
  }
  ev(state, "HANDOFF_ACCEPTED", "סוכן ידע קיבל את המשימה", { source: "ag-orchestrator", target: "ag-wiki" });
  state = { ...state, currentAgentId: "ag-wiki", contributingAgents: [...state.contributingAgents, "ag-wiki"] };
  ev(state, "AGENT_STARTED", "סוכן ידע התחיל", { actorAgentId: "ag-wiki" });

  // 2) Wiki: REAL bounded Vault search.
  step();
  const query = deriveQuery(state.intent);
  ev(state, "VAULT_SEARCH_STARTED", `חיפוש חי ב-Obsidian: "${query}"`, { actorAgentId: "ag-wiki" });
  const search = await agentSearchVault("ag-wiki", { query }, ctx.correlationId ? { correlationId: ctx.correlationId, now: ctx.now } : { now: ctx.now });
  if (search.code === "denied") return fail(state, at, "הרשאת קריאה נדחתה.", "CAPABILITY_DENIED", "הרשאה נדחתה");
  if (search.code === "unavailable" || search.code === "timeout") return fail(state, at, "Obsidian אינו זמין — התהליך נעצר ללא ידע חי.", "VAULT_UNAVAILABLE", "Obsidian אינו זמין");
  if (search.code === "unauthorized") return fail(state, at, "נדרש חיבור מחדש ל-Obsidian.", "VAULT_UNAVAILABLE", "נדרש חיבור מחדש");
  if (search.hits.length === 0) return fail(state, at, "לא נמצא מידע רלוונטי ב-Obsidian.", "VAULT_SEARCH_COMPLETED", "לא נמצאו תוצאות");
  ev(state, "VAULT_SEARCH_COMPLETED", `נמצאו ${search.hits.length} תוצאות · ${search.hits[0]!.basename}`, { actorAgentId: "ag-wiki", vaultName: search.vaultName ?? undefined });

  // 3) Wiki: REAL bounded single-note read (records the Agent→Note trace).
  step();
  const topPath = search.hits[0]!.path;
  const note = await agentReadVaultNote("ag-wiki", { path: topPath }, ctx.correlationId ? { correlationId: `${ctx.correlationId}-read`, now: ctx.now } : { now: ctx.now });
  if (note.code !== "ok" || !note.source || note.content == null) {
    return fail(state, at, "קריאת המסמך נכשלה — התהליך נעצר.", "VAULT_UNAVAILABLE", "קריאת מסמך נכשלה");
  }
  state = { ...state, vaultReads: state.vaultReads + 1, sources: [...state.sources, note.source] };
  ev(state, "VAULT_NOTE_READ", `סוכן ידע קרא את ${note.basename}`, { actorAgentId: "ag-wiki", notePath: note.path ?? undefined, vaultName: note.source.vaultName, correlationId: note.correlationId });
  ev(state, "AGENT_COMPLETED", "סוכן ידע סיים — סיכם את המסמך", { actorAgentId: "ag-wiki" });

  // 4) Handoff back → Orchestrator synthesizes a deterministic recommendation.
  step();
  ev(state, "HANDOFF_REQUESTED", "סוכן ידע מחזיר למנהל התזמור", { source: "ag-wiki", target: "ag-orchestrator" });
  ev(state, "HANDOFF_ACCEPTED", "מנהל התזמור קיבל את התקציר", { source: "ag-wiki", target: "ag-orchestrator" });
  state = { ...state, currentAgentId: "ag-orchestrator" };
  ev(state, "AGENT_STARTED", "מנהל התזמור מסנתז תשובה", { actorAgentId: "ag-orchestrator" });
  step();
  const answer = buildRecommendation(note.title ?? note.basename ?? topPath, note.content);
  const result: WorkflowResult = { answer, sources: state.sources, contributingAgents: state.contributingAgents };
  ev(state, "RESULT_CREATED", "מנהל התזמור הפיק המלצה מבוססת-ידע", { actorAgentId: "ag-orchestrator" });
  ev(state, "AGENT_COMPLETED", "מנהל התזמור סיים", { actorAgentId: "ag-orchestrator" });

  // 5) Human gate — recommendation ready; nothing is approved/written by the workflow.
  state = { ...state, status: "WAITING_FOR_USER", currentAgentId: null, result, updatedAt: at, nextActionHe: "אשר קבלה / בטל" };
  ev(state, "USER_DECISION_REQUIRED", "ממתין להחלטת אנוש — קבלת ההמלצה או ביטול");
  return state;
}

/** Human accepts the recommendation (acknowledge only — NO write, NO approval of any mutation). */
export function acceptRecommendation(state: WorkflowState, ctx: WorkflowCtx = {}): WorkflowState {
  if (state.status !== "WAITING_FOR_USER") return state;
  const at = nowMs(ctx);
  const next: WorkflowState = { ...state, status: "COMPLETED", completedAt: at, updatedAt: at, nextActionHe: null };
  ev(next, "USER_CONTINUED", "המשתמש קיבל את ההמלצה (ידע בלבד — ללא כתיבה/אישור מוטציה)", { at });
  ev(next, "WORKFLOW_COMPLETED", "התהליך הושלם", { at });
  return next;
}

/** Cancel an active workflow. Stops future steps; does NOT roll back already-completed reads. */
export function cancelWorkflow(state: WorkflowState, ctx: WorkflowCtx = {}): WorkflowState {
  if (isWorkflowTerminal(state.status) || state.status === "IDLE") return state;
  const at = nowMs(ctx);
  const next: WorkflowState = { ...state, status: "CANCELLED", completedAt: at, updatedAt: at, currentAgentId: null, stopReason: "בוטל על ידי המשתמש.", nextActionHe: null };
  ev(next, "WORKFLOW_CANCELLED", "התהליך בוטל על ידי המשתמש", { at });
  return next;
}
