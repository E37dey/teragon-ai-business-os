// W8-A — gap honesty: a null point BREAKS the line (separate segments), it is
// never bridged/interpolated.
import { describe, expect, it } from "vitest";
import { splitSegments } from "@/analytics";
import type { MetricPoint } from "@/domain/analytics";

function pt(value: number | null, i: number): MetricPoint {
  return {
    metricDefinitionId: "t",
    periodStart: `2026-07-0${i + 1}`,
    periodEnd: `2026-07-0${i + 2}`,
    value,
    unit: "",
    source: "",
    calculationMethod: "",
    measured: value !== null,
    calculatedAt: "2026-07-23",
    limitations: [],
    sampleSize: value === null ? null : 1,
    dataCompleteness: value === null ? "אין נתונים" : "מלא",
  };
}

describe("splitSegments (no interpolation across gaps)", () => {
  it("a gap in the middle produces TWO segments — the line is broken, not bridged", () => {
    const points = [pt(1, 0), pt(2, 1), pt(null, 2), pt(3, 3), pt(4, 4)];
    const segments = splitSegments(points);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.indexes).toEqual([0, 1]);
    expect(segments[1]!.indexes).toEqual([3, 4]);
  });
  it("all-null ⇒ no segments (nothing is drawn)", () => {
    expect(splitSegments([pt(null, 0), pt(null, 1)])).toHaveLength(0);
  });
  it("no gaps ⇒ one continuous segment", () => {
    expect(splitSegments([pt(1, 0), pt(2, 1), pt(3, 2)])).toHaveLength(1);
  });
  it("leading/trailing nulls are excluded without bridging", () => {
    const segments = splitSegments([pt(null, 0), pt(5, 1), pt(6, 2), pt(null, 3)]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.indexes).toEqual([1, 2]);
  });
});
