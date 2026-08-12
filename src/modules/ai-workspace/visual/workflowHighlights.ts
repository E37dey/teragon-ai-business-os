// S15 Phase 5 — pure derivation of the live-workflow graph cross-highlights from REAL event
// metadata ONLY. Extracted from WorkflowMode so the "no fabricated cross-highlight" guarantee is
// unit-testable without rendering the force graphs.
//
//   • a selected HANDOFF event  → BOTH real endpoints + the exact handoff edge (no note)
//   • a selected note/agent event → its ONE real actor + (only) the note it genuinely references
//   • a selected event with no agent/note → NOTHING (never fabricated from the workflow's sources)
//   • no selection → the live current agent + the real read source (ambient live view)
import type { WorkflowEvent } from "@/agents/workflow/workflowEvents";
import type { WorkflowState } from "@/agents/workflow/knowledgeWorkflow";

export interface WorkflowHighlights {
  readonly highlightAgentIds: string[];
  readonly highlightEdge: { source: string; target: string } | null;
  readonly highlightPaths: string[];
}

export function deriveWorkflowHighlights(selectedEvent: WorkflowEvent | null, wf: WorkflowState | null): WorkflowHighlights {
  if (selectedEvent) {
    const e = selectedEvent;
    if (e.source && e.target) {
      return { highlightAgentIds: [e.source, e.target], highlightEdge: { source: e.source, target: e.target }, highlightPaths: e.notePath ? [e.notePath] : [] };
    }
    const actor = e.actorAgentId ?? e.source ?? null;
    return { highlightAgentIds: actor ? [actor] : [], highlightEdge: null, highlightPaths: e.notePath ? [e.notePath] : [] };
  }
  return { highlightAgentIds: wf?.currentAgentId ? [wf.currentAgentId] : [], highlightEdge: null, highlightPaths: (wf?.sources ?? []).map((s) => s.path) };
}
