// W5-E security gap-fill — duplicate requests (Phase 5.15 "duplicate request").
// HONEST FINDING, tested as documented behavior: the AI server layer has NO
// idempotency/dedup mechanism — two byte-identical requests are processed
// independently (each consumes rate-limit + budget units and each is audited).
// Dedup exists one layer up where mutation happens: the agent demo scenario is
// idempotent by stable run id (tests/agents/demoScenario.test.ts), and every
// mutation is behind the HITL approval engine (double execution blocked —
// tests/agents/approvalEngine.test.ts). This file pins the server behavior so
// a future dedup layer is a conscious, tested change.
import { describe, expect, it } from "vitest";
import { aiEnvelopeResponseDtoV1Schema } from "@/ai/contracts/serverDto";
import { createAiHandlers } from "@/server/handlers";
import type { ServerAuditEvent } from "@/server/audit";
import { CaptureSink, makeDto, postRequest, TEST_ENV } from "../server/helpers";

describe("duplicate request behavior — documented, not hidden", () => {
  it("two identical requests (same correlationId) both process and are BOTH audited", async () => {
    const audits: ServerAuditEvent[] = [];
    const h = createAiHandlers({
      env: () => TEST_ENV,
      logSink: new CaptureSink(),
      onAudit: (e) => audits.push(e),
    });
    const dto = makeDto();
    const res1 = await h.aiSummarize(postRequest("ai-summarize", dto));
    const res2 = await h.aiSummarize(postRequest("ai-summarize", dto));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const b1 = aiEnvelopeResponseDtoV1Schema.parse(await res1.json());
    const b2 = aiEnvelopeResponseDtoV1Schema.parse(await res2.json());
    // deterministic adapter ⇒ identical payload content — NOT a cached reply:
    // both invocations ran, both were audited separately.
    expect(b1.envelope.correlationId).toBe(b2.envelope.correlationId);
    expect(audits.filter((a) => a.outcome === "success")).toHaveLength(2);
  });

  it("duplicates consume budget units — a duplicate can exhaust the daily budget", async () => {
    const h = createAiHandlers({
      env: () => ({ ...TEST_ENV, AI_DAILY_BUDGET: "2" }),
      logSink: new CaptureSink(),
    });
    const dto = makeDto();
    expect((await h.aiSummarize(postRequest("ai-summarize", dto))).status).toBe(200);
    expect((await h.aiSummarize(postRequest("ai-summarize", dto))).status).toBe(200);
    // third identical request: budget (2 unmeasured units) is spent
    expect((await h.aiSummarize(postRequest("ai-summarize", dto))).status).toBe(429);
  });

  it("duplicates count against the rate limit (no dedup shortcut)", async () => {
    const h = createAiHandlers({
      env: () => ({ ...TEST_ENV, AI_RATE_LIMIT_PER_MINUTE: "2" }),
      logSink: new CaptureSink(),
    });
    const dto = makeDto();
    await h.aiSummarize(postRequest("ai-summarize", dto));
    await h.aiSummarize(postRequest("ai-summarize", dto));
    expect((await h.aiSummarize(postRequest("ai-summarize", dto))).status).toBe(429);
  });
});
