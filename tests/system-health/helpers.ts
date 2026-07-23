// W8-D test helpers — a fully injectable HealthCheckEnv over in-memory
// repositories. The IO seams are mocked; the check logic under test is real.
import type { AIProvider, AIProviderHealth } from "@/ai/contracts/AIProvider";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import { unavailableConfidence } from "@/domain/ai/envelope";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import { InMemoryRepository } from "@/repositories/InMemoryRepository";
import type { Repository } from "@/repositories/Repository";
import { agentStores as productionAgentStores, type AgentStores } from "@/repositories/agentStores";
import { __resetRepositoriesForTests, getRepository } from "@/repositories";
import type { HealthCheckEnv, IdbProbeResult, StorageEstimateResult } from "@/system-health/checks";
import { ALL_MIGRATIONS } from "@/migrations/migrations";

export const T0 = "2026-07-23T09:00:00.000Z";

export interface EnvOverrides {
  probe?: IdbProbeResult | null;
  storage?: StorageEstimateResult | null;
  localProvider?: AIProvider;
  remoteProvider?: AIProvider;
  fetchImpl?: typeof fetch | null;
  collections?: Partial<Record<CollectionKey, BaseEntity[]>>;
  agentStores?: () => AgentStores;
}

export function fakeEnvelope(overrides: Partial<AIResponseEnvelopeV2> = {}): AIResponseEnvelopeV2 {
  return {
    id: "env-1",
    requestId: "req-1",
    correlationId: "corr-1",
    provider: "local-rules",
    model: null,
    createdAt: T0,
    operation: "summarize.weekly-leads",
    recommendation: "סיכום",
    reason: "כללים",
    evidence: [],
    confidence: unavailableConfidence("rules"),
    nextStep: "אין",
    limitations: ["מנוע כללים — לא LLM"],
    approval: { required: false, state: "not_required" },
    usage: { measured: false },
    status: "הצלחה",
    ...overrides,
  };
}

export function fakeProvider(
  health: AIProviderHealth,
  envelope: AIResponseEnvelopeV2 = fakeEnvelope(),
  summarizeError?: Error,
): AIProvider {
  return {
    id: "fake",
    displayName: "ספק בדיקה",
    health: () => Promise.resolve(health),
    capabilities: () =>
      Promise.resolve({ operations: ["summarize"], streaming: false, structuredOutput: false, detail: "" }),
    summarize: () => (summarizeError ? Promise.reject(summarizeError) : Promise.resolve(envelope)),
    classify: () => Promise.resolve(envelope),
    recommend: () => Promise.resolve(envelope),
    explain: () => Promise.resolve(envelope),
    generateStructured: () => Promise.reject(new Error("לא נתמך בבדיקה")),
    stream: async function* () {
      yield {
        type: "error" as const,
        code: "AI_INTERNAL_ERROR" as const,
        messageHe: "לא נתמך בבדיקה",
        recoverable: false,
      };
    },
  };
}

/**
 * Isolated env: fresh factory (in-memory, jsdom has no IndexedDB), optional
 * per-collection seed override written through the repositories.
 */
export async function makeEnv(overrides: EnvOverrides = {}): Promise<HealthCheckEnv> {
  __resetRepositoriesForTests();
  const custom = new Map<CollectionKey, Repository<BaseEntity>>();
  for (const [key, records] of Object.entries(overrides.collections ?? {})) {
    const repo = new InMemoryRepository<BaseEntity>(key as CollectionKey, []);
    for (const r of records ?? []) await repo.create(r);
    custom.set(key as CollectionKey, repo);
  }
  const collection = <T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T> =>
    (custom.get(key) ?? getRepository(key)) as Repository<T>;
  let tick = 0;
  return {
    collection,
    probeIdb: () => Promise.resolve(overrides.probe ?? null),
    storageEstimate:
      overrides.storage === undefined || overrides.storage === null
        ? null
        : () => Promise.resolve(overrides.storage as StorageEstimateResult),
    localProvider: overrides.localProvider ?? fakeProvider({ state: "מחובר", checkedAt: T0, detail: "" }),
    remoteProvider:
      overrides.remoteProvider ?? fakeProvider({ state: "מושבת", checkedAt: T0, detail: "כבוי בשרת" }),
    fetchImpl: overrides.fetchImpl ?? null,
    agentStores: overrides.agentStores ?? productionAgentStores,
    migrations: ALL_MIGRATIONS,
    now: () => T0,
    perf: () => {
      tick += 5;
      return tick;
    },
    functionsTimeoutMs: 50,
  };
}

export function baseRecord(id: string): BaseEntity {
  return { id, createdAt: T0, updatedAt: T0 };
}
