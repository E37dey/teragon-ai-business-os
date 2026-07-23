// W5-B guards.ts — size/context/output/duration limits.
import { describe, expect, it } from "vitest";
import {
  assertContextLength,
  assertRequestSize,
  capOutput,
  contextChars,
  MAX_CONTEXT_CHARS,
  MAX_REQUEST_BYTES,
  remainingDurationMs,
} from "@/server/guards";
import { isServerAIError } from "@/server/errors";

describe("assertRequestSize", () => {
  it("allows a normal body", () => {
    expect(() => assertRequestSize("{}")).not.toThrow();
  });

  it("rejects a body over 256KB with a 413-coded error", () => {
    const huge = "x".repeat(MAX_REQUEST_BYTES + 1);
    try {
      assertRequestSize(huge);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(isServerAIError(err) && err.httpStatus).toBe(413);
    }
  });
});

describe("context length", () => {
  it("measures serialized record length", () => {
    expect(contextChars({ leads: [{ id: "a" }] })).toBeGreaterThan(0);
  });

  it("rejects an oversized bounded context", () => {
    const big = { leads: [{ id: "a", blob: "y".repeat(MAX_CONTEXT_CHARS) }] };
    expect(() => assertContextLength(big)).toThrow();
  });
});

describe("capOutput", () => {
  it("discloses truncation instead of silently cutting", () => {
    expect(capOutput("short")).toEqual({ text: "short", truncated: false });
    const capped = capOutput("abcdef", 3);
    expect(capped.text).toBe("abc");
    expect(capped.truncated).toBe(true);
  });
});

describe("remainingDurationMs", () => {
  it("counts down against the budget", () => {
    expect(remainingDurationMs(0, 1_000, 25_000)).toBe(24_000);
    expect(remainingDurationMs(0, 30_000, 25_000)).toBeLessThan(0);
  });
});
