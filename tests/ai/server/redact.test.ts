// W5-B redact.ts — secret patterns never survive into log output.
import { describe, expect, it } from "vitest";
import { redact, redactValue, REDACTED, serverLog } from "@/server/redact";
import { CaptureSink } from "./helpers";

describe("redact", () => {
  it("masks sk-style keys", () => {
    const line = redact("using key sk-FAKE1234567890abcdef for the call");
    expect(line).not.toContain("sk-FAKE1234567890abcdef");
    expect(line).toContain(REDACTED);
  });

  it("masks bearer tokens", () => {
    const line = redact("authorization: Bearer abc123def456ghi789");
    expect(line).not.toContain("abc123def456ghi789");
  });

  it("masks key=value shapes but keeps the key name", () => {
    const line = redact('api_key="super-fake-value-123"');
    expect(line).toContain("api_key");
    expect(line).not.toContain("super-fake-value-123");
  });

  it("masks JWT-shaped tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.fakefakesig";
    expect(redact(`token ${jwt} here`)).not.toContain(jwt);
  });

  it("leaves normal Hebrew/English text untouched", () => {
    const text = "סיכום לידים שבועי — 3 לידים חדשים";
    expect(redact(text)).toBe(text);
  });
});

describe("redactValue", () => {
  it("deep-redacts nested objects and masks secret-named keys entirely", () => {
    const out = redactValue({
      nested: { apiKey: "plain-value", note: "uses sk-FAKEDEEPKEY123456" },
      list: ["Bearer faketoken1234567890"],
    }) as { nested: { apiKey: string; note: string }; list: string[] };
    expect(out.nested.apiKey).toBe(REDACTED);
    expect(out.nested.note).not.toContain("sk-FAKEDEEPKEY123456");
    expect(out.list[0]).not.toContain("faketoken1234567890");
  });
});

describe("serverLog", () => {
  it('the fake key pattern "sk-FAKE..." NEVER appears in emitted log output', () => {
    const sink = new CaptureSink();
    serverLog(
      "error",
      "provider.call",
      { detail: "failed with key sk-FAKEKEY9876543210", apiKey: "sk-FAKEKEY9876543210" },
      sink,
    );
    expect(sink.lines).toHaveLength(1);
    for (const line of sink.lines) {
      expect(line).not.toContain("sk-FAKEKEY9876543210");
    }
  });
});
