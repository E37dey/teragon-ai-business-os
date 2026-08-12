// S15 Phase 5 — the live-workflow graph cross-highlights derive from REAL event metadata ONLY.
// Locks the gate guarantees: a handoff lights BOTH endpoints + the edge; a note event lights its
// one real note; an event with no agent/note fabricates NOTHING (no note pulled from wf.sources).
import { describe, expect, it } from "vitest";
import { deriveWorkflowHighlights } from "@/modules/ai-workspace/visual/workflowHighlights";
import type { WorkflowEvent } from "@/agents/workflow/workflowEvents";
import type { WorkflowState } from "@/agents/workflow/knowledgeWorkflow";

const mkEvent = (e: Partial<WorkflowEvent>): WorkflowEvent => ({
  id: "e", workflowRunId: "wf", type: "AGENT_STARTED", at: 0, detailHe: "", success: true, ...e,
});

const wfAtGate = {
  currentAgentId: null,
  sources: [{ sourceType: "obsidian", vaultName: "TERAGON OS", path: "AI Operations.md", title: "AI Operations" }],
} as unknown as WorkflowState;

describe("deriveWorkflowHighlights — real metadata only, no fabrication", () => {
  it("VAULT_NOTE_READ → the reading agent + the note it actually read", () => {
    const h = deriveWorkflowHighlights(mkEvent({ type: "VAULT_NOTE_READ", actorAgentId: "ag-wiki", notePath: "AI Operations.md" }), wfAtGate);
    expect(h.highlightAgentIds).toEqual(["ag-wiki"]);
    expect(h.highlightPaths).toEqual(["AI Operations.md"]);
    expect(h.highlightEdge).toBeNull();
  });

  it("HANDOFF_ACCEPTED → BOTH real endpoints + the exact edge, and NO note (no fabrication)", () => {
    const h = deriveWorkflowHighlights(mkEvent({ type: "HANDOFF_ACCEPTED", source: "ag-orchestrator", target: "ag-wiki" }), wfAtGate);
    expect(h.highlightAgentIds).toEqual(["ag-orchestrator", "ag-wiki"]);
    expect(h.highlightEdge).toEqual({ source: "ag-orchestrator", target: "ag-wiki" });
    expect(h.highlightPaths).toEqual([]); // a handoff references no note — never pulled from wf.sources
  });

  it("RESULT_CREATED → the producing agent only, no note highlighted", () => {
    const h = deriveWorkflowHighlights(mkEvent({ type: "RESULT_CREATED", actorAgentId: "ag-orchestrator" }), wfAtGate);
    expect(h.highlightAgentIds).toEqual(["ag-orchestrator"]);
    expect(h.highlightPaths).toEqual([]);
    expect(h.highlightEdge).toBeNull();
  });

  it("a no-metadata event (WORKFLOW_STARTED) fabricates NOTHING — no agent, no note, no edge", () => {
    const h = deriveWorkflowHighlights(mkEvent({ type: "WORKFLOW_STARTED" }), wfAtGate);
    expect(h.highlightAgentIds).toEqual([]);
    expect(h.highlightPaths).toEqual([]); // crucially NOT ["AI Operations.md"] from wf.sources
    expect(h.highlightEdge).toBeNull();
  });

  it("with no event selected → the live current agent + the real read source (ambient view)", () => {
    const running = { currentAgentId: "ag-wiki", sources: wfAtGate.sources } as unknown as WorkflowState;
    const h = deriveWorkflowHighlights(null, running);
    expect(h.highlightAgentIds).toEqual(["ag-wiki"]);
    expect(h.highlightPaths).toEqual(["AI Operations.md"]);
  });
});
