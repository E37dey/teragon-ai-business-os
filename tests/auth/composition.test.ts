// Gate S8.0 — composition selector: LOCAL default, SUPABASE opt-in, no fallback.
import { describe, expect, it } from "vitest";
import { createAuthBoundary, resolveAuthMode } from "@/auth/composition";
import { LocalAuthProvider } from "@/auth/LocalAuthProvider";
import { SupabaseAuthProvider } from "@/auth/SupabaseAuthProvider";

describe("resolveAuthMode", () => {
  it("defaults to LOCAL when unset / unknown", () => {
    expect(resolveAuthMode(null)).toBe("LOCAL");
    expect(resolveAuthMode("")).toBe("LOCAL");
    expect(resolveAuthMode("nonsense")).toBe("LOCAL");
    expect(resolveAuthMode("supabase")).toBe("LOCAL"); // case-sensitive, fail-safe
  });
  it("is SUPABASE only for the exact opt-in value", () => {
    expect(resolveAuthMode("SUPABASE")).toBe("SUPABASE");
  });
});

describe("createAuthBoundary", () => {
  it("returns the local provider by default", () => {
    expect(createAuthBoundary(null)).toBeInstanceOf(LocalAuthProvider);
  });
  it("returns the Supabase provider (never a silent local fallback) when opted in", () => {
    const boundary = createAuthBoundary("SUPABASE");
    expect(boundary).toBeInstanceOf(SupabaseAuthProvider);
    expect(boundary.mode).toBe("SUPABASE");
  });
});
