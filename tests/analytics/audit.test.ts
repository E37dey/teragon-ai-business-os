// W8-A — "מבקר המדדים": the 8 detections fire on violating fixtures and stay
// quiet on clean ones.
import { describe, expect, it } from "vitest";
import { ANALYTICS_METRICS, auditMetrics } from "@/analytics";
import { SUBMISSION_METRICS } from "@/domain/submission/metricLevels";
import type { MetricObservation } from "@/domain/types";
import { METRIC_DEFINITIONS, METRIC_OBSERVATIONS } from "@/repositories/seed";
import { TEST_NOW_ISO } from "./helpers";

function runAudit(overrides: {
  observations?: MetricObservation[];
  sampleSizes?: Record<string, number | null>;
}) {
  return auditMetrics({
    catalogue: ANALYTICS_METRICS,
    submissionMetrics: SUBMISSION_METRICS,
    metricDefinitions: METRIC_DEFINITIONS,
    metricObservations: overrides.observations ?? METRIC_OBSERVATIONS,
    sampleSizes: overrides.sampleSizes ?? {},
    nowISO: TEST_NOW_ISO,
  });
}

function obs(metricKey: string, value: number | null, observedAt = TEST_NOW_ISO): MetricObservation {
  return {
    id: `mo-test-${metricKey}`,
    metricKey,
    observedAt,
    value,
    method: "fixture",
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

describe("metric audit (rail detections)", () => {
  it("missing_baseline fires for every computable metric (all baselines are null)", () => {
    const findings = runAudit({});
    const keys = findings.filter((f) => f.kind === "missing_baseline").map((f) => f.metricKey);
    expect(keys).toContain("leads_new");
    expect(keys).toContain("service_resolution_days");
  });

  it("target_without_source fires for pilot targets with no connected source", () => {
    const findings = runAudit({});
    const keys = findings.filter((f) => f.kind === "target_without_source").map((f) => f.metricKey);
    expect(keys).toContain("training_completion");
    expect(keys).toContain("nps");
  });

  it("observation_without_owner fires for an observation with an unknown key", () => {
    const findings = runAudit({ observations: [obs("ghost_metric", 42)] });
    expect(findings.some((f) => f.kind === "observation_without_owner" && f.metricKey === "ghost_metric")).toBe(true);
  });

  it("stale_metric fires for an observation older than 90 days", () => {
    const findings = runAudit({ observations: [obs("leads_new", 3, "2026-01-01T00:00:00.000Z")] });
    expect(findings.some((f) => f.kind === "stale_metric" && f.metricKey === "leads_new")).toBe(true);
  });

  it("stale_metric stays quiet for a fresh observation", () => {
    const findings = runAudit({ observations: [obs("leads_new", 3)] });
    expect(findings.some((f) => f.kind === "stale_metric")).toBe(false);
  });

  it("incomplete_sample fires when a computable metric runs on a tiny sample", () => {
    const findings = runAudit({ sampleSizes: { quotation_conversion: 3 } });
    expect(
      findings.some((f) => f.kind === "incomplete_sample" && f.metricKey === "quotation_conversion"),
    ).toBe(true);
  });

  it("incomplete_sample stays quiet with an adequate sample", () => {
    const findings = runAudit({ sampleSizes: { quotation_conversion: 25 } });
    expect(findings.some((f) => f.kind === "incomplete_sample")).toBe(false);
  });

  it("conflicting_calculation fires for md-7 ('טרם נמדד') vs the computed rec_approved_rate", () => {
    const findings = runAudit({});
    expect(
      findings.some((f) => f.kind === "conflicting_calculation" && f.metricKey === "rec_approved_rate"),
    ).toBe(true);
  });

  it("structural_presented_as_measured fires when a מבני metric gets a numeric observation", () => {
    const findings = runAudit({ observations: [obs("wau", 71)] });
    expect(
      findings.some((f) => f.kind === "structural_presented_as_measured" && f.metricKey === "wau"),
    ).toBe(true);
  });

  it("pilot_target_presented_as_outcome fires when a יעד-פיילוט metric gets a value", () => {
    const findings = runAudit({ observations: [obs("nps", 42)] });
    expect(
      findings.some((f) => f.kind === "pilot_target_presented_as_outcome" && f.metricKey === "nps"),
    ).toBe(true);
  });

  it("null-valued observations do NOT trigger the presented-as-measured detections", () => {
    const findings = runAudit({ observations: [obs("wau", null), obs("nps", null)] });
    expect(findings.some((f) => f.kind === "structural_presented_as_measured")).toBe(false);
    expect(findings.some((f) => f.kind === "pilot_target_presented_as_outcome")).toBe(false);
  });
});
