// W8-A — period comparison with HONEST states. Direction semantics come ONLY
// from MetricDef.betterWhen (e.g. resolution-time lower=better, completion
// higher=better). A missing number is never coerced to 0 and never compared.
import type {
  AnalyticsMetricDef,
  MetricComparison,
  MetricComparisonState,
} from "./types";
import { COMPARISON_STATE_HE } from "./types";

/** two floats within this distance are "unchanged" (display rounding scale) */
const EPSILON = 1e-9;

function fmt(v: number, unit: string): string {
  return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10} ${unit}`.trim();
}

/**
 * Compare the aggregated current-period value against the preceding
 * equal-length period. Pure + total: every input combination maps to one of
 * the six honest states.
 */
export function compareMetric(
  def: Pick<AnalyticsMetricDef, "key" | "betterWhen" | "temporality" | "unit">,
  currentValue: number | null,
  previousValue: number | null,
): MetricComparison {
  const base = { metricKey: def.key, currentValue, previousValue };

  const done = (state: MetricComparisonState, labelHe?: string): MetricComparison => ({
    ...base,
    state,
    deltaAbs:
      currentValue !== null && previousValue !== null ? currentValue - previousValue : null,
    labelHe: labelHe ?? COMPARISON_STATE_HE[state],
  });

  // snapshot metrics have no honest per-period story; direction "none" has no
  // better/worse semantics — both are "not_applicable", never a fake trend.
  if (def.temporality === "snapshot" || def.betterWhen === "none") {
    return done("not_applicable");
  }
  if (currentValue === null) return done("insufficient_data");
  if (previousValue === null) return done("no_baseline");

  const delta = currentValue - previousValue;
  if (Math.abs(delta) <= EPSILON) {
    return done("unchanged", `ללא שינוי: ${fmt(currentValue, def.unit)}`);
  }
  const improved = def.betterWhen === "higher" ? delta > 0 : delta < 0;
  const state: MetricComparisonState = improved ? "improved" : "declined";
  return done(
    state,
    `${COMPARISON_STATE_HE[state]}: ${fmt(previousValue, def.unit)} ← ${fmt(currentValue, def.unit)}`,
  );
}
