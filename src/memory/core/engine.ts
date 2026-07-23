// TERAGON AI BUSINESS OS — memory engine singleton (Wave 6, W6-A).
// The /memory page (and future consumers) get ONE workflow instance wired
// over the canonical repository factory — same pattern as getAgentEngine.
import { agentStores, type AgentStores } from "@/repositories/agentStores";
import { memoryStores, type MemoryStores } from "@/memory/repositories/memoryStores";
import { IndexedDBMemoryAdapter, CloudMemoryAdapter } from "@/memory/adapters/MemoryRepository";
import type { MemoryRepositoryAdapter } from "@/memory/adapters/MemoryRepository";
import { MemoryProposalWorkflow } from "./proposalWorkflow";

export interface MemoryEngineBundle {
  stores: MemoryStores;
  agentStores: AgentStores;
  workflow: MemoryProposalWorkflow;
  /** active storage adapter (Mode A ⇒ IndexedDB local) */
  adapter: MemoryRepositoryAdapter;
  /** honest stub — unavailable in Mode A, shown as-is in the UI */
  cloudAdapter: MemoryRepositoryAdapter;
}

let bundle: MemoryEngineBundle | null = null;

export function getMemoryEngine(): MemoryEngineBundle {
  if (bundle) return bundle;
  const stores = memoryStores();
  const agents = agentStores();
  const workflow = new MemoryProposalWorkflow({ stores, agentStores: agents });
  bundle = {
    stores,
    agentStores: agents,
    workflow,
    adapter: new IndexedDBMemoryAdapter(),
    cloudAdapter: new CloudMemoryAdapter(),
  };
  return bundle;
}

/** Test-only reset (fresh repositories ⇒ fresh engine). */
export function __resetMemoryEngineForTests(): void {
  bundle = null;
}
