// TERAGON Business Graph — Phase 7 capability registry + policy tests.
// Proves every query has a capability entry with structured data-gaps, and that
// the calendar-day cutoff policy is deterministic and recorded on the result.
import { describe, expect, it } from "vitest";
import {
  BUSINESS_QUERY_CAPABILITIES,
  BUSINESS_QUERY_NAMES,
  DEFAULT_THRESHOLD_DAYS,
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

  it("documents structured missingFacts for every query that is not fully spine-supported", () => {
    const gapped = BUSINESS_QUERY_NAMES.filter(
      (n) => BUSINESS_QUERY_CAPABILITIES[n].baselineReadiness !== "SUPPORTED",
    );
    // the three genuinely-blocked queries each carry documented gaps
    expect(gapped).toEqual(
      expect.arrayContaining([
        "findRecurringServiceIssues",
        "findDelayedEnrollments",
        "assessPrinterModelSupportImpact",
        "findTasksFromApprovedRecommendations",
      ]),
    );
    for (const n of gapped) {
      expect(BUSINESS_QUERY_CAPABILITIES[n].missingFacts.length).toBeGreaterThan(0);
    }
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
