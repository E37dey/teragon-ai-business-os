// W8-A — comparison direction derives ONLY from betterWhen (BOTH polarities
// tested) + the honest no_baseline / insufficient_data / not_applicable states.
import { describe, expect, it } from "vitest";
import { compareMetric } from "@/domain/analytics";

const resolutionTime = {
  key: "service_resolution_days",
  betterWhen: "lower" as const,
  temporality: "series" as const,
  unit: "ימים",
};
const completion = {
  key: "enrollment_progress",
  betterWhen: "higher" as const,
  temporality: "series" as const,
  unit: "%",
};

describe("compareMetric", () => {
  it("lower=better: resolution time going DOWN is an improvement", () => {
    expect(compareMetric(resolutionTime, 1.8, 2.5).state).toBe("improved");
  });
  it("lower=better: resolution time going UP is a decline", () => {
    expect(compareMetric(resolutionTime, 3.2, 2.5).state).toBe("declined");
  });
  it("higher=better: completion going UP is an improvement", () => {
    expect(compareMetric(completion, 80, 60).state).toBe("improved");
  });
  it("higher=better: completion going DOWN is a decline", () => {
    expect(compareMetric(completion, 40, 60).state).toBe("declined");
  });
  it("equal values ⇒ unchanged", () => {
    const c = compareMetric(completion, 55, 55);
    expect(c.state).toBe("unchanged");
    expect(c.deltaAbs).toBe(0);
  });
  it("current null ⇒ insufficient_data (never a fake direction)", () => {
    expect(compareMetric(completion, null, 60).state).toBe("insufficient_data");
  });
  it("previous null ⇒ no_baseline", () => {
    expect(compareMetric(completion, 60, null).state).toBe("no_baseline");
  });
  it("betterWhen none ⇒ not_applicable even with two numbers", () => {
    expect(
      compareMetric(
        { key: "ai_runs_count", betterWhen: "none", temporality: "series", unit: "ריצות" },
        5,
        2,
      ).state,
    ).toBe("not_applicable");
  });
  it("snapshot metrics ⇒ not_applicable (no honest per-period story)", () => {
    expect(
      compareMetric(
        { key: "pipeline_value", betterWhen: "higher", temporality: "snapshot", unit: "₪" },
        100,
        50,
      ).state,
    ).toBe("not_applicable");
  });
  it("deltaAbs is null unless BOTH values exist", () => {
    expect(compareMetric(completion, 60, null).deltaAbs).toBeNull();
    expect(compareMetric(completion, null, 60).deltaAbs).toBeNull();
    expect(compareMetric(completion, 70, 60).deltaAbs).toBe(10);
  });
});
