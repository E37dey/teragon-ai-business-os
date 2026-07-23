// W5-D — the single UI-side wiring of the W5-C engine (Mode A).
// One shared orchestrator + approval engine + registry per browser session,
// built EXACTLY per docs/integration-requests-w5c.md. UI code never touches
// concrete provider internals beyond this seam.
//
// Emergency-disable guard: the engine's frozen definitions cannot be changed
// at runtime (by design), so the UI enforces the repository `status` field —
// `assertAgentsEnabled` refuses to start a run whose plan includes an agent
// whose persisted status is "מושבת". Documented in
// docs/integration-requests-w5d.md (request: move the check into startRun).
import { LocalRulesProvider, repositoryDataAccess } from "@/ai/providers/LocalRulesProvider";
import { ProviderRegistry, type ProviderSelection } from "@/ai/providers/registry";
import { AgentOrchestrator, ApprovalEngine, type StartRunRequest, type RunResult } from "@/agents";
import { agentStores, type AgentStores } from "@/repositories/agentStores";
import { makeExternalHandlers } from "@/components/approval/externalHandlers";

export interface AgentEngineBundle {
  stores: AgentStores;
  registry: ProviderRegistry;
  orchestrator: AgentOrchestrator;
  approvalEngine: ApprovalEngine;
}

let bundle: AgentEngineBundle | null = null;

/** Lazy singleton — Mode A: the local rules engine is the PRIMARY provider. */
export function getAgentEngine(): AgentEngineBundle {
  if (bundle) return bundle;
  const stores = agentStores();
  const local = new LocalRulesProvider(repositoryDataAccess());
  const registry = new ProviderRegistry(
    { remoteEnabled: false, localFallbackPermitted: true },
    { remote: local, local },
  );
  const approvalEngine = new ApprovalEngine({
    stores,
    externalHandlers: makeExternalHandlers(stores),
  });
  const orchestrator = new AgentOrchestrator({ stores, registry, approvalEngine });
  bundle = { stores, registry, orchestrator, approvalEngine };
  return bundle;
}

/** Test-only reset (fresh repositories ⇒ fresh engine). */
export function __resetAgentEngineForTests(): void {
  bundle = null;
}

/** Select the serving provider (Mode A ⇒ local, no fallback disclosure). */
export function selectProvider(): Promise<ProviderSelection> {
  return getAgentEngine().registry.select();
}

export const AGENT_DISABLED_STATUS = "מושבת";

/**
 * UI-side emergency-disable enforcement: throws a Hebrew error when any of
 * the given agents is persisted as disabled. Call before EVERY startRun.
 */
export async function assertAgentsEnabled(
  stores: AgentStores,
  agentIds: readonly string[],
): Promise<void> {
  const agents = await stores.agents.list();
  const disabled = agents.filter(
    (a) => agentIds.includes(a.id) && a.status === AGENT_DISABLED_STATUS,
  );
  if (disabled.length > 0) {
    throw new Error(
      `הסוכן ${disabled.map((a) => a.name).join(", ")} מושבת (השבתת חירום) — לא ניתן להקצות לו משימות חדשות עד הפעלה מחדש`,
    );
  }
}

/** startRun wrapped with the emergency-disable guard (the UI's only entry). */
export async function startGuardedRun(request: StartRunRequest): Promise<RunResult> {
  const { stores, orchestrator } = getAgentEngine();
  const planAgents = (request.plan ?? []).map((s) => s.agentId);
  await assertAgentsEnabled(stores, planAgents);
  return orchestrator.startRun(request);
}
