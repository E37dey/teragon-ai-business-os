// Cross-view Agent↔Note usage contract. An Agent→Note edge is rendered ONLY when a
// REAL retrieval trace exists (Phase-4 live agent Vault access). We derive usages from the
// sanitized runtime retrieval trace store — never fabricated, never historical invention.
import { getRetrievals } from "@/agents/obsidian/retrievalTrace";

export interface AgentNoteUsage {
  readonly agentId: string;
  readonly vaultName: string;
  readonly path: string;
  readonly basename: string;
  readonly action: "read" | "search";
  readonly at: number | null;
  readonly correlationId: string | null;
}

/**
 * Real agent→note usages from the live retrieval trace store. Only successful **read**
 * traces (which reference one concrete note) become Agent→Note edges; searches are
 * query-level and do not create a single-note relationship. Empty until an allowed agent
 * actually reads a note.
 */
export function deriveAgentNoteUsages(): AgentNoteUsage[] {
  return getRetrievals()
    .filter((t) => t.action === "read" && t.success && !!t.notePath)
    .map((t) => ({
      agentId: t.agentId,
      vaultName: t.vaultName,
      path: t.notePath!,
      basename: t.basename ?? t.notePath!.replace(/^.*\//, "").replace(/\.md$/i, ""),
      action: "read" as const,
      at: t.at,
      correlationId: t.correlationId,
    }));
}
