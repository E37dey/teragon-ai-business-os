// TERAGON AI BUSINESS OS — deterministic demo scenario (Wave 5, W5-C).
// "לקוח עסקי מבקש מדפסת לחומרים הנדסיים": a REAL orchestrated run through the
// LocalRulesProvider via the registry (Mode A) — not hardcoded graph data.
// Creates real records: run, plan events, tasks for Hunter+Wiki+Fixer,
// messages, evidence from seed records, the Hunter/Fixer support-risk
// conflict, a recommendation synthesis and a PENDING approval.
// Idempotent: stable ids under the "demo-w5c-" prefix — safe to re-run.
import { LocalRulesProvider, repositoryDataAccess } from "@/ai/providers/LocalRulesProvider";
import { ProviderRegistry } from "@/ai/providers/registry";
import type { AgentConflict, Approval } from "@/domain/types";
import type { AgentRun } from "@/domain/agents";
import { agentStores, type AgentStores } from "@/repositories/agentStores";
import { AgentOrchestrator, type PlannedStep } from "./orchestrator";
import type { Clock } from "./runlog";

export const DEMO_RUN_ID = "demo-w5c-run-1";

export const DEMO_GOAL_HE = "לקוח עסקי מבקש מדפסת לחומרים הנדסיים";

/** The deterministic 3-specialist plan (Hunter + Wiki + Fixer). */
export const DEMO_PLAN: readonly PlannedStep[] = [
  {
    agentId: "ag-hunter",
    operation: "recommend.printer-match",
    domain: "printerModels",
    titleHe: "התאמת דגם לחומרים הנדסיים",
    params: {
      useCase: "חלקים טכניים",
      materials: ["PETG", "ABS"],
      buildVolume: "בינוני",
      budget: 3500,
    },
  },
  {
    agentId: "ag-wiki",
    operation: "explain.recommendation",
    domain: "aiRecommendations",
    titleHe: "הצלבת ידע מאושר: פתרון וורפינג PETG",
    relatedEntities: [{ type: "aiRecommendation", id: "rec-2" }],
  },
  {
    agentId: "ag-fixer",
    operation: "explain.recommendation",
    domain: "aiRecommendations",
    titleHe: "בדיקת היסטוריית שירות לדגם המומלץ",
    relatedEntities: [{ type: "aiRecommendation", id: "rec-2" }],
  },
] as const;

export interface DemoScenarioResult {
  runId: string;
  /** false ⇒ the scenario already existed (idempotent re-run) */
  created: boolean;
  run: AgentRun;
  conflicts: AgentConflict[];
  approval: Approval | null;
}

export interface DemoScenarioDeps {
  stores?: AgentStores;
  clock?: Clock;
}

/**
 * Run (or return) the demo scenario. Genuinely exercises the engine: the
 * LocalRulesProvider recommends a printer for engineering materials, Fixer's
 * participation surfaces the open-service-ticket conflict on the recommended
 * model, and the run parks at a pending human approval.
 */
export async function runDemoScenario(deps: DemoScenarioDeps = {}): Promise<DemoScenarioResult> {
  const stores = deps.stores ?? agentStores();

  // idempotency: stable id — an existing run is returned untouched
  const existing = await stores.runs.get(DEMO_RUN_ID);
  if (existing) {
    const conflicts: AgentConflict[] = [];
    for (const id of existing.conflictIds) {
      const c = await stores.conflicts.get(id);
      if (c) conflicts.push(c);
    }
    const firstApprovalId = existing.approvalIds[0];
    const approval = firstApprovalId ? ((await stores.approvals.get(firstApprovalId)) ?? null) : null;
    return { runId: DEMO_RUN_ID, created: false, run: existing, conflicts, approval };
  }

  const local = new LocalRulesProvider(repositoryDataAccess(), {
    idFactory: (n) => `demo-w5c-env-${n}`,
    ...(deps.clock ? { now: deps.clock } : {}),
  });
  // Mode A: remote disabled — the registry serves the local rules engine as
  // the PRIMARY provider (the remote slot is never consulted).
  const registry = new ProviderRegistry(
    { remoteEnabled: false, localFallbackPermitted: true },
    { remote: local, local },
  );
  const orchestrator = new AgentOrchestrator({
    stores,
    registry,
    ...(deps.clock ? { clock: deps.clock } : {}),
  });

  const result = await orchestrator.startRun({
    goal: DEMO_GOAL_HE,
    requestedById: "u-tzachi",
    runId: DEMO_RUN_ID,
    plan: [...DEMO_PLAN],
    demo: true,
    approval: {
      action: "customer-message",
      executionPayload: null,
      previewHe:
        "שליחת המלצת הדגם ללקוח העסקי — כולל גילוי נאות על קריאות השירות הפתוחות לדגם המומלץ",
    },
  });

  return {
    runId: DEMO_RUN_ID,
    created: true,
    run: result.run,
    conflicts: result.conflicts,
    approval: result.approval,
  };
}
