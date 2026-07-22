// Stable error codes: Hebrew map completeness + AIError behavior.
import { describe, expect, it } from "vitest";
import {
  AI_ERROR_CODES,
  AI_ERROR_MESSAGES_HE,
  AIError,
  isAIError,
} from "@/ai/contracts/AIProvider";
import { aiErrorCodeDtoV1Schema } from "@/ai/contracts/serverDto";

describe("AI error codes", () => {
  it("every code has a non-empty Hebrew user message", () => {
    for (const code of AI_ERROR_CODES) {
      const msg = AI_ERROR_MESSAGES_HE[code];
      expect(msg, code).toBeTruthy();
      expect(msg.length, code).toBeGreaterThan(5);
      // Hebrew text, not an English stack trace
      expect(/[֐-׿]/u.test(msg), code).toBe(true);
    }
  });

  it("the map has exactly the 11 mandated codes — no extras, no gaps", () => {
    expect(AI_ERROR_CODES).toHaveLength(11);
    expect(Object.keys(AI_ERROR_MESSAGES_HE).sort()).toEqual([...AI_ERROR_CODES].sort());
  });

  it("the DTO error-code enum matches the client union exactly", () => {
    expect([...aiErrorCodeDtoV1Schema.options].sort()).toEqual([...AI_ERROR_CODES].sort());
  });

  it("AIError carries code, recoverable, correlationId and the Hebrew message", () => {
    const err = new AIError("AI_RATE_LIMITED", { recoverable: true, correlationId: "corr-7" });
    expect(err.code).toBe("AI_RATE_LIMITED");
    expect(err.recoverable).toBe(true);
    expect(err.correlationId).toBe("corr-7");
    expect(err.userMessageHe).toBe(AI_ERROR_MESSAGES_HE.AI_RATE_LIMITED);
    // the user-facing message must never contain a stack trace
    expect(err.userMessageHe).not.toContain("at ");
    expect(isAIError(err)).toBe(true);
    expect(isAIError(new Error("x"))).toBe(false);
  });

  it("AIError defaults: not recoverable, null correlation", () => {
    const err = new AIError("AI_INTERNAL_ERROR");
    expect(err.recoverable).toBe(false);
    expect(err.correlationId).toBeNull();
  });
});
