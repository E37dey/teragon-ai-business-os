// W5-C — permissions matrix + frozen definitions (deny-by-default, no
// runtime self-modification).
import { describe, expect, it } from "vitest";
import {
  AGENT_DEFINITIONS,
  AGENT_IDS,
  canAgent,
  getAgentDefinition,
} from "@/agents/definitions";
import { AUTONOMOUS_OPERATIONS, APPROVAL_REQUIRED_ACTIONS } from "@/domain/agents";

describe("agent definitions — the 7 governed agents", () => {
  it("exactly the 7 seeded agent ids", () => {
    expect([...AGENT_IDS].sort()).toEqual([
      "ag-fixer",
      "ag-flow",
      "ag-hunter",
      "ag-mentor",
      "ag-nexa",
      "ag-orchestrator",
      "ag-wiki",
    ]);
  });

  it("every definition carries limits, provider policy and prompt version", () => {
    for (const id of AGENT_IDS) {
      const def = getAgentDefinition(id);
      expect(def).toBeDefined();
      if (!def) continue;
      expect(def.maxExecutionMs).toBeGreaterThan(0);
      expect(def.maxTaskDepth).toBeGreaterThan(0);
      expect(def.maxHandoffs).toBeGreaterThan(0);
      expect(def.providerPolicy).toBe("local-first");
      expect(def.promptVersion).toMatch(/^v\d/);
      // Mode A: no agent may spend money
      expect(def.maxUsageBudgetILS).toBe(0);
    }
  });

  it("the canonical registries are complete", () => {
    expect(AUTONOMOUS_OPERATIONS).toHaveLength(7);
    expect(APPROVAL_REQUIRED_ACTIONS).toHaveLength(12);
  });
});

describe("canAgent — permission matrix (deny-by-default)", () => {
  it("Hunter: reads sales domains, drafts and recommends", () => {
    expect(canAgent("ag-hunter", "read", "customers")).toBe(true);
    expect(canAgent("ag-hunter", "read", "leads")).toBe(true);
    expect(canAgent("ag-hunter", "read", "products")).toBe(true);
    expect(canAgent("ag-hunter", "read", "quotations")).toBe(true);
    expect(canAgent("ag-hunter", "read", "activities")).toBe(true);
    expect(canAgent("ag-hunter", "draft", "leads")).toBe(true);
    expect(canAgent("ag-hunter", "recommend", "printerModels")).toBe(true);
  });

  it("Hunter: may NOT touch service tickets, approvals or plan", () => {
    expect(canAgent("ag-hunter", "read", "serviceTickets")).toBe(false); // prohibited
    expect(canAgent("ag-hunter", "recommend", "approvals")).toBe(false);
    expect(canAgent("ag-hunter", "plan", "leads")).toBe(false);
    expect(canAgent("ag-hunter", "dispatch", "agentTasks")).toBe(false);
  });

  it("Fixer: reads printers/tickets/knowledge, drafts diagnosis; no quotations", () => {
    expect(canAgent("ag-fixer", "read", "serviceTickets")).toBe(true);
    expect(canAgent("ag-fixer", "read", "printerModels")).toBe(true);
    expect(canAgent("ag-fixer", "search", "knowledgeNotes")).toBe(true);
    expect(canAgent("ag-fixer", "draft", "serviceTickets")).toBe(true);
    expect(canAgent("ag-fixer", "read", "quotations")).toBe(false); // prohibited
    expect(canAgent("ag-fixer", "propose-update", "knowledgeNotes")).toBe(false);
  });

  it("Mentor: learning domains only, recommends exercises", () => {
    expect(canAgent("ag-mentor", "read", "courses")).toBe(true);
    expect(canAgent("ag-mentor", "read", "students")).toBe(true);
    expect(canAgent("ag-mentor", "read", "enrollments")).toBe(true);
    expect(canAgent("ag-mentor", "recommend", "assignments")).toBe(true);
    expect(canAgent("ag-mentor", "read", "leads")).toBe(false);
    expect(canAgent("ag-mentor", "draft", "courses")).toBe(false); // draft not granted
  });

  it("Wiki: searches knowledge, flags contradictions, proposes updates", () => {
    expect(canAgent("ag-wiki", "search", "knowledgeNotes")).toBe(true);
    expect(canAgent("ag-wiki", "flag-contradiction", "knowledgeNotes")).toBe(true);
    expect(canAgent("ag-wiki", "propose-update", "memoryRecords")).toBe(true);
    expect(canAgent("ag-wiki", "explain", "aiRecommendations")).toBe(true);
    expect(canAgent("ag-wiki", "draft", "knowledgeNotes")).toBe(false); // not granted
    expect(canAgent("ag-wiki", "search", "quotations")).toBe(false);
  });

  it("Flow: prepares automation plans, no external execution surface", () => {
    expect(canAgent("ag-flow", "prepare-automation-plan", "automations")).toBe(true);
    expect(canAgent("ag-flow", "read", "automationRuns")).toBe(true);
    expect(canAgent("ag-flow", "read", "customers")).toBe(false); // prohibited
    expect(canAgent("ag-flow", "recommend", "automations")).toBe(false); // not granted
  });

  it("Nexa: proposes campaigns and follow-up text, never sends", () => {
    expect(canAgent("ag-nexa", "propose-campaign", "leads")).toBe(true);
    expect(canAgent("ag-nexa", "draft", "customers")).toBe(true);
    expect(canAgent("ag-nexa", "summarize", "activities")).toBe(true);
    expect(canAgent("ag-nexa", "read", "serviceTickets")).toBe(false); // prohibited
    expect(canAgent("ag-nexa", "prepare-automation-plan", "leads")).toBe(false);
  });

  it("Orchestrator: plan/dispatch/synthesize ONLY, on orchestration domains", () => {
    expect(canAgent("ag-orchestrator", "plan", "agentRuns")).toBe(true);
    expect(canAgent("ag-orchestrator", "dispatch", "agentTasks")).toBe(true);
    expect(canAgent("ag-orchestrator", "synthesize", "agentRuns")).toBe(true);
    expect(canAgent("ag-orchestrator", "read", "leads")).toBe(false);
    expect(canAgent("ag-orchestrator", "recommend", "agentRuns")).toBe(false);
    expect(canAgent("ag-orchestrator", "plan", "approvals")).toBe(false); // prohibited
  });

  it("deny-by-default: unknown agent / unlisted domain ⇒ false", () => {
    expect(canAgent("ag-unknown", "read", "leads")).toBe(false);
    expect(canAgent("ag-hunter", "read", "auditEvents")).toBe(false);
    expect(canAgent("ag-hunter", "read", "roles")).toBe(false);
    expect(canAgent("ag-mentor", "read", "memoryRecords")).toBe(false);
  });

  it("prohibitedDomains wins even for granted operations", () => {
    // every agent explicitly prohibits approvals + auditEvents
    for (const id of AGENT_IDS) {
      const def = getAgentDefinition(id);
      expect(def?.prohibitedDomains).toContain("approvals");
      expect(def?.prohibitedDomains).toContain("auditEvents");
      for (const op of def?.allowedOperations ?? []) {
        expect(canAgent(id, op, "approvals")).toBe(false);
        expect(canAgent(id, op, "auditEvents")).toBe(false);
      }
    }
  });
});

describe("frozen definitions — agents cannot self-modify at runtime", () => {
  it("the registry object and every definition are frozen", () => {
    expect(Object.isFrozen(AGENT_DEFINITIONS)).toBe(true);
    for (const id of AGENT_IDS) {
      const def = AGENT_DEFINITIONS[id];
      expect(Object.isFrozen(def)).toBe(true);
      expect(Object.isFrozen(def?.allowedOperations)).toBe(true);
      expect(Object.isFrozen(def?.allowedDomains)).toBe(true);
      expect(Object.isFrozen(def?.prohibitedDomains)).toBe(true);
      expect(Object.isFrozen(def?.approvalRequiredFor)).toBe(true);
    }
  });

  it("mutation attempts throw (strict mode)", () => {
    const hunter = AGENT_DEFINITIONS["ag-hunter"];
    expect(hunter).toBeDefined();
    if (!hunter) return;
    expect(() => {
      (hunter.allowedOperations as unknown as string[]).push("plan");
    }).toThrow();
    expect(() => {
      (hunter as unknown as { maxUsageBudgetILS: number }).maxUsageBudgetILS = 9999;
    }).toThrow();
    expect(() => {
      (AGENT_DEFINITIONS as unknown as Record<string, unknown>)["ag-rogue"] = {};
    }).toThrow();
    // permissions unchanged after the attempts
    expect(canAgent("ag-hunter", "plan", "leads")).toBe(false);
    expect(hunter.maxUsageBudgetILS).toBe(0);
  });
});
