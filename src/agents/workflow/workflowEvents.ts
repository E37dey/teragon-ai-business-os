// S15 Phase 5 — the bounded, sanitized runtime event log for multi-agent knowledge
// workflows. Every timeline entry and every live graph reaction derives from a REAL event
// recorded here — an event is never emitted unless it actually occurred. Metadata only:
// NEVER a note body, NEVER a token/writeKey/HMAC/Authorization header. The store is capped
// (drop-oldest) per workflow and across workflow history, so it can never grow unbounded.
// Runtime-only (in-memory) by design — Phase 5 adds no persistence layer.

export type WorkflowEventType =
  | "WORKFLOW_STARTED"
  | "USER_REQUEST_RECEIVED"
  | "AGENT_STARTED"
  | "HANDOFF_REQUESTED"
  | "HANDOFF_ACCEPTED"
  | "VAULT_SEARCH_STARTED"
  | "VAULT_SEARCH_COMPLETED"
  | "VAULT_NOTE_READ"
  | "VAULT_UNAVAILABLE"
  | "CAPABILITY_DENIED"
  | "AGENT_COMPLETED"
  | "RESULT_CREATED"
  | "USER_DECISION_REQUIRED"
  | "USER_CONTINUED"
  | "WORKFLOW_COMPLETED"
  | "WORKFLOW_FAILED"
  | "WORKFLOW_CANCELLED"
  // Phase-6 governed action lifecycle (recommendation → proposal → human approval → verified
  // Obsidian action). Emitted ONLY when the real state transition actually occurs.
  | "PROPOSAL_CREATED"
  | "PROPOSAL_REVIEW_REQUIRED"
  | "PROPOSAL_APPROVED"
  | "PROPOSAL_REJECTED"
  | "ACTION_STAGED"
  | "NATIVE_CONFIRMATION_REQUIRED"
  | "ACTION_EXECUTED"
  | "ACTION_VERIFIED"
  | "ACTION_CONFLICT"
  | "ACTION_FAILED";

export interface WorkflowEvent {
  readonly id: string;
  readonly workflowRunId: string;
  readonly type: WorkflowEventType;
  readonly at: number;
  /** the agent that acted (if any) — real registry id */
  readonly actorAgentId?: string;
  /** handoff source/target (real transitions only) */
  readonly source?: string;
  readonly target?: string;
  /** vault-relative note path (for VAULT_NOTE_READ) */
  readonly notePath?: string;
  readonly vaultName?: string;
  readonly correlationId?: string;
  /** Phase-6 governed-action lineage (ids only — never a secret or a note body) */
  readonly proposalId?: string;
  readonly mutationId?: string;
  /** honest, short, human-facing label — actions/provenance, NEVER hidden reasoning */
  readonly detailHe: string;
  readonly success: boolean;
}

const MAX_EVENTS_PER_RUN = 100;
const MAX_RUN_HISTORY = 20; // bounded number of workflow runs kept in memory (drop-oldest)

let events: WorkflowEvent[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

/** Record a REAL event. Callers must pass metadata only (no body/secret). */
export function recordWorkflowEvent(ev: WorkflowEvent): void {
  events = [...events, ev];
  // cap per-run (drop-oldest within this run)
  const perRun = events.filter((e) => e.workflowRunId === ev.workflowRunId);
  if (perRun.length > MAX_EVENTS_PER_RUN) {
    const dropIds = new Set(perRun.slice(0, perRun.length - MAX_EVENTS_PER_RUN).map((e) => e.id));
    events = events.filter((e) => !dropIds.has(e.id));
  }
  // cap total run history (drop-oldest whole runs)
  const runOrder: string[] = [];
  for (const e of events) if (!runOrder.includes(e.workflowRunId)) runOrder.push(e.workflowRunId);
  if (runOrder.length > MAX_RUN_HISTORY) {
    const keep = new Set(runOrder.slice(runOrder.length - MAX_RUN_HISTORY));
    events = events.filter((e) => keep.has(e.workflowRunId));
  }
  emit();
}

/** All events for one run, in recorded (chronological) order. */
export function getWorkflowEvents(workflowRunId: string): readonly WorkflowEvent[] {
  return events.filter((e) => e.workflowRunId === workflowRunId);
}

export function getAllWorkflowEvents(): readonly WorkflowEvent[] {
  return events;
}

export function subscribeWorkflowEvents(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function __resetWorkflowEventsForTests(): void {
  events = [];
  emit();
}

export const WORKFLOW_EVENT_BOUNDS = { MAX_EVENTS_PER_RUN, MAX_RUN_HISTORY } as const;
