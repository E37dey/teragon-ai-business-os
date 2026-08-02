// TERAGON Business Graph — Phase 7 capability registry + policy tests.
// Proves every query has a capability entry with structured data-gaps, and that
// the calendar-day cutoff policy is deterministic and recorded on the result.
import { describe, expect, it } from "vitest";
import {
  BUSINESS_QUERY_CAPABILITIES,
  BUSINESS_QUERY_NAMES,
  DEFAULT_THRESHOLD_DAYS,
  evaluateStructuralReadiness,
  resolvePolicy,
  subtractCalendarDays,
} from "@/graph";

describe("capability registry", () => {
  it("has one entry per query, keyed by itself, with a baseline readiness", () => {
    for (const name of BUSINESS_QUERY_NAMES) {
      const cap = BUSINESS_QUERY_CAPABILITIES[name];
      expect(cap.query).toBe(name);
      expect(cap.traversalOps.length).toBeGreaterThan(0);
      expect(cap.descriptionHe.length).toBeGreaterThan(0);
    }
  });

  it("after Phase 9 EVERY query is structurally SUPPORTED with no remaining contract gaps", () => {
    // the four formerly-blocked queries are now lifted to structural SUPPORTED via
    // minimal additive canonical contracts + derivation + inbound traversal.
    for (const n of BUSINESS_QUERY_NAMES) {
      expect(BUSINESS_QUERY_CAPABILITIES[n].baselineReadiness).toBe("SUPPORTED");
    }
    // the four lifted queries carry NO remaining contract gap (missingFacts []).
    for (const n of [
      "findRecurringServiceIssues",
      "findDelayedEnrollments",
      "assessPrinterModelSupportImpact",
      "findTasksFromApprovedRecommendations",
    ] as const) {
      expect(BUSINESS_QUERY_CAPABILITIES[n].missingFacts).toHaveLength(0);
    }
  });

  it("structural readiness is evaluated against the CONTRACTS/registry (not fixtures)", () => {
    // every required entity is a graph-eligible node type and every required
    // relationship is a registered edge ⇒ structurally SUPPORTED for all 9.
    for (const n of BUSINESS_QUERY_NAMES) {
      expect(evaluateStructuralReadiness(BUSINESS_QUERY_CAPABILITIES[n])).toBe("SUPPORTED");
    }
    // a capability requiring an UNregistered relationship is UNSUPPORTED — proving
    // the check reads the registry, not whether a fixture happens to hold an edge.
    const bogus = {
      ...BUSINESS_QUERY_CAPABILITIES.findRecurringServiceIssues,
      requiredRelationships: ["__NOT_A_REGISTERED_RELATIONSHIP__"] as unknown as (typeof BUSINESS_QUERY_CAPABILITIES.findRecurringServiceIssues)["requiredRelationships"],
    };
    expect(evaluateStructuralReadiness(bogus)).toBe("UNSUPPORTED");
  });
});

describe("deterministic calendar-day cutoff policy", () => {
  it("subtracts calendar days deterministically", () => {
    expect(subtractCalendarDays("2026-07-30T00:00:00.000Z", 14)).toBe("2026-07-16T00:00:00.000Z");
    expect(subtractCalendarDays("2026-07-30T00:00:00.000Z", 14)).toBe(subtractCalendarDays("2026-07-30T00:00:00.000Z", 14));
  });

  it("records the applied asOf + threshold + cutoff on the policy", () => {
    const p = resolvePolicy({ query: "findUnansweredQuotations", asOf: "2026-07-30T00:00:00.000Z", thresholdDays: undefined, policyVersion: undefined });
    expect(p.thresholdDays).toBe(DEFAULT_THRESHOLD_DAYS.findUnansweredQuotations);
    expect(p.cutoffMode).toBe("calendar-day");
    expect(p.cutoff).toBe("2026-07-16T00:00:00.000Z");
    expect(p.policyVersion).toBe("business-query-v1");
  });

  it("a query with no age threshold records a null cutoff", () => {
    const p = resolvePolicy({ query: "buildFullEvidencePath", asOf: "2026-07-30T00:00:00.000Z", thresholdDays: undefined, policyVersion: undefined });
    expect(p.thresholdDays).toBeNull();
    expect(p.cutoff).toBeNull();
  });
});
