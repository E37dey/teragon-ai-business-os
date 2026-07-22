// TERAGON AI BUSINESS OS — deterministic TestAdapter (Wave 5, W5-B).
// Enabled ONLY when AI_PROVIDER=test (explicit opt-in, never a default).
// Fully controlled + deterministic: used by integration tests and to simulate
// a "remote success" path without any network or key. It labels itself
// honestly ("מתאם בדיקה") and never pretends usage/confidence were measured.
//
// Test-only failure simulation is driven by the request param "__testSimulate"
// (ONLY honored by this adapter): "timeout" | "malformed" | "slow" |
// "stream-error".
import type { AiRequestDtoV1 } from "@/ai/contracts/serverDto";
import { ServerAIError } from "../errors";
import type {
  AdapterHealth,
  AdapterInvokeInput,
  AdapterResult,
  AdapterStreamChunk,
  ServerAIAdapter,
} from "./types";

const NEVER = new Promise<never>(() => {
  /* intentionally unresolved — used to simulate a hung provider */
});

function simulateOf(request: AiRequestDtoV1): string | null {
  const v = request.params?.["__testSimulate"];
  return typeof v === "string" ? v : null;
}

function firstEvidence(request: AiRequestDtoV1): {
  sourceId: string;
  title: string;
  collection: string;
}[] {
  const items: { sourceId: string; title: string; collection: string }[] = [];
  for (const [collection, records] of Object.entries(request.boundedContext)) {
    for (const record of records) {
      const id = record["id"];
      if (typeof id === "string" && id !== "") {
        items.push({ sourceId: id, title: `${collection}/${id}`, collection });
      }
    }
  }
  return items.slice(0, 5);
}

export class TestAdapter implements ServerAIAdapter {
  readonly id = "test";
  private readonly model: string | null;
  private readonly nowIso: () => string;

  constructor(model: string | null, nowIso: () => string = () => new Date().toISOString()) {
    this.model = model;
    this.nowIso = nowIso;
  }

  health(): Promise<AdapterHealth> {
    return Promise.resolve({
      state: "מחובר",
      detail: "מתאם בדיקה דטרמיניסטי — ללא רשת וללא מפתח (AI_PROVIDER=test).",
      model: this.model,
    });
  }

  private buildEnvelope(input: AdapterInvokeInput): Record<string, unknown> {
    const { request, correlationId, op } = input;
    const evidence = firstEvidence(request).map((e) => ({
      sourceType: "entity",
      sourceId: e.sourceId,
      title: e.title,
      relevantExcerpt: `רשומת ${e.collection} מתוך ההקשר התחום של הבקשה`,
      relevanceMethod: "included-in-bounded-context",
      verified: true,
      lastUpdated: this.nowIso(),
    }));
    return {
      id: `env-${correlationId}`,
      requestId: `req-${correlationId}`,
      correlationId,
      provider: this.id,
      model: this.model,
      createdAt: this.nowIso(),
      operation: request.operation,
      recommendation: `תוצאת ${op} דטרמיניסטית של מתאם הבדיקה עבור "${request.operation}".`,
      reason: "מתאם הבדיקה מחזיר פלט קבוע וצפוי לצורכי בדיקות אינטגרציה — אין כאן מסקנה של מודל.",
      evidence,
      confidence: {
        label: "טרם נמדד",
        method: "test-adapter-static",
        contributingSignals: [],
        status: "unavailable",
      },
      nextStep: "",
      limitations: ["פלט מתאם בדיקה — דטרמיניסטי, אינו תוצר של מודל שפה."],
      approval: { required: false, state: "not_required" },
      usage: { measured: false },
      status: "הצלחה",
    };
  }

  async invoke(input: AdapterInvokeInput): Promise<AdapterResult> {
    const simulate = simulateOf(input.request);
    if (simulate === "timeout") {
      // hang until the handler's duration/timeout budget aborts the attempt
      await NEVER;
    }
    if (simulate === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    if (simulate === "malformed") {
      return { envelope: { totally: "not-an-envelope" } };
    }
    const envelope = this.buildEnvelope(input);
    if (input.op === "structured") {
      return {
        envelope,
        value: { ok: true, operation: input.request.operation, adapter: this.id },
      };
    }
    return { envelope };
  }

  async *streamDeltas(
    input: AdapterInvokeInput,
  ): AsyncGenerator<AdapterStreamChunk, AdapterResult, void> {
    const simulate = simulateOf(input.request);
    yield { type: "delta", text: "תוצאת " };
    if (simulate === "stream-error") {
      throw new ServerAIError("AI_PROVIDER_UNAVAILABLE", {
        detail: "simulated mid-stream failure",
      });
    }
    yield { type: "delta", text: "בדיקה " };
    yield { type: "delta", text: "בזרימה" };
    return { envelope: this.buildEnvelope(input) };
  }
}
