// W5-B LLM adapters — config gate, retry policy (transient only), mapping.
// Injected fetch, obviously-fake keys, zero real network.
import { describe, expect, it, vi } from "vitest";
import { aiResponseEnvelopeV2Schema } from "@/ai/schemas/envelope";
import { parseServerConfig } from "@/server/config";
import { isServerAIError } from "@/server/errors";
import { AnthropicAdapter } from "@/server/providers/anthropicAdapter";
import { OpenAIAdapter } from "@/server/providers/openaiAdapter";
import { withTransientRetry, providerStatusError } from "@/server/providers/http";
import { buildLayeredPrompt } from "@/server/promptSecurity";
import type { AdapterInvokeInput } from "@/server/providers/types";
import { makeDto } from "./helpers";

const FAKE_KEY = "sk-FAKE-test-only-0000";

function configured(extra: Record<string, string> = {}) {
  return parseServerConfig({
    AI_PROVIDER: "anthropic",
    AI_MODEL: "model-from-env",
    AI_API_KEY: FAKE_KEY,
    AI_REMOTE_ENABLED: "true",
    AI_REQUEST_TIMEOUT_MS: "200",
    ...extra,
  });
}

function input(config = configured()): AdapterInvokeInput {
  const dto = makeDto();
  return {
    op: "summarize",
    request: dto,
    prompt: buildLayeredPrompt(dto),
    config,
    correlationId: "corr-adapter-1",
  };
}

describe("config gate — no key ⇒ AI_PROVIDER_NOT_CONFIGURED, fetch NEVER called", () => {
  it("anthropic", async () => {
    const fetchSpy = vi.fn();
    const config = parseServerConfig({ AI_PROVIDER: "anthropic", AI_REMOTE_ENABLED: "true" });
    const adapter = new AnthropicAdapter(config, fetchSpy);
    await expect(adapter.invoke(input(config))).rejects.toMatchObject({
      code: "AI_PROVIDER_NOT_CONFIGURED",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("openai", async () => {
    const fetchSpy = vi.fn();
    const config = parseServerConfig({ AI_PROVIDER: "openai", AI_REMOTE_ENABLED: "true" });
    const adapter = new OpenAIAdapter(config, fetchSpy);
    await expect(adapter.invoke(input(config))).rejects.toMatchObject({
      code: "AI_PROVIDER_NOT_CONFIGURED",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("anthropic adapter — genuine HTTP path with injected fetch", () => {
  it("success: model from env, measured usage, valid envelope", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "סיכום מהמודל" }],
            usage: { input_tokens: 12, output_tokens: 7 },
          }),
          { status: 200 },
        ),
    );
    const adapter = new AnthropicAdapter(configured(), fetchMock);
    const result = await adapter.invoke(input());
    const envelope = aiResponseEnvelopeV2Schema.parse(result.envelope);
    expect(envelope.model).toBe("model-from-env");
    expect(envelope.provider).toBe("anthropic");
    expect(envelope.usage).toMatchObject({
      measured: true,
      inputTokens: 12,
      outputTokens: 7,
      totalTokens: 19,
    });
    // request carried the env model, key in header (server-side only)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/messages");
    expect(JSON.parse(String(init.body)).model).toBe("model-from-env");
  });

  it("401 ⇒ AI_PROVIDER_AUTH_FAILED without ANY retry", async () => {
    const fetchMock = vi.fn(async () => new Response("denied", { status: 401 }));
    const adapter = new AnthropicAdapter(configured(), fetchMock);
    await expect(adapter.invoke(input())).rejects.toMatchObject({
      code: "AI_PROVIDER_AUTH_FAILED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("5xx is retried up to 2 extra times then AI_PROVIDER_UNAVAILABLE", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 503 }));
    const adapter = new AnthropicAdapter(configured(), fetchMock);
    await expect(adapter.invoke(input())).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("429 is transient: retried, and a later success wins", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return new Response("slow down", { status: 429 });
      return new Response(JSON.stringify({ content: [{ type: "text", text: "אחרי retry" }] }), {
        status: 200,
      });
    });
    const adapter = new AnthropicAdapter(configured(), fetchMock);
    const result = await adapter.invoke(input());
    const envelope = aiResponseEnvelopeV2Schema.parse(result.envelope);
    expect(envelope.recommendation).toBe("אחרי retry");
    // usage absent ⇒ honestly unmeasured, no invented zeros
    expect(envelope.usage.measured).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("hung provider ⇒ AI_PROVIDER_TIMEOUT (per-attempt timeout enforced)", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const adapter = new AnthropicAdapter(configured({ AI_REQUEST_TIMEOUT_MS: "20" }), fetchMock);
    try {
      await adapter.invoke(input(configured({ AI_REQUEST_TIMEOUT_MS: "20" })));
      expect.unreachable("should time out");
    } catch (err) {
      expect(isServerAIError(err) && err.code).toBe("AI_PROVIDER_TIMEOUT");
    }
    expect(fetchMock).toHaveBeenCalledTimes(3); // timeout is transient ⇒ retried twice
  });

  it("health without key ⇒ לא הוגדר (no network)", async () => {
    const fetchSpy = vi.fn();
    const adapter = new AnthropicAdapter(parseServerConfig({ AI_PROVIDER: "anthropic" }), fetchSpy);
    const health = await adapter.health();
    expect(health.state).toBe("לא הוגדר");
    expect(health.model).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("health live-check: 401 ⇒ שגיאת אימות, ok ⇒ מחובר", async () => {
    const denied = new AnthropicAdapter(
      configured(),
      vi.fn(async () => new Response("no", { status: 401 })),
    );
    expect((await denied.health()).state).toBe("שגיאת אימות");
    const ok = new AnthropicAdapter(
      configured(),
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    expect((await ok.health()).state).toBe("מחובר");
  });
});

describe("openai adapter — mapping parity", () => {
  it("success maps choices + usage into a valid envelope", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "תשובת מודל" } }],
            usage: { prompt_tokens: 5, completion_tokens: 4 },
          }),
          { status: 200 },
        ),
    );
    const config = parseServerConfig({
      AI_PROVIDER: "openai",
      AI_MODEL: "openai-model-from-env",
      AI_API_KEY: FAKE_KEY,
      AI_REMOTE_ENABLED: "true",
    });
    const adapter = new OpenAIAdapter(config, fetchMock);
    const result = await adapter.invoke(input(config));
    const envelope = aiResponseEnvelopeV2Schema.parse(result.envelope);
    expect(envelope.model).toBe("openai-model-from-env");
    expect(envelope.usage.totalTokens).toBe(9);
  });

  it("empty provider body ⇒ AI_RESPONSE_INVALID (never fake content)", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    const config = parseServerConfig({
      AI_PROVIDER: "openai",
      AI_MODEL: "m",
      AI_API_KEY: FAKE_KEY,
      AI_REMOTE_ENABLED: "true",
    });
    const adapter = new OpenAIAdapter(config, fetchMock);
    await expect(adapter.invoke(input(config))).rejects.toMatchObject({
      code: "AI_RESPONSE_INVALID",
    });
  });
});

describe("retry policy primitives", () => {
  it("providerStatusError maps statuses per policy", () => {
    expect(providerStatusError(401).code).toBe("AI_PROVIDER_AUTH_FAILED");
    expect(providerStatusError(403).code).toBe("AI_PROVIDER_AUTH_FAILED");
    expect(providerStatusError(429).transient).toBe(true);
    expect(providerStatusError(500).transient).toBe(true);
    expect(providerStatusError(404).code).toBe("AI_INTERNAL_ERROR");
    expect(providerStatusError(404).transient).toBe(false);
  });

  it("withTransientRetry never retries non-transient errors", async () => {
    let calls = 0;
    await expect(
      withTransientRetry(async () => {
        calls += 1;
        throw providerStatusError(401);
      }),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_AUTH_FAILED" });
    expect(calls).toBe(1);
  });
});
