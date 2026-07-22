// W5-B config.ts — typed env parsing: missing ⇒ honest nulls, never throws.
import { describe, expect, it } from "vitest";
import { isProviderConfigured, parseServerConfig, SERVER_CONFIG_DEFAULTS } from "@/server/config";

describe("parseServerConfig", () => {
  it("empty env ⇒ null provider, defaults, remote disabled — never throws", () => {
    const config = parseServerConfig({});
    expect(config.provider).toBeNull();
    expect(config.model).toBeNull();
    expect(config.apiKey).toBeNull();
    expect(config.baseUrl).toBeNull();
    expect(config.remoteEnabled).toBe(false);
    expect(config.requestTimeoutMs).toBe(SERVER_CONFIG_DEFAULTS.requestTimeoutMs);
    expect(config.rateLimitPerMinute).toBe(SERVER_CONFIG_DEFAULTS.rateLimitPerMinute);
    expect(config.maxConcurrentRequests).toBe(SERVER_CONFIG_DEFAULTS.maxConcurrentRequests);
    expect(config.dailyBudget).toBe(0);
  });

  it("unknown provider name degrades to null (not a crash)", () => {
    expect(parseServerConfig({ AI_PROVIDER: "skynet" }).provider).toBeNull();
  });

  it("parses a full valid env", () => {
    const config = parseServerConfig({
      AI_PROVIDER: "anthropic",
      AI_MODEL: "some-model-from-env",
      AI_API_KEY: "sk-FAKE-not-a-real-key",
      AI_BASE_URL: "https://gw.example",
      AI_REQUEST_TIMEOUT_MS: "5000",
      AI_MAX_OUTPUT_TOKENS: "512",
      AI_DAILY_BUDGET: "100",
      AI_RATE_LIMIT_PER_MINUTE: "3",
      AI_MAX_CONCURRENT_REQUESTS: "2",
      AI_REMOTE_ENABLED: "true",
    });
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("some-model-from-env");
    expect(config.requestTimeoutMs).toBe(5000);
    expect(config.dailyBudget).toBe(100);
    expect(config.remoteEnabled).toBe(true);
  });

  it("malformed numbers fall back to defaults instead of throwing", () => {
    const config = parseServerConfig({
      AI_REQUEST_TIMEOUT_MS: "not-a-number",
      AI_RATE_LIMIT_PER_MINUTE: "-5",
      AI_DAILY_BUDGET: "NaN",
    });
    expect(config.requestTimeoutMs).toBe(SERVER_CONFIG_DEFAULTS.requestTimeoutMs);
    expect(config.rateLimitPerMinute).toBe(SERVER_CONFIG_DEFAULTS.rateLimitPerMinute);
    expect(config.dailyBudget).toBe(0);
  });
});

describe("isProviderConfigured", () => {
  it("test provider needs no key but must be explicit", () => {
    expect(isProviderConfigured(parseServerConfig({ AI_PROVIDER: "test" }))).toBe(true);
    expect(isProviderConfigured(parseServerConfig({}))).toBe(false);
  });

  it("real providers require both model and key", () => {
    expect(isProviderConfigured(parseServerConfig({ AI_PROVIDER: "anthropic" }))).toBe(false);
    expect(
      isProviderConfigured(
        parseServerConfig({ AI_PROVIDER: "anthropic", AI_MODEL: "m", AI_API_KEY: "sk-FAKE" }),
      ),
    ).toBe(true);
  });
});
