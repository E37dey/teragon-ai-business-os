// Cross-view Agent↔Note usage contract. An Agent→Note edge is rendered ONLY when a
// REAL retrieval trace exists. Phase-4 live agent Vault access is NOT implemented in
// this checkpoint, so there is no trace source yet — we return [] and never fabricate
// Agent↔Note relations. When Phase 4 lands, populate this from the real agent trace.
export interface AgentNoteUsage {
  readonly agentId: string;
  readonly vaultName: string;
  readonly path: string;
  readonly basename: string;
  readonly action: "read" | "search";
  readonly at: number | null;
  readonly correlationId: string | null;
}

/** Real agent→note usages. Empty until Phase-4 live agent access records traces. */
export function deriveAgentNoteUsages(): AgentNoteUsage[] {
  return [];
}
