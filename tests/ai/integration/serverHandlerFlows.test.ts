// W5-E functional integration — Phase 5.16 flows 4, 7, 8 through the FULL
// server handler pipeline (createAiHandlers with injected env, AI_PROVIDER=test
// — the deterministic TestAdapter; NEVER a real key or network).
//   flow 4: remote success — request DTO → validated envelope, model echoed
//           from central env config, audit success entry
//   flow 7: cancellation — AbortSignal fired MID-stream (after the first
//           delta) → AI_REQUEST_CANCELLED event → no partial budget mutation
//   flow 8: budget reached — gate denies BEFORE the adapter, exact Hebrew
//           message, adapter never invoked, denial audited
import { describe, expect, it, vi } from "vitest";
import {
  aiEnvelopeResponseDtoV1Schema,
  aiStreamEventDtoV1Schema,
} from "@/ai/contracts/serverDto";
import { AI_ERROR_MESSAGES_HE } from "@/ai/contracts/AIProvider";
import { aiErrorResponseDtoV1Schema } from "@/ai/contracts/serverDto";
import { createAiHandlers, type HandlerDeps } from "@/server/handlers";
import { createAdapter } from "@/server/providers/registry";
import type { AdapterStreamChunk, AdapterResult, ServerAIAdapter } from "@/server/providers/types";
import type { ServerAuditEvent } from "@/server/audit";
import { CaptureSink, makeDto, postRequest, readNdjson, TEST_ENV } from "../server/helpers";

function rig(envOverrides: Record<string, string | undefined> = {}, deps: HandlerDeps = {}) {
  const audits: ServerAuditEvent[] = [];
  const h = createAiHandlers({
    env: () => ({ ...TEST_ENV, ...envOverrides }),
    logSink: new CaptureSink(),
    onAudit: (e) => audits.push(e),
    ...deps,
  });
  return { h, audits };
}

describe("flow 4 — remote success via TestAdapter through the full handler", () => {
  it("CRM-context DTO → validated envelope: model echoed from env, evidence from bounded context, success audited", async () => {
    const { h, audits } = rig({ AI_MODEL: "flow4-model-echo" });
    const dto = makeDto({
      operation: "recommend.follow-up",
      boundedContext: {
        customers: [{ id: "cu-77", name: "לקוח אינטגרציה", note: "מתעניין בקורס" }],
        leads: [{ id: "l-77", name: "ליד אינטגרציה", note: "רכישת מדפסת" }],
      },
      correlationId: "corr-flow4",
    });
    const res = await h.aiRecommend(
      postRequest("ai-recommend", dto, { "x-correlation-id": "corr-flow4" }),
    );
    expect(res.status).toBe(200);
    const body = aiEnvelopeResponseDtoV1Schema.parse(await res.json());
    // the model is the CENTRAL env config value, echoed — never hardcoded
    expect(body.envelope.model).toBe("flow4-model-echo");
    expect(body.envelope.provider).toBe("test");
    expect(body.envelope.correlationId).toBe("corr-flow4");
    // evidence cites the record ids that were actually in the bounded context
    const cited = body.envelope.evidence.map((e) => e.sourceId);
    expect(cited).toContain("cu-77");
    expect(cited).toContain("l-77");
    // audit: one success entry, correlation propagated, usage honestly unmeasured
    const success = audits.filter((a) => a.outcome === "success");
    expect(success).toHaveLength(1);
    expect(success[0]?.correlationId).toBe("corr-flow4");
    expect(success[0]?.model).toBe("flow4-model-echo");
    expect(success[0]?.usageMeasured).toBe(false);
  });
});

describe("flow 7 — cancellation: AbortSignal mid-stream", () => {
  it("abort after the first delta ⇒ AI_REQUEST_CANCELLED event, stream stops, budget NOT charged", async () => {
    const controller = new AbortController();
    // wrap the real TestAdapter: fire the abort AFTER the first delta is
    // yielded — a deterministic mid-stream cancellation (no timing races)
    const deps: HandlerDeps = {
      adapterFactory: (config, adapterDeps) => {
        const real = createAdapter(config, adapterDeps);
        if (real === null) return null;
        const wrapped: ServerAIAdapter = {
          id: real.id,
          health: (s) => real.health(s),
          invoke: (input) => real.invoke(input),
          streamDeltas: async function* (
            input,
          ): AsyncGenerator<AdapterStreamChunk, AdapterResult, void> {
            const gen = real.streamDeltas(input);
            const first = await gen.next();
            if (!first.done) {
              // fire the abort as the first delta is produced: the handler
              // still emits this delta, then observes the aborted signal
              // before pulling the next one — a true mid-stream cancellation
              controller.abort();
              yield first.value;
            }
            for (;;) {
              const step = await gen.next();
              if (step.done) return step.value;
              yield step.value;
            }
          },
        };
        return wrapped;
      },
    };
    // budget of 1 unit lets us PROVE the cancelled stream never charged it
    const { h, audits } = rig({ AI_DAILY_BUDGET: "1" }, deps);
    const req = new Request("https://teragon.example/.netlify/functions/ai-stream", {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": "corr-flow7" },
      body: JSON.stringify(makeDto()),
      signal: controller.signal,
    });
    const res = await h.aiStream(req);
    const events = (await readNdjson(res)).map((e) => aiStreamEventDtoV1Schema.parse(e));
    // start → exactly one delta → cancellation error; nothing after
    expect(events[0]?.type).toBe("start");
    expect(events.filter((e) => e.type === "delta")).toHaveLength(1);
    const last = events[events.length - 1];
    expect(last?.type).toBe("error");
    if (last?.type === "error") {
      expect(last.code).toBe("AI_REQUEST_CANCELLED");
      expect(last.messageHe).toBe(AI_ERROR_MESSAGES_HE.AI_REQUEST_CANCELLED);
    }
    // no done event ⇒ no envelope was committed
    expect(events.some((e) => e.type === "done")).toBe(false);
    // the cancellation was audited as an error outcome
    const errAudit = audits.find((a) => a.errorCode === "AI_REQUEST_CANCELLED");
    expect(errAudit).toBeDefined();
    // NO PARTIAL MUTATION: the 1-unit budget was never charged — a normal
    // request afterwards still succeeds
    const after = await h.aiSummarize(postRequest("ai-summarize", makeDto()));
    expect(after.status).toBe(200);
  });
});

describe("flow 8 — budget reached: gate denies BEFORE the adapter", () => {
  it("denial carries the exact Hebrew message; adapter NOT invoked; audited", async () => {
    const invokeSpy = vi.fn();
    const deps: HandlerDeps = {
      adapterFactory: (config, adapterDeps) => {
        const real = createAdapter(config, adapterDeps);
        if (real === null) return null;
        return {
          id: real.id,
          health: (s) => real.health(s),
          invoke: (input) => {
            invokeSpy();
            return real.invoke(input);
          },
          streamDeltas: (input) => real.streamDeltas(input),
        };
      },
    };
    const { h, audits } = rig({ AI_DAILY_BUDGET: "1" }, deps);
    // spend the single unit
    expect((await h.aiSummarize(postRequest("ai-summarize", makeDto()))).status).toBe(200);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    // the denied request
    const res = await h.aiSummarize(postRequest("ai-summarize", makeDto()));
    expect(res.status).toBe(429);
    const body = aiErrorResponseDtoV1Schema.parse(await res.json());
    expect(body.error.code).toBe("AI_DAILY_BUDGET_EXCEEDED");
    // the EXACT Hebrew user message
    expect(body.error.messageHe).toBe("תקציב ה-AI היומי מוצה. הבקשות ייחסמו עד לאיפוס התקציב.");
    expect(res.headers.get("retry-after")).toBe("60");
    // the adapter was never reached for the denied request
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    // the denial is audited
    expect(audits.some((a) => a.errorCode === "AI_DAILY_BUDGET_EXCEEDED")).toBe(true);
  });
});
