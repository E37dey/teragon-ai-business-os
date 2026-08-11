// S18 Phase 8 — the workflow-pack registry is exactly two trusted, frozen packs; deterministic ids;
// it introduces NO new agent/action and does not change their counts.
import { describe, expect, it } from "vitest";
import { WORKFLOW_PACKS, WORKFLOW_PACK_IDS, getWorkflowPack } from "@/agents/workflow/workflowPacks";
import { AGENT_IDS } from "@/agents/definitions";
import { AGENT_ACTIONS } from "@/agents/actions/registry";

describe("Phase 8 — workflow pack registry", () => {
  it("contains EXACTLY two packs with deterministic, unique ids", () => {
    expect(WORKFLOW_PACKS).toHaveLength(2);
    expect(WORKFLOW_PACK_IDS).toEqual(["governed-knowledge-capture", "operational-recovery"]);
    expect(new Set(WORKFLOW_PACK_IDS).size).toBe(2); // no duplicate ids
  });

  it("the flagship is a governed knowledge pack targeting a trusted note via append", () => {
    const p = getWorkflowPack("governed-knowledge-capture")!;
    expect(p.category).toBe("knowledge");
    expect(p.knowledgeRequired).toBe(true);
    expect(p.governedActionSupported).toBe(true);
    expect(p.targetStrategy).toEqual({ verb: "append", path: "Decisions Log.md" });
    expect(p.allowedAgents).toEqual(["ag-orchestrator", "ag-wiki"]); // audited roles only
    expect(p.intentTemplate.length).toBeGreaterThan(0);
  });

  it("operational recovery supports NO governed action (retry is an explicit new run)", () => {
    const p = getWorkflowPack("operational-recovery")!;
    expect(p.governedActionSupported).toBe(false);
    expect(p.targetStrategy).toBeNull();
    expect(p.intentTemplate).toBe(""); // reuses the failed run's intent
  });

  it("pack config is frozen (trusted) and unknown ids resolve to null", () => {
    expect(Object.isFrozen(WORKFLOW_PACKS)).toBe(true);
    expect(Object.isFrozen(WORKFLOW_PACKS[0])).toBe(true);
    expect(getWorkflowPack("action-15")).toBeNull();
    expect(getWorkflowPack(null)).toBeNull();
    expect(getWorkflowPack(undefined)).toBeNull();
  });

  it("introduces NO Agent #8 and NO action #15", () => {
    expect(AGENT_IDS).toHaveLength(7);
    expect(AGENT_ACTIONS).toHaveLength(14);
    // every allowedAgent a pack names is a REAL canonical agent
    for (const p of WORKFLOW_PACKS) for (const a of p.allowedAgents) expect(AGENT_IDS).toContain(a);
  });
});
