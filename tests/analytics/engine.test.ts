// W8-A — engine honesty: determinism vs seed, null-never-zero, honest split.
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_METRICS,
  buildPeriods,
  catalogueSplit,
  computeBucket,
  computeSeries,
  wholeRange,
} from "@/analytics";
import { buildSources, TEST_NOW_ISO } from "./helpers";

describe("analytics engine", () => {
  it("is deterministic: same seed sources + same clock ⇒ identical series", () => {
    const a = ANALYTICS_METRICS.map((m) => computeSeries(m, buildSources(), "90d"));
    const b = ANALYTICS_METRICS.map((m) => computeSeries(m, buildSources(), "90d"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("value null is NEVER rendered/serialized as 0 — unmeasured metrics stay null", () => {
    const s = buildSources();
    for (const def of ANALYTICS_METRICS.filter((m) => m.kind !== "מחושב")) {
      const series = computeSeries(def, s, "90d");
      expect(series.points).toHaveLength(1);
      const p = series.points[0]!;
      expect(p.value).toBeNull();
      expect(p.measured).toBe(false);
      expect(p.dataCompleteness).toBe("אין נתונים");
      expect(p.limitations.length).toBeGreaterThan(0);
    }
  });

  it("computable metrics carry the mandated MetricPoint fields", () => {
    const s = buildSources();
    const def = ANALYTICS_METRICS.find((m) => m.key === "leads_new")!;
    const series = computeSeries(def, s, "90d");
    for (const p of series.points) {
      expect(p.metricDefinitionId).toBe("leads_new");
      expect(p.unit).toBe("לידים");
      expect(p.source.length).toBeGreaterThan(0);
      expect(p.calculationMethod.length).toBeGreaterThan(0);
      expect(p.calculatedAt).toBe(TEST_NOW_ISO);
      expect(p.measured).toBe(p.value !== null);
      expect(Date.parse(p.periodEnd)).toBeGreaterThan(Date.parse(p.periodStart));
    }
  });

  it("ratio with an empty denominator ⇒ null (insufficient), not 0", () => {
    const s = buildSources({ quotations: [], supportRequests: [], approvals: [] });
    const conv = computeBucket(
      ANALYTICS_METRICS.find((m) => m.key === "quotation_conversion")!,
      s,
      wholeRange(TEST_NOW_ISO, "90d"),
    );
    expect(conv.value).toBeNull();
    const esc = computeBucket(
      ANALYTICS_METRICS.find((m) => m.key === "escalation_rate")!,
      s,
      wholeRange(TEST_NOW_ISO, "90d"),
    );
    expect(esc.value).toBeNull();
    const rate = computeBucket(
      ANALYTICS_METRICS.find((m) => m.key === "rec_approved_rate")!,
      s,
      wholeRange(TEST_NOW_ISO, "90d"),
    );
    expect(rate.value).toBeNull();
  });

  it("a count of zero REAL records is honestly 0 (measured), never null-coerced", () => {
    const s = buildSources({ knowledgeUsage: [], memoryUsage: [] });
    const b = computeBucket(
      ANALYTICS_METRICS.find((m) => m.key === "knowledge_usage_count")!,
      s,
      wholeRange(TEST_NOW_ISO, "90d"),
    );
    expect(b.value).toBe(0);
  });

  it("seed data yields real measurements for the core computable metrics", () => {
    const s = buildSources();
    const range = wholeRange(TEST_NOW_ISO, "90d");
    for (const key of ["leads_new", "activities_count", "quotation_conversion", "rec_approved_rate"]) {
      const b = computeBucket(ANALYTICS_METRICS.find((m) => m.key === key)!, s, range);
      expect(b.value).not.toBeNull();
    }
  });

  it("buildPeriods tiles the range exactly — no overlap, no gap", () => {
    for (const preset of ["30d", "90d", "365d"] as const) {
      const periods = buildPeriods(TEST_NOW_ISO, preset);
      expect(periods.length).toBeGreaterThan(1);
      for (let i = 1; i < periods.length; i += 1) {
        expect(periods[i]!.startISO).toBe(periods[i - 1]!.endISO);
      }
      expect(periods[periods.length - 1]!.endISO).toBe(new Date(TEST_NOW_ISO).toISOString());
    }
  });

  it("the honest computable-vs-unmeasured split covers the whole catalogue", () => {
    const split = catalogueSplit();
    expect(split.computable.length + split.pilotTargets.length + split.structural.length).toBe(
      ANALYTICS_METRICS.length,
    );
    expect(split.computable).toContain("leads_new");
    expect(split.pilotTargets).toContain("nps");
    expect(split.pilotTargets).toContain("roi");
    expect(split.structural).toContain("wau");
    expect(split.structural).toContain("downtime");
  });

  it("all six mandated groups are populated in the catalogue", () => {
    for (const g of ["א", "ב", "ג", "ד", "ה", "ו"] as const) {
      expect(ANALYTICS_METRICS.some((m) => m.group === g)).toBe(true);
    }
  });
});
