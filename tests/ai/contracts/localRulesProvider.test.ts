// LocalRulesProvider: determinism, real-record evidence, valid envelopes on
// every op, approval on mutating/sending ops, structured output, streaming.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiResponseEnvelopeV2Schema } from "@/ai/schemas/envelope";
import { AIError } from "@/ai/contracts/AIProvider";
import type { AIStreamEvent } from "@/ai/contracts/AIProvider";
import {
  LOCAL_RULES_DISPLAY_NAME,
  LOCAL_RULES_PROVIDER_ID,
  LocalRulesProvider,
} from "@/ai/providers/LocalRulesProvider";
import { AI_RECOMMENDATIONS, FIXED_NOW, LEADS, makeDataAccess, makeRequest } from "./fixtures";

function makeProvider(): LocalRulesProvider {
  return new LocalRulesProvider(makeDataAccess(), {
    now: () => FIXED_NOW,
    idFactory: (n) => `test-env-${n}`,
  });
}

describe("identity + health + capabilities", () => {
  it('is honestly labeled "מנוע מקומי מבוסס כללים" and never fakes a model', async () => {
    const p = makeProvider();
    expect(p.id).toBe(LOCAL_RULES_PROVIDER_ID);
    expect(p.displayName).toBe(LOCAL_RULES_DISPLAY_NAME);
    const env = await p.summarize(makeRequest("summarize.weekly-leads"));
    expect(env.provider).toBe("local-rules");
    expect(env.model).toBeNull();
  });

  it("health is local (no network) and capabilities list all four op kinds", async () => {
    const p = makeProvider();
    const health = await p.health();
    expect(health.state).toBe("מחובר");
    expect(health.checkedAt).toBe(FIXED_NOW);
    const caps = await p.capabilities();
    expect(caps.operations.sort()).toEqual(["classify", "explain", "recommend", "summarize"]);
    expect(caps.streaming).toBe(true);
    expect(caps.structuredOutput).toBe(true);
  });
});

describe("determinism", () => {
  it("same input ⇒ byte-identical envelope (clock + ids injected)", async () => {
    const req = () =>
      makeRequest("classify.lead-intent", { relatedEntities: [{ type: "lead", id: "lead-1" }] });
    const a = await makeProvider().classify(req());
    const b = await makeProvider().classify(req());
    expect(a).toEqual(b);
  });

  it("same provider instance, repeated call ⇒ identical minus the id sequence", async () => {
    const p = makeProvider();
    const req = () => makeRequest("summarize.weekly-leads");
    const a = await p.summarize(req());
    const b = await p.summarize(req());
    const strip = (e: typeof a) => ({
      ...e,
      id: "",
      requestId: "",
      correlationId: "",
    });
    expect(strip(a)).toEqual(strip(b));
  });
});

describe("all operations return valid, honest envelopes", () => {
  const cases: {
    op: string;
    call: "summarize" | "classify" | "recommend" | "explain";
    extra?: Parameters<typeof makeRequest>[1];
  }[] = [
    { op: "summarize.weekly-leads", call: "summarize" },
    { op: "summarize.meetings", call: "summarize" },
    { op: "summarize.monthly-activity", call: "summarize" },
    {
      op: "classify.lead-intent",
      call: "classify",
      extra: { relatedEntities: [{ type: "lead", id: "lead-1" }] },
    },
    {
      op: "recommend.printer-match",
      call: "recommend",
      extra: {
        params: { useCase: "לימודים", materials: ["PLA"], buildVolume: "קטן", budget: 3000 },
      },
    },
    {
      op: "recommend.follow-up",
      call: "recommend",
      extra: { relatedEntities: [{ type: "lead", id: "lead-1" }] },
    },
    {
      op: "recommend.course-fit",
      call: "recommend",
      extra: { relatedEntities: [{ type: "customer", id: "cu-1" }] },
    },
    {
      op: "explain.recommendation",
      call: "explain",
      extra: { relatedEntities: [{ type: "aiRecommendation", id: "rec-1" }] },
    },
  ];

  for (const c of cases) {
    it(`${c.op} — schema-valid, unmeasured usage, non-empty limitations, honest confidence`, async () => {
      const p = makeProvider();
      const env = await p[c.call](makeRequest(c.op, c.extra ?? {}));
      const parsed = aiResponseEnvelopeV2Schema.safeParse(env);
      expect(parsed.success, JSON.stringify(parsed.success ? "" : parsed.error.issues)).toBe(true);
      expect(env.operation).toBe(c.op);
      expect(env.limitations.length).toBeGreaterThan(0);
      expect(env.usage.measured).toBe(false);
      expect(env.usage.totalTokens).toBeUndefined(); // absent ≠ zero
      expect(env.confidence.status).toBe("unavailable"); // never an invented number
      expect(env.confidence.value).toBeUndefined();
      expect(env.reason.length).toBeGreaterThan(0);
    });
  }
});

describe("evidence cites real records", () => {
  it("weekly-leads evidence sourceIds are actual lead ids in the window", async () => {
    const env = await makeProvider().summarize(makeRequest("summarize.weekly-leads"));
    expect(env.evidence.length).toBeGreaterThan(0);
    const leadIds = new Set(LEADS.map((l) => l.id));
    for (const ev of env.evidence) {
      expect(leadIds.has(ev.sourceId)).toBe(true);
      expect(ev.verified).toBe(true);
    }
    // the old lead is OUTSIDE the 7-day window — must not be cited
    expect(env.evidence.some((ev) => ev.sourceId === "lead-old")).toBe(false);
    expect(env.recommendation).toContain("2 לידים");
  });

  it("explain cites the recommendation record AND its linked evidence records", async () => {
    const env = await makeProvider().explain(
      makeRequest("explain.recommendation", {
        relatedEntities: [{ type: "aiRecommendation", id: "rec-1" }],
      }),
    );
    const ids = env.evidence.map((e) => e.sourceId);
    expect(ids).toContain("rec-1");
    expect(ids).toContain("ev-1");
    expect(env.nextStep).toBe(AI_RECOMMENDATIONS[0]?.nextAction);
  });

  it("classify on a missing lead ⇒ structured AI_EVIDENCE_REQUIRED (no fake output)", async () => {
    const p = makeProvider();
    await expect(
      p.classify(
        makeRequest("classify.lead-intent", {
          relatedEntities: [{ type: "lead", id: "lead-404" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "AI_EVIDENCE_REQUIRED" });
  });
});

describe("approval on mutating/sending operations", () => {
  it("follow-up draft (an outgoing message) REQUIRES human approval", async () => {
    const env = await makeProvider().recommend(
      makeRequest("recommend.follow-up", { relatedEntities: [{ type: "lead", id: "lead-1" }] }),
    );
    expect(env.approval.required).toBe(true);
    expect(env.approval.state).toBe("pending");
    expect(env.approval.requestedAt).toBe(FIXED_NOW);
  });

  it("read-only summarize does NOT require approval", async () => {
    const env = await makeProvider().summarize(makeRequest("summarize.weekly-leads"));
    expect(env.approval).toEqual({ required: false, state: "not_required" });
  });
});

describe("rule outcomes", () => {
  it("classifies lead-1 as course intent with high urgency (keyword rules)", async () => {
    const env = await makeProvider().classify(
      makeRequest("classify.lead-intent", { relatedEntities: [{ type: "lead", id: "lead-1" }] }),
    );
    expect(env.recommendation).toContain("לימודים והדרכה");
    expect(env.recommendation).toContain("גבוהה");
  });

  it("printer-match respects budget: Prusa Mini wins for a 3,000₪ study budget", async () => {
    const env = await makeProvider().recommend(
      makeRequest("recommend.printer-match", {
        params: { useCase: "לימודים", materials: ["PLA"], buildVolume: "קטן", budget: 3000 },
      }),
    );
    expect(env.recommendation).toContain("Prusa Mini");
  });

  it("course-fit skips courses the customer already took", async () => {
    const env = await makeProvider().recommend(
      makeRequest("recommend.course-fit", { relatedEntities: [{ type: "customer", id: "cu-1" }] }),
    );
    expect(env.recommendation).toContain("Fusion 360 מתקדם");
    expect(env.recommendation).not.toContain("«מבוא להדפסת תלת-ממד»");
  });

  it("printer-match without params ⇒ AI_EVIDENCE_REQUIRED", async () => {
    await expect(
      makeProvider().recommend(makeRequest("recommend.printer-match")),
    ).rejects.toMatchObject({ code: "AI_EVIDENCE_REQUIRED" });
  });

  it("wrong op kind for the method ⇒ structured internal error", async () => {
    await expect(
      makeProvider().summarize(makeRequest("recommend.follow-up")),
    ).rejects.toBeInstanceOf(AIError);
  });
});

describe("generateStructured", () => {
  it("returns a schema-validated value + the full envelope", async () => {
    const schema = z.object({
      matches: z.array(
        z.object({
          modelId: z.string(),
          modelName: z.string(),
          score: z.number(),
          suitability: z.array(z.string()),
          limitations: z.array(z.string()),
          overBudget: z.boolean(),
        }),
      ),
    });
    const { value, envelope } = await makeProvider().generateStructured(
      makeRequest("recommend.printer-match", {
        params: { useCase: "לימודים", materials: ["PLA"], buildVolume: "קטן", budget: 3000 },
      }),
      schema,
    );
    expect(value.matches[0]?.modelName).toBe("Prusa Mini");
    expect(aiResponseEnvelopeV2Schema.safeParse(envelope).success).toBe(true);
  });

  it("caller schema mismatch ⇒ AI_RESPONSE_INVALID (recoverable)", async () => {
    await expect(
      makeProvider().generateStructured(
        makeRequest("summarize.weekly-leads"),
        z.object({ somethingElse: z.string() }),
      ),
    ).rejects.toMatchObject({ code: "AI_RESPONSE_INVALID", recoverable: true });
  });
});

describe("streaming", () => {
  it("yields start → deltas (concatenating to the recommendation) → done", async () => {
    const p = makeProvider();
    const events: AIStreamEvent[] = [];
    for await (const ev of p.stream(makeRequest("summarize.weekly-leads"))) events.push(ev);
    expect(events[0]?.type).toBe("start");
    const last = events[events.length - 1];
    expect(last?.type).toBe("done");
    const text = events
      .filter((e): e is Extract<AIStreamEvent, { type: "delta" }> => e.type === "delta")
      .map((e) => e.text)
      .join("");
    if (last?.type === "done") {
      expect(text).toBe(last.envelope.recommendation);
    }
  });

  it("a failing operation streams a structured error event, not a throw", async () => {
    const p = makeProvider();
    const events: AIStreamEvent[] = [];
    for await (const ev of p.stream(makeRequest("classify.lead-intent", { relatedEntities: [] }))) {
      events.push(ev);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "AI_EVIDENCE_REQUIRED" });
  });
});
