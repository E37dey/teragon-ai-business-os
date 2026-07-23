// W5-E functional integration — Phase 5.16 flow 1:
// real seeded InMemory repositories → LocalRulesProvider (production wiring
// via repositoryDataAccess) → envelope with evidence citing REAL records →
// human approval PENDING for an outbound draft. Also pins Mode-A registry
// selection: local is PRIMARY (no fallback disclosure).
import { beforeEach, describe, expect, it } from "vitest";
import { aiResponseEnvelopeV2Schema } from "@/ai/schemas/envelope";
import {
  LocalRulesProvider,
  repositoryDataAccess,
} from "@/ai/providers/LocalRulesProvider";
import { ProviderRegistry } from "@/ai/providers/registry";
import { __resetRepositoriesForTests, getRepository } from "@/repositories";
import type { Customer, Lead } from "@/domain/types";
import type { AIRequest } from "@/ai/contracts/AIProvider";

function makeProvider(): LocalRulesProvider {
  return new LocalRulesProvider(repositoryDataAccess(), {
    now: () => "2026-07-23T10:00:00.000Z",
    idFactory: (n) => `it-env-${n}`,
  });
}

function request(operation: string, extra: Partial<AIRequest> = {}): AIRequest {
  return {
    operation,
    organizationId: "org-teragon",
    userId: "user-1",
    sessionId: "session-it",
    correlationId: "corr-it-1",
    relatedEntities: [],
    boundedContext: {},
    outputSchemaVersion: "v1",
    ...extra,
  };
}

beforeEach(() => {
  __resetRepositoriesForTests();
});

describe("flow 1 — local recommendation from a real CRM record", () => {
  it("lead record → follow-up draft envelope: evidence cites the real record, approval PENDING", async () => {
    // the record genuinely exists in the seeded repository
    const lead = await getRepository<Lead>("leads").get("l-1");
    expect(lead).toBeDefined();

    const provider = makeProvider();
    const envelope = await provider.recommend(
      request("recommend.follow-up", { relatedEntities: [{ type: "lead", id: "l-1" }] }),
    );
    // canonical, schema-valid envelope
    expect(aiResponseEnvelopeV2Schema.safeParse(envelope).success).toBe(true);
    // honesty: rules engine, no model, unmeasured usage
    expect(envelope.provider).toBe("local-rules");
    expect(envelope.model).toBeNull();
    expect(envelope.usage.measured).toBe(false);
    // evidence cites the REAL lead record
    expect(envelope.evidence.some((e) => e.sourceId === "l-1" && e.verified)).toBe(true);
    expect(envelope.recommendation).toContain(lead?.name ?? "");
    // an outbound message draft ⇒ human approval pending, never auto-sent
    expect(envelope.approval.required).toBe(true);
    expect(envelope.approval.state).toBe("pending");
  });

  it("customer record → course-fit envelope grounded in the seeded customer", async () => {
    const customer = await getRepository<Customer>("customers").get("cu-1");
    expect(customer).toBeDefined();
    const envelope = await makeProvider().recommend(
      request("recommend.course-fit", { relatedEntities: [{ type: "customer", id: "cu-1" }] }),
    );
    expect(envelope.evidence.some((e) => e.sourceId === "cu-1")).toBe(true);
    expect(envelope.limitations.length).toBeGreaterThan(0);
    expect(envelope.confidence.status).toBe("unavailable");
  });

  it("Mode-A registry serves the local engine as PRIMARY — no fallback disclosure", async () => {
    const local = makeProvider();
    const registry = new ProviderRegistry(
      { remoteEnabled: false, localFallbackPermitted: true },
      { remote: local, local },
    );
    const selection = await registry.select();
    expect(selection.provider).toBe(local);
    expect(selection.fallback).toBeNull();
    expect(selection.unavailable).toBeNull();
  });
});
