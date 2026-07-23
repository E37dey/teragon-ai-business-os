// W8-A — "מבקר המדדים": 8 deterministic detections over the metric catalogue,
// the seed metricDefinitions/metricObservations and the computed snapshots.
// Pure — same inputs ⇒ same findings; each finding points at ONE metric.
import type { MetricDefinition, MetricObservation } from "@/domain/types";
import type { AnalyticsMetricDef, MetricAuditFinding } from "@/domain/analytics";
import { METRIC_ALERT_KIND_HE } from "@/domain/analytics";
import type { SubmissionMetricDef } from "@/domain/submission/metricLevels";

const STALE_DAYS = 90;
const SMALL_SAMPLE = 5;

export interface MetricAuditInput {
  catalogue: readonly AnalyticsMetricDef[];
  submissionMetrics: readonly SubmissionMetricDef[];
  metricDefinitions: readonly MetricDefinition[];
  metricObservations: readonly MetricObservation[];
  /** metricKey → current computed sample size (null when unmeasured) */
  sampleSizes: Readonly<Record<string, number | null>>;
  nowISO: string;
}

function finding(
  kind: MetricAuditFinding["kind"],
  metricKey: string,
  messageHe: string,
): MetricAuditFinding {
  return { kind, metricKey, titleHe: METRIC_ALERT_KIND_HE[kind], messageHe };
}

/** submission catalogue lookup by bridged key */
function submissionOf(
  def: AnalyticsMetricDef,
  subs: readonly SubmissionMetricDef[],
): SubmissionMetricDef | undefined {
  return def.submissionKey === null ? undefined : subs.find((s) => s.key === def.submissionKey);
}

export function auditMetrics(input: MetricAuditInput): MetricAuditFinding[] {
  const out: MetricAuditFinding[] = [];
  const nowMs = Date.parse(input.nowISO);

  for (const def of input.catalogue) {
    const sub = submissionOf(def, input.submissionMetrics);

    // 1. missing baseline — a computable metric with no defined baseline
    if (def.kind === "מחושב" && (sub === undefined || sub.baseline === null)) {
      out.push(
        finding(
          "missing_baseline",
          def.key,
          `"${def.titleHe}" מחושב אך אין לו קו בסיס מוגדר — השוואת לפני/אחרי אינה אפשרית`,
        ),
      );
    }

    // 2. target without a measurement source
    if (sub !== undefined && sub.targetHe !== null && def.sourceCollections.length === 0) {
      out.push(
        finding(
          "target_without_source",
          def.key,
          `ל"${def.titleHe}" מוגדר יעד ("${sub.targetHe}") אך אין מקור מדידה מחובר`,
        ),
      );
    }
  }

  // observation-level checks (seed metricObservations)
  const knownKeys = new Set<string>([
    ...input.catalogue.map((c) => c.key),
    ...input.catalogue.flatMap((c) => (c.seedMetricId === null ? [] : [c.key])),
    ...input.metricDefinitions.map((d) => d.key),
  ]);
  const catalogueByKey = new Map(input.catalogue.map((c) => [c.key, c] as const));
  const seedBridge = new Map(
    input.catalogue
      .filter((c) => c.seedMetricId !== null)
      .map((c) => {
        const seedDef = input.metricDefinitions.find((d) => d.id === c.seedMetricId);
        return [seedDef?.key ?? "", c] as const;
      }),
  );

  for (const obs of input.metricObservations) {
    const bridged = catalogueByKey.get(obs.metricKey) ?? seedBridge.get(obs.metricKey);

    // 3. observation without an owner
    if (!knownKeys.has(obs.metricKey) || (bridged !== undefined && bridged.ownerId === null)) {
      out.push(
        finding(
          "observation_without_owner",
          obs.metricKey,
          `תצפית ${obs.id} (${obs.metricKey}) אינה משויכת לבעלים בקטלוג`,
        ),
      );
    }

    // 4. stale metric — observation older than 90 days
    if (nowMs - Date.parse(obs.observedAt) > STALE_DAYS * 86_400_000) {
      out.push(
        finding(
          "stale_metric",
          obs.metricKey,
          `התצפית האחרונה של ${obs.metricKey} בת יותר מ-${STALE_DAYS} יום — נדרשת מדידה מחדש`,
        ),
      );
    }

    if (bridged !== undefined && obs.value !== null) {
      // 7. structural metric presented as measured
      if (bridged.kind === "מבני") {
        out.push(
          finding(
            "structural_presented_as_measured",
            bridged.key,
            `"${bridged.titleHe}" הוא מדד מבני ללא מקור — תצפית ${obs.id} מציגה עבורו ערך מספרי`,
          ),
        );
      }
      // 8. pilot target presented as an outcome
      if (bridged.kind === "יעד פיילוט") {
        out.push(
          finding(
            "pilot_target_presented_as_outcome",
            bridged.key,
            `"${bridged.titleHe}" הוא יעד פיילוט — תצפית ${obs.id} מציגה אותו כתוצאה מדודה`,
          ),
        );
      }
    }
  }

  // 5. incomplete sample — currently measured with a small sample
  for (const def of input.catalogue) {
    const sample = input.sampleSizes[def.key];
    if (def.kind === "מחושב" && typeof sample === "number" && sample > 0 && sample < SMALL_SAMPLE) {
      out.push(
        finding(
          "incomplete_sample",
          def.key,
          `"${def.titleHe}" מחושב ממדגם של ${sample} רשומות בלבד — לא מספיק להסקה`,
        ),
      );
    }
  }

  // 6. conflicting calculation — a seed definition declares "טרם נמדד" while a
  //    bridged catalogue metric computes the same concept from real records
  for (const def of input.catalogue) {
    if (def.seedMetricId === null || def.kind !== "מחושב") continue;
    const seedDef = input.metricDefinitions.find((d) => d.id === def.seedMetricId);
    if (seedDef !== undefined && seedDef.derivation.startsWith("טרם נמדד")) {
      out.push(
        finding(
          "conflicting_calculation",
          def.key,
          `${seedDef.key} (${seedDef.id}) מוצהר "טרם נמדד" בעוד "${def.titleHe}" מחשב את אותו מושג מ-${def.sourceCollections.join(", ")} — נדרש איחוד הגדרות`,
        ),
      );
    }
  }

  return out;
}
