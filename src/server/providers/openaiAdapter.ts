// TERAGON AI BUSINESS OS — OpenAI-compatible server adapter (Wave 5, W5-B).
// Code-complete HTTP adapter behind the config gate: WITHOUT AI_API_KEY (or
// AI_MODEL) every call returns AI_PROVIDER_NOT_CONFIGURED — no fake success.
// The model name comes ONLY from AI_MODEL; nothing is hardcoded.
import { ServerAIError } from "../errors";
import type { ServerAIConfig } from "../config";
import { fetchWithTimeout, providerStatusError, withTransientRetry, type FetchLike } from "./http";
import { buildLlmEnvelope, layersToPromptText, type MeasuredUsage } from "./llmEnvelope";
import type {
  AdapterHealth,
  AdapterInvokeInput,
  AdapterResult,
  AdapterStreamChunk,
  ServerAIAdapter,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com";

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAIAdapter implements ServerAIAdapter {
  readonly id = "openai";
  private readonly config: ServerAIConfig;
  private readonly fetchImpl: FetchLike;
  private readonly nowIso: () => string;

  constructor(
    config: ServerAIConfig,
    fetchImpl: FetchLike = (url, init) => fetch(url, init),
    nowIso: () => string = () => new Date().toISOString(),
  ) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.nowIso = nowIso;
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private assertConfigured(): { apiKey: string; model: string } {
    const { apiKey, model } = this.config;
    if (apiKey === null || model === null) {
      throw new ServerAIError("AI_PROVIDER_NOT_CONFIGURED", {
        detail: "openai adapter requires AI_API_KEY and AI_MODEL",
      });
    }
    return { apiKey, model };
  }

  /** live check: cheap authenticated GET /v1/models — no tokens spent */
  async health(signal?: AbortSignal): Promise<AdapterHealth> {
    if (this.config.apiKey === null || this.config.model === null) {
      return { state: "לא הוגדר", detail: "חסרים AI_API_KEY או AI_MODEL בצד השרת.", model: null };
    }
    try {
      const res = await fetchWithTimeout(
        this.fetchImpl,
        `${this.baseUrl}/v1/models`,
        { method: "GET", headers: { authorization: `Bearer ${this.config.apiKey}` } },
        Math.min(this.config.requestTimeoutMs, 8_000),
        signal,
      );
      if (res.status === 401 || res.status === 403) {
        return {
          state: "שגיאת אימות",
          detail: "המפתח נדחה על ידי הספק.",
          model: this.config.model,
        };
      }
      if (!res.ok) {
        return {
          state: "לא זמין",
          detail: `הספק החזיר סטטוס ${res.status}.`,
          model: this.config.model,
        };
      }
      return {
        state: "מחובר",
        detail: "האימות מול הספק אומת בבדיקה חיה.",
        model: this.config.model,
      };
    } catch {
      return {
        state: "לא זמין",
        detail: "הספק אינו נגיש (תקלת רשת או timeout).",
        model: this.config.model,
      };
    }
  }

  async invoke(input: AdapterInvokeInput): Promise<AdapterResult> {
    const { apiKey, model } = this.assertConfigured();
    const { system, user } = layersToPromptText(input);
    const body = JSON.stringify({
      model,
      max_tokens: this.config.maxOutputTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const res = await withTransientRetry(async () => {
      const response = await fetchWithTimeout(
        this.fetchImpl,
        `${this.baseUrl}/v1/chat/completions`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body,
        },
        this.config.requestTimeoutMs,
        input.signal,
      );
      if (!response.ok) throw providerStatusError(response.status);
      return response;
    });

    let parsed: OpenAIChatResponse;
    try {
      parsed = (await res.json()) as OpenAIChatResponse;
    } catch {
      throw new ServerAIError("AI_RESPONSE_INVALID", { detail: "provider body not JSON" });
    }
    const text = parsed.choices?.[0]?.message?.content ?? "";
    if (text === "") {
      throw new ServerAIError("AI_RESPONSE_INVALID", { detail: "provider returned no text" });
    }
    const usage: MeasuredUsage | null = parsed.usage
      ? { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens }
      : null;
    const envelope = buildLlmEnvelope(input, this.id, model, text, usage, this.nowIso());
    if (input.op === "structured") {
      try {
        return { envelope, value: JSON.parse(text) as unknown };
      } catch {
        throw new ServerAIError("AI_RESPONSE_INVALID", {
          detail: "structured output was not valid JSON",
        });
      }
    }
    return { envelope };
  }

  /** non-SSE fallback streaming: ONE generation, emitted as a single delta */
  async *streamDeltas(
    input: AdapterInvokeInput,
  ): AsyncGenerator<AdapterStreamChunk, AdapterResult, void> {
    const result = await this.invoke(input);
    const rec = (result.envelope as { recommendation?: unknown }).recommendation;
    yield { type: "delta", text: typeof rec === "string" ? rec : "" };
    return result;
  }
}
