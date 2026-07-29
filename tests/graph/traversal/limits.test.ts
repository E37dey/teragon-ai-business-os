// TERAGON Business Graph — Phase 6 limit-resolution tests.
// A caller value may only REDUCE a limit — never raise it above the internal cap.
import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVERSAL_QUERY_LIMITS, TRAVERSAL_HARD_MAXIMA, resolveLimits } from "@/graph";

describe("resolveLimits — internal maxima, caller-reduce-only", () => {
  it("uses the defaults when nothing is supplied", () => {
    expect(resolveLimits()).toEqual(DEFAULT_TRAVERSAL_QUERY_LIMITS);
  });

  it("clamps every numeric budget DOWN to the hard cap (cannot raise above)", () => {
    const r = resolveLimits({
      maxDepth: 9999,
      maxNodes: 9_999_999,
      maxEdges: 9_999_999,
      maxPaths: 9999,
      timeoutBudgetMs: 9_999_999,
    });
    expect(r.maxDepth).toBe(TRAVERSAL_HARD_MAXIMA.maxDepth);
    expect(r.maxNodes).toBe(TRAVERSAL_HARD_MAXIMA.maxNodes);
    expect(r.maxEdges).toBe(TRAVERSAL_HARD_MAXIMA.maxEdges);
    expect(r.maxPaths).toBe(TRAVERSAL_HARD_MAXIMA.maxPaths);
    expect(r.timeoutBudgetMs).toBe(TRAVERSAL_HARD_MAXIMA.timeoutBudgetMs);
  });

  it("honors a caller value that REDUCES below the default", () => {
    const r = resolveLimits({ maxDepth: 2, maxNodes: 5 });
    expect(r.maxDepth).toBe(2);
    expect(r.maxNodes).toBe(5);
  });

  it("never lets a numeric budget exceed its cap for any input", () => {
    for (const v of [13, 100, 1e6]) {
      expect(resolveLimits({ maxDepth: v }).maxDepth).toBeLessThanOrEqual(
        TRAVERSAL_HARD_MAXIMA.maxDepth,
      );
    }
  });

  it("narrows the entity/relationship allow-lists (a strict reduction), null when absent", () => {
    expect(resolveLimits().allowedEntityTypes).toBeNull();
    expect(resolveLimits().allowedRelationshipTypes).toBeNull();
    const r = resolveLimits({
      allowedEntityTypes: ["customer"],
      allowedRelationshipTypes: ["OWNS"],
    });
    expect(r.allowedEntityTypes).toEqual(["customer"]);
    expect(r.allowedRelationshipTypes).toEqual(["OWNS"]);
  });
});
