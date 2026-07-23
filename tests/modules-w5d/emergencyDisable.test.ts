// W5-D — emergency disable: persisted to the agents repository; a disabled
// agent refuses NEW tasks through the UI-side guard around startRun.
import { beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "@/domain/types";
import { __resetRepositoriesForTests, getRepository } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import {
  __resetAgentEngineForTests,
  assertAgentsEnabled,
  startGuardedRun,
  AGENT_DISABLED_STATUS,
} from "@/components/ai/engine";

beforeEach(() => {
  __resetRepositoriesForTests();
  __resetAgentEngineForTests();
});

async function disable(agentId: string): Promise<void> {
  await getRepository<Agent>("agents").update(agentId, {
    status: AGENT_DISABLED_STATUS,
    updatedAt: new Date().toISOString(),
  });
}

describe("emergency disable (5.10)", () => {
  it("disabled state persists in the repository", async () => {
    await disable("ag-hunter");
    const hunter = await getRepository<Agent>("agents").get("ag-hunter");
    expect(hunter?.status).toBe(AGENT_DISABLED_STATUS);
  });

  it("assertAgentsEnabled throws a Hebrew refusal for a disabled agent", async () => {
    await disable("ag-hunter");
    await expect(assertAgentsEnabled(agentStores(), ["ag-hunter"])).rejects.toThrow(/מושבת/);
    // other agents are unaffected
    await expect(assertAgentsEnabled(agentStores(), ["ag-fixer"])).resolves.toBeUndefined();
  });

  it("startGuardedRun refuses to dispatch to a disabled agent (no run is created)", async () => {
    await disable("ag-nexa");
    await expect(
      startGuardedRun({
        goal: "סיכום לידים",
        requestedById: "u-tzachi",
        plan: [
          {
            agentId: "ag-nexa",
            operation: "summarize.weekly-leads",
            domain: "leads",
            titleHe: "סיכום",
          },
        ],
      }),
    ).rejects.toThrow(/מושבת/);
    const runs = await agentStores().runs.list();
    expect(runs).toHaveLength(0);
  });

  it("re-enabling restores dispatch", async () => {
    await disable("ag-nexa");
    await getRepository<Agent>("agents").update("ag-nexa", {
      status: "פעיל",
      updatedAt: new Date().toISOString(),
    });
    const result = await startGuardedRun({
      goal: "סיכום לידים שבועי",
      requestedById: "u-tzachi",
      plan: [
        {
          agentId: "ag-nexa",
          operation: "summarize.weekly-leads",
          domain: "leads",
          titleHe: "סיכום",
        },
      ],
    });
    expect(result.run.status).toBe("הושלם");
  });
});
