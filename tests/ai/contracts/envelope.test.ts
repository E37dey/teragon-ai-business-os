// Envelope V2: zod round-trips, absent-usage ≠ zero, confidence honesty,
// and the V2 ⇄ Wave-1 legacy bridge.
import { describe, expect, it } from "vitest";
import {
  aiResponseEnvelopeV2Schema,
  approvalInfoSchema,
  confidenceInfoSchema,
  usageInfoSchema,
} from "@/ai/schemas/envelope";
import {
  CONFIDENCE_UNAVAILABLE_HE,
  confidenceDisplayHe,
  fromLegacyEnvelope,
  toLegacyEnvelope,
  unavailableConfidence,
} from "@/domain/ai/envelope";
import type { AIResponseEnvelope } from "@/domain/types";
import { FIXED_NOW, sampleEnvelope } from "./fixtures";

describe("aiResponseEnvelopeV2Schema", () => {
  it("round-trips a valid envelope (parse output deep-equals input)", () => {
    const env = sampleEnvelope();
    const parsed = aiResponseEnvelopeV2Schema.parse(env);
    expect(parsed).toEqual(env);
  });

  it("rejects an envelope without a reason", () => {
    const env = sampleEnvelope({ reason: "" });
    expect(aiResponseEnvelopeV2Schema.safeParse(env).success).toBe(false);
  });

  it("accepts model=null (rules engine) and a server model string", () => {
    expect(aiResponseEnvelopeV2Schema.safeParse(sampleEnvelope({ model: null })).success).toBe(
      true,
    );
    expect(aiResponseEnvelopeV2Schema.safeParse(sampleEnvelope({ model: "m" })).success).toBe(true);
  });

  it("rejects evidence citing no record id", () => {
    const env = sampleEnvelope();
    const bad = {
      ...env,
      evidence: [{ ...env.evidence[0], sourceId: "" }],
    };
    expect(aiResponseEnvelopeV2Schema.safeParse(bad).success).toBe(false);
  });
});

describe("usage — absent ≠ zero", () => {
  it("parses usage with NO token fields and keeps them absent (never 0)", () => {
    const parsed = usageInfoSchema.parse({ measured: false });
    expect(parsed.inputTokens).toBeUndefined();
    expect(parsed.outputTokens).toBeUndefined();
    expect(parsed.totalTokens).toBeUndefined();
    expect(parsed.estimatedCost).toBeUndefined();
    expect("inputTokens" in parsed && parsed.inputTokens === 0).toBe(false);
  });

  it("parses measured usage with real numbers", () => {
    const parsed = usageInfoSchema.parse({
      inputTokens: 120,
      outputTokens: 34,
      totalTokens: 154,
      estimatedCost: 0.002,
      currency: "USD",
      measured: true,
    });
    expect(parsed.totalTokens).toBe(154);
  });
});

describe("confidence honesty", () => {
  it('unavailable ⇒ renders "טרם נמדד"', () => {
    expect(confidenceDisplayHe(unavailableConfidence("ספירה"))).toBe(CONFIDENCE_UNAVAILABLE_HE);
  });

  it("estimated WITHOUT a value renders the label, never 0%", () => {
    const text = confidenceDisplayHe({
      label: "הוערך (ללא ערך מספרי)",
      method: "כללים",
      contributingSignals: [],
      status: "estimated",
    });
    expect(text).toBe("הוערך (ללא ערך מספרי)");
    expect(text).not.toContain("0%");
  });

  it("measured with a value renders NN%", () => {
    expect(
      confidenceDisplayHe({
        value: 82,
        label: "גבוה",
        method: "מדידה",
        contributingSignals: [],
        status: "measured",
      }),
    ).toBe("82%");
  });

  it("schema rejects unavailable WITH a numeric value (invented number)", () => {
    const bad = {
      value: 50,
      label: "טרם נמדד",
      method: "x",
      contributingSignals: [],
      status: "unavailable",
    };
    expect(confidenceInfoSchema.safeParse(bad).success).toBe(false);
  });

  it("schema rejects measured WITHOUT a value", () => {
    const bad = { label: "גבוה", method: "x", contributingSignals: [], status: "measured" };
    expect(confidenceInfoSchema.safeParse(bad).success).toBe(false);
  });
});

describe("approval schema", () => {
  it("rejects required=true with state=not_required", () => {
    expect(approvalInfoSchema.safeParse({ required: true, state: "not_required" }).success).toBe(
      false,
    );
  });

  it("rejects rejected without a rejectionReason", () => {
    expect(approvalInfoSchema.safeParse({ required: true, state: "rejected" }).success).toBe(false);
  });

  it("accepts a full pending approval", () => {
    expect(
      approvalInfoSchema.safeParse({
        required: true,
        state: "pending",
        requestedAt: FIXED_NOW,
      }).success,
    ).toBe(true);
  });
});

describe("legacy bridge (Wave-1 AIResponseEnvelope)", () => {
  it("toLegacyEnvelope maps every V2 field into the 7-field contract", () => {
    const v2 = sampleEnvelope({ approval: { required: true, state: "pending" } });
    const legacy = toLegacyEnvelope(v2);
    expect(legacy.result).toBe(v2.recommendation);
    expect(legacy.reason).toBe(v2.reason);
    expect(legacy.nextAction).toBe(v2.nextStep);
    expect(legacy.approvalRequired).toBe(true);
    // unavailable confidence ⇒ legacy null ⇒ "טרם נמדד" at the UI
    expect(legacy.confidenceMethod).toBeNull();
    expect(legacy.evidence).toHaveLength(1);
    expect(legacy.evidence[0]?.sourceRef).toBe("lead-1");
    expect(legacy.evidence[0]?.subjectRef).toBe(`ai-envelope:${v2.id}`);
  });

  it("fromLegacyEnvelope lifts honestly: no confidenceMethod ⇒ unavailable, usage unmeasured", () => {
    const legacy: AIResponseEnvelope<string> = {
      result: "תוצאה",
      reason: "כי",
      evidence: [],
      confidenceMethod: null,
      limitations: "מוגבל",
      nextAction: "הבא",
      approvalRequired: true,
    };
    const v2 = fromLegacyEnvelope(legacy, {
      id: "env-9",
      requestId: "req-9",
      correlationId: "corr-9",
      provider: "local-rules",
      model: null,
      createdAt: FIXED_NOW,
      operation: "recommend.follow-up",
    });
    expect(aiResponseEnvelopeV2Schema.safeParse(v2).success).toBe(true);
    expect(v2.confidence.status).toBe("unavailable");
    expect(v2.confidence.value).toBeUndefined();
    expect(v2.usage.measured).toBe(false);
    expect(v2.usage.totalTokens).toBeUndefined();
    expect(v2.approval).toEqual({ required: true, state: "pending" });
    expect(v2.limitations).toEqual(["מוגבל"]);
  });

  it("fromLegacyEnvelope keeps an existing confidenceMethod as estimated WITHOUT a number", () => {
    const legacy: AIResponseEnvelope<string> = {
      result: "r",
      reason: "כי",
      evidence: [],
      confidenceMethod: "כללי מילות מפתח",
      limitations: "",
      nextAction: "",
      approvalRequired: false,
    };
    const v2 = fromLegacyEnvelope(legacy, {
      id: "env-10",
      requestId: "req-10",
      correlationId: "corr-10",
      provider: "local-rules",
      model: null,
      createdAt: FIXED_NOW,
      operation: "classify.lead-intent",
    });
    expect(v2.confidence.status).toBe("estimated");
    expect(v2.confidence.value).toBeUndefined();
    expect(v2.confidence.method).toBe("כללי מילות מפתח");
    // limitations must never be empty after lifting
    expect(v2.limitations.length).toBeGreaterThan(0);
  });
});
