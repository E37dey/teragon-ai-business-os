// W5-E functional integration — Phase 5.16 flow 5:
// remote failure → registry fallback → LOCAL envelope + the mandatory Hebrew
// disclosure object. The remote provider here is a RemoteAIProvider whose
// injected fetch fails (network down) — no real key, no network.
// NOTE (honest finding, see docs/integration-requests-w5e.md): the registry
// itself has no audit hook — fallback is disclosed as DATA to the caller;
// audit trails exist at the handler and agent-engine layers. An engine-level
// fallback audit event is requested, not faked here.
import { beforeEach, describe, expect, it } from "vitest";
import {
  LocalRulesProvider,
  repositoryDataAccess,
} from "@/ai/providers/LocalRulesProvider";
import { ProviderRegistry, FALLBACK_MESSAGE_HE } from "@/ai/providers/registry";
import { RemoteAIProvider } from "@/ai/providers/RemoteAIProvider";
import { __resetRepositoriesForTests } from "@/repositories";
import { AgentOrchestrator } from "@/agents/orchestrator";
import { agentStores } from "@/repositories/agentStores";

function failingRemote(): RemoteAIProvider {
  return new RemoteAIProvider({
    fetchImpl: () => Promise.reject(new TypeError("network down (test)")),
  });
}

function localProvider(): LocalRulesProvider {
  return new LocalRulesProvider(repositoryDataAccess(), {
    now: () => "2026-07-23T10:00:00.000Z",
    idFactory: (n) => `fb-env-${n}`,
  });
}

beforeEach(() => {
  __resetRepositoriesForTests();
});

describe("flow 5 — remote failure → disclosed local fallback", () => {
  it("select() serves the local engine WITH the exact Hebrew disclosure", async () => {
    const local = localProvider();
    const registry = new ProviderRegistry(
      { remoteEnabled: true, localFallbackPermitted: true },
      { remote: failingRemote(), local },
    );
    const selection = await registry.select();
    // the local engine serves
    expect(selection.provider).toBe(local);
    // the fallback is NEVER silent — disclosure object with the exact sentence
    expect(selection.fallback).not.toBeNull();
    expect(selection.fallback?.from).toBe("remote");
    expect(selection.fallback?.messageHe).toBe(FALLBACK_MESSAGE_HE);
    expect(selection.fallback?.messageHe).toBe(
      "הספק המרוחק אינו זמין. המערכת עברה למנוע המקומי מבוסס הכללים.",
    );
    // remote health honestly reflects the failure — never "מחובר"
    expect(selection.remoteHealth?.state).not.toBe("מחובר");
    expect(selection.unavailable).toBeNull();
  });

  it("the fallback provider produces an honest LOCAL envelope", async () => {
    const registry = new ProviderRegistry(
      { remoteEnabled: true, localFallbackPermitted: true },
      { remote: failingRemote(), local: localProvider() },
    );
    const selection = await registry.select();
    const envelope = await selection.provider?.summarize({
      operation: "summarize.weekly-leads",
      organizationId: "org-teragon",
      userId: "user-1",
      sessionId: "session-fb",
      correlationId: "corr-fb-1",
      relatedEntities: [],
      boundedContext: {},
      outputSchemaVersion: "v1",
    });
    expect(envelope?.provider).toBe("local-rules");
    expect(envelope?.model).toBeNull();
    expect(envelope?.usage.measured).toBe(false);
  });

  it("no fallback permitted ⇒ structured unavailable, provider null (no fake success)", async () => {
    const registry = new ProviderRegistry(
      { remoteEnabled: true, localFallbackPermitted: false },
      { remote: failingRemote(), local: localProvider() },
    );
    const selection = await registry.select();
    expect(selection.provider).toBeNull();
    expect(selection.unavailable).not.toBeNull();
    expect(selection.unavailable?.messageHe.length).toBeGreaterThan(0);
  });

  it("an orchestrated agent run completes on the fallback engine and its record trail is honest", async () => {
    const stores = agentStores();
    const registry = new ProviderRegistry(
      { remoteEnabled: true, localFallbackPermitted: true },
      { remote: failingRemote(), local: localProvider() },
    );
    const orchestrator = new AgentOrchestrator({ stores, registry });
    const result = await orchestrator.startRun({
      goal: "סיכום לידים שבועי במצב נפילת ספק מרוחק",
      requestedById: "u-tzachi",
      runId: "it-fb-run-1",
    });
    expect(result.run.status).toBe("הושלם");
    // every envelope in the run came from the LOCAL engine — audited records
    const events = (await stores.events.list()).filter((e) => e.runId === "it-fb-run-1");
    const completed = events.filter((e) => e.event.type === "SpecialistTaskCompleted");
    expect(completed.length).toBeGreaterThan(0);
    for (const e of completed) {
      if (e.event.type === "SpecialistTaskCompleted") {
        expect(e.event.envelope.provider).toBe("local-rules");
      }
    }
  });
});
