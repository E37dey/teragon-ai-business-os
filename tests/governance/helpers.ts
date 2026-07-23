// Shared fixtures for the W8-B governance tests: fresh factory-backed stores
// (InMemory in jsdom, seeded), the canonical ApprovalEngine, deterministic clock.
import { ApprovalEngine } from "@/agents";
import { __resetRepositoriesForTests } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import { governanceStores, type GovernanceStores } from "@/repositories/governanceStores";
import { ensureGovernanceData } from "@/governance";
import { makeClock } from "../agents/helpers";

export interface GovernanceFixture {
  stores: GovernanceStores;
  engine: ApprovalEngine;
  clock: () => string;
}

/** Fresh seeded repositories + engine per test. */
export function freshGovernance(): GovernanceFixture {
  __resetRepositoriesForTests();
  const clock = makeClock();
  return {
    stores: governanceStores(),
    engine: new ApprovalEngine({ stores: agentStores(), clock }),
    clock,
  };
}

/** Fresh fixture with the full idempotent bootstrap already applied. */
export async function bootedGovernance(): Promise<GovernanceFixture> {
  const fx = freshGovernance();
  await ensureGovernanceData({ stores: fx.stores, engine: fx.engine, clock: fx.clock });
  return fx;
}

export const APPROVER = { id: "u-tzachi", name: "צחי זוסטייהם" } as const;
