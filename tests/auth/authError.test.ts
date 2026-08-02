// Gate S8.0 — safe error classification + Hebrew messages leak nothing.
import { describe, expect, it } from "vitest";
import { classifySupabaseAuthError, safeAuthError } from "@/auth/authError";
import type { AuthErrorCategory } from "@/auth/types";

describe("classifySupabaseAuthError", () => {
  it("maps rejected credentials", () => {
    expect(classifySupabaseAuthError({ status: 400, code: "invalid_credentials" })).toBe(
      "INVALID_CREDENTIALS",
    );
  });
  it("maps fetch/network failures", () => {
    expect(classifySupabaseAuthError({ name: "AuthRetryableFetchError" })).toBe("NETWORK");
    expect(classifySupabaseAuthError({ message: "fetch failed" })).toBe("NETWORK");
  });
  it("maps expired/missing sessions", () => {
    expect(classifySupabaseAuthError({ name: "AuthSessionMissingError" })).toBe("SESSION_EXPIRED");
  });
  it("falls back to UNKNOWN", () => {
    expect(classifySupabaseAuthError({})).toBe("UNKNOWN");
    expect(classifySupabaseAuthError(null)).toBe("UNKNOWN");
  });
});

describe("safeAuthError", () => {
  const categories: AuthErrorCategory[] = [
    "INVALID_CREDENTIALS",
    "INACTIVE_ACCOUNT",
    "MISSING_MEMBERSHIP",
    "MISSING_PROFILE",
    "MALFORMED_IDENTITY",
    "NETWORK",
    "SESSION_EXPIRED",
    "NOT_CONFIGURED",
    "UNKNOWN",
  ];
  it("provides a Hebrew message for every category", () => {
    for (const c of categories) {
      const e = safeAuthError(c);
      expect(e.category).toBe(c);
      expect(e.message.length).toBeGreaterThan(0);
      // never leaks tokens/secrets/raw provider text
      expect(e.message).not.toMatch(/token|jwt|service_role|secret|password|sb_/i);
    }
  });
  it("does not disclose which credential field was wrong", () => {
    const msg = safeAuthError("INVALID_CREDENTIALS").message;
    expect(msg).not.toMatch(/סיסמה שגויה|אימייל לא קיים|user not found/i);
  });
});
