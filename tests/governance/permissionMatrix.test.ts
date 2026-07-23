// W8-B — the permission matrix DERIVES from the frozen AGENT_DEFINITIONS
// (field-for-field, never a hand-maintained copy), boundary categories derive
// from the governance constants, and the provider configuration is honest.
import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, AGENT_IDS } from "@/agents/definitions";
import {
  APPROVAL_ACTION_LABELS_HE,
  APPROVAL_REQUIRED_ACTIONS,
  AUTONOMOUS_OPERATIONS,
} from "@/domain/agents";
import type { Agent } from "@/domain/types";
import {
  deriveBoundaryCategories,
  deriveModelConfiguration,
  derivePermissionMatrix,
  deriveProviderConfiguration,
  deriveToolPermissions,
} from "@/governance";

const T0 = "2026-07-23T08:00:00.000Z";

function makeAgent(id: string, status: Agent["status"]): Agent {
  return {
    id,
    createdAt: T0,
    updatedAt: T0,
    name: "בדיקה",
    purpose: "בדיקה",
    allowedTools: [],
    allowedDomains: [],
    prohibitedDomains: [],
    promptVersion: "v0",
    limits: { maxTasksPerDay: 1, maxActionsPerTask: 1, dailyBudgetILS: 0 },
    status,
  };
}

describe("derivePermissionMatrix — derives, never duplicates", () => {
  it("emits one row per governed agent, field-for-field equal to the frozen definition", () => {
    const matrix = derivePermissionMatrix([]);
    expect(matrix).toHaveLength(AGENT_IDS.length);
    for (const row of matrix) {
      const def = AGENT_DEFINITIONS[row.agentId];
      expect(def).toBeTruthy();
      if (!def) continue;
      // SAME references — proof of derivation from the frozen object, not a copy
      expect(row.operations).toBe(def.allowedOperations);
      expect(row.allowedDomains).toBe(def.allowedDomains);
      expect(row.prohibitedDomains).toBe(def.prohibitedDomains);
      expect(row.approvalRequiredFor).toBe(def.approvalRequiredFor);
      expect(row.tools).toBe(def.tools);
      expect(row.promptVersion).toBe(def.promptVersion);
      expect(row.maxUsageBudgetILS).toBe(def.maxUsageBudgetILS);
    }
  });

  it("no agent holds writable approvals/auditEvents/users/roles — ever", () => {
    for (const row of derivePermissionMatrix([])) {
      for (const forbidden of ["approvals", "auditEvents", "users", "roles"]) {
        expect(row.allowedDomains, `${row.agentId} must not access ${forbidden}`).not.toContain(
          forbidden,
        );
        expect(row.prohibitedDomains).toContain(forbidden);
      }
    }
  });

  it("reflects the live emergency (runtime) status from the agents collection", () => {
    const matrix = derivePermissionMatrix([makeAgent("ag-hunter", "חסום")]);
    expect(matrix.find((r) => r.agentId === "ag-hunter")?.runtimeStatus).toBe("חסום");
    expect(matrix.find((r) => r.agentId === "ag-fixer")?.runtimeStatus).toBeNull(); // honestly missing
  });

  it("the derived rows cannot poison the definitions (frozen source)", () => {
    const def = AGENT_DEFINITIONS["ag-hunter"];
    expect(def).toBeTruthy();
    if (!def) return;
    expect(() => {
      (def.allowedDomains as unknown as string[]).push("approvals");
    }).toThrow();
  });

  it("tool view inverts the matrix without inventing tools", () => {
    const tools = deriveToolPermissions();
    const allTools = new Set(AGENT_IDS.flatMap((id) => [...(AGENT_DEFINITIONS[id]?.tools ?? [])]));
    expect(tools.map((t) => t.tool).sort((a, b) => a.localeCompare(b))).toEqual(
      [...allTools].sort((a, b) => a.localeCompare(b)),
    );
  });
});

describe("boundary categories — derived from the governance constants", () => {
  it("category 1 IS the AUTONOMOUS_OPERATIONS list (same reference)", () => {
    const cats = deriveBoundaryCategories();
    expect(cats).toHaveLength(4);
    expect(cats[0]?.items).toBe(AUTONOMOUS_OPERATIONS);
  });

  it("category 2 carries all 12 canonical approval actions as Hebrew labels", () => {
    const cats = deriveBoundaryCategories();
    const labels = APPROVAL_REQUIRED_ACTIONS.map((a) => APPROVAL_ACTION_LABELS_HE[a]);
    expect(cats[1]?.items).toEqual(labels);
    expect(cats[1]?.items).toHaveLength(12);
  });

  it("category 3 is the union of every definition's prohibited actions", () => {
    const cats = deriveBoundaryCategories();
    const union = new Set(
      AGENT_IDS.flatMap((id) => [...(AGENT_DEFINITIONS[id]?.prohibitedActionsHe ?? [])]),
    );
    expect(new Set(cats[2]?.items)).toEqual(union);
  });

  it("every category cites its real source", () => {
    for (const cat of deriveBoundaryCategories()) {
      expect(cat.sourceRef).toMatch(/src\/(domain\/agents|agents)/);
    }
  });
});

describe("provider/model configuration — honest Mode A", () => {
  it("מקומי פעיל, מרוחק מושבת — and no client-side model name", () => {
    const providers = deriveProviderConfiguration();
    const local = providers.find((p) => p.kind === "מקומי");
    const remote = providers.find((p) => p.kind === "מרוחק");
    expect(local?.enabled).toBe(true);
    expect(local?.statusHe).toBe("פעיל");
    expect(local?.model).toBeNull(); // the rules engine never pretends to be a model
    expect(remote?.enabled).toBe(false);
    expect(remote?.statusHe).toBe("מושבת");
    expect(remote?.model).toBeNull(); // model name lives server-side only
  });

  it("model configuration rows carry source refs, no invented values", () => {
    for (const row of deriveModelConfiguration()) {
      expect(row.sourceRef).toMatch(/^src\//);
      expect(row.valueHe.length).toBeGreaterThan(0);
    }
  });
});
