// S14.6 Phase 4 — sanitized, bounded runtime trace of REAL agent → Obsidian retrievals.
// This is the ONLY source of Agent↔Note relationships in the Visual Intelligence
// Workspace: an edge is rendered only when a trace here says the retrieval actually
// happened. Traces are metadata only — NEVER a note body, NEVER a token/writeKey/secret.
// The store is capped (drop-oldest) so it can never grow unbounded in memory.

export type RetrievalAction = "status" | "search" | "read";

export interface AgentRetrievalTrace {
  readonly id: string;
  readonly agentId: string;
  readonly action: RetrievalAction;
  readonly vaultName: string;
  /** the search query (for "search") — bounded, never a secret */
  readonly query?: string;
  /** the vault-relative note path (for "read") */
  readonly notePath?: string;
  /** note basename (for "read") — for display + Agent→Note edges */
  readonly basename?: string;
  readonly resultCount: number;
  readonly at: number;
  readonly correlationId: string;
  readonly success: boolean;
}

const MAX_TRACES = 200;
let traces: AgentRetrievalTrace[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

/** Record a real retrieval. Sanitized shape only — callers must not pass bodies/secrets. */
export function recordRetrieval(trace: AgentRetrievalTrace): void {
  traces = [...traces, trace].slice(-MAX_TRACES); // bounded, drop-oldest
  emit();
}

export function getRetrievals(): readonly AgentRetrievalTrace[] {
  return traces;
}

export function getRetrievalsForAgent(agentId: string): readonly AgentRetrievalTrace[] {
  return traces.filter((t) => t.agentId === agentId);
}

/** Reads of a specific note (Agent→Note edges come from "read" traces only). */
export function getRetrievalsForNote(notePath: string): readonly AgentRetrievalTrace[] {
  return traces.filter((t) => t.action === "read" && t.notePath === notePath && t.success);
}

export function subscribeRetrievals(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Test-only reset. */
export function __resetRetrievalTraceForTests(): void {
  traces = [];
  emit();
}
