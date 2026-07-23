// Shared fixtures for the W5-C engine tests: deterministic clock, fresh
// factory-backed stores (InMemory in jsdom — no indexedDB), fake providers.
import { z } from "zod";
import {
  AIError,
  type AICapabilities,
  type AIProvider,
  type AIProviderHealth,
  type AIProviderResult,
  type AIRequest,
  type AIStreamEvent,
} from "@/ai/contracts/AIProvider";
import { ProviderRegistry } from "@/ai/providers/registry";
import type { AIResponseEnvelopeV2, EvidenceItem } from "@/domain/ai/envelope";
import { unavailableConfidence } from "@/domain/ai/envelope";
import { __resetRepositoriesForTests } from "@/repositories";
import { agentStores, type AgentStores } from "@/repositories/agentStores";

/** Deterministic clock: each call advances by stepMs (default 10ms). */
export function makeClock(startISO = "2026-07-23T08:00:00.000Z", stepMs = 10): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

/** Fresh stores per test — factory reset ⇒ new seeded InMemory repositories. */
export function freshStores(): AgentStores {
  __resetRepositoriesForTests();
  return agentStores();
}

export function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    sourceType: "entity",
    sourceId: "l-1",
    title: "ליד: בדיקה",
    relevantExcerpt: "רשומת בדיקה",
    relevanceMethod: "בדיקה",
    verified: true,
    lastUpdated: "2026-07-20T08:00:00.000Z",
    ...overrides,
  };
}

let envelopeSeq = 0;

export function makeEnvelope(overrides: Partial<AIResponseEnvelopeV2> = {}): AIResponseEnvelopeV2 {
  envelopeSeq += 1;
  return {
    id: `fake-env-${envelopeSeq}`,
    requestId: `fake-req-${envelopeSeq}`,
    correlationId: `fake-corr-${envelopeSeq}`,
    provider: "fake",
    model: null,
    createdAt: "2026-07-23T08:00:00.000Z",
    operation: "summarize.weekly-leads",
    recommendation: "תוצאה דטרמיניסטית לצורכי בדיקה",
    reason: "נבנתה על ידי ספק מדומה בבדיקות",
    evidence: [makeEvidence()],
    confidence: unavailableConfidence("בדיקה"),
    nextStep: "אין",
    limitations: ["ספק מדומה"],
    approval: { required: false, state: "not_required" },
    usage: { measured: false },
    status: "הצלחה",
    ...overrides,
  };
}

export type FakeBehavior = (req: AIRequest, callIndex: number) => AIResponseEnvelopeV2;

/** Minimal AIProvider whose 4 operations run the injected behavior. */
export function makeFakeProvider(behavior: FakeBehavior): AIProvider & { calls: number } {
  const provider = {
    id: "fake",
    displayName: "ספק מדומה לבדיקות",
    calls: 0,
    health(): Promise<AIProviderHealth> {
      return Promise.resolve({ state: "מחובר", checkedAt: "2026-07-23T08:00:00.000Z", detail: "" });
    },
    capabilities(): Promise<AICapabilities> {
      return Promise.resolve({
        operations: ["summarize", "classify", "recommend", "explain"],
        streaming: false,
        structuredOutput: false,
        detail: "",
      });
    },
    run(req: AIRequest): Promise<AIResponseEnvelopeV2> {
      provider.calls += 1;
      try {
        return Promise.resolve(behavior(req, provider.calls));
      } catch (err) {
        return Promise.reject(err as Error);
      }
    },
    summarize(req: AIRequest) {
      return provider.run(req);
    },
    classify(req: AIRequest) {
      return provider.run(req);
    },
    recommend(req: AIRequest) {
      return provider.run(req);
    },
    explain(req: AIRequest) {
      return provider.run(req);
    },
    generateStructured<T>(req: AIRequest, schema: z.ZodType<T>): Promise<AIProviderResult<T>> {
      return provider.run(req).then((envelope) => {
        const parsed = schema.safeParse({});
        if (!parsed.success) throw new AIError("AI_RESPONSE_INVALID");
        return { value: parsed.data, envelope };
      });
    },
    async *stream(req: AIRequest): AsyncIterable<AIStreamEvent> {
      const envelope = await provider.run(req);
      yield { type: "done", envelope };
    },
  };
  return provider;
}

/** Mode-A registry serving the given provider as the local engine. */
export function makeRegistry(provider: AIProvider): ProviderRegistry {
  return new ProviderRegistry(
    { remoteEnabled: false, localFallbackPermitted: true },
    { remote: provider, local: provider },
  );
}
