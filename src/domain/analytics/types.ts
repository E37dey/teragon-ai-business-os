// TERAGON AI BUSINESS OS — W8-A (Phase 8.1): analytics domain types.
// HONESTY CONTRACT (inherited from W7-E metricLevels):
//   value: number | null — null means "טרם נמדד" and is NEVER rendered as 0;
//   measured=false whenever the number was not computed from real records;
//   every point carries its source, calculation method, limitations and sample.
import type { BaseEntity, ISODate } from "@/domain/types";
import type { SubmissionMetricType } from "@/domain/submission/metricLevels";
import type { CollectionKey } from "@/repositories/collections";

export const NOT_MEASURED_HE = "טרם נמדד";
export const NO_BASELINE_HE = "לא הוגדר קו בסיס";

// ---------------------------------------------------------------------------
// the 6 mandated analytics groups
// ---------------------------------------------------------------------------

export type AnalyticsGroupKey = "א" | "ב" | "ג" | "ד" | "ה" | "ו";

export const ANALYTICS_GROUP_ORDER: readonly AnalyticsGroupKey[] = [
  "א",
  "ב",
  "ג",
  "ד",
  "ה",
  "ו",
];

export const ANALYTICS_GROUP_TITLES: Readonly<Record<AnalyticsGroupKey, string>> = {
  א: "א · פעילות והטמעה",
  ב: "ב · מכירות ולקוחות",
  ג: "ג · שירות ותפעול",
  ד: "ד · הדרכה ולמידה",
  ה: "ה · AI וממשל",
  ו: "ו · תוצאות עסקיות",
};

// ---------------------------------------------------------------------------
// metric definition (catalogue entry — extends W7-E's 3-level typing)
// ---------------------------------------------------------------------------

/** direction that means "better" — comparison semantics derive ONLY from this */
export type BetterWhen = "lower" | "higher" | "none";

/** re-export of W7-E's honest metric typing — never duplicated */
export type AnalyticsMetricKind = SubmissionMetricType;

/**
 * "series"  — the metric is honestly computable per time bucket;
 * "snapshot" — only a cumulative/current value is honest (no per-period story).
 */
export type MetricTemporality = "series" | "snapshot";

export interface AnalyticsMetricDef {
  key: string;
  titleHe: string;
  group: AnalyticsGroupKey;
  unit: string;
  betterWhen: BetterWhen;
  kind: AnalyticsMetricKind;
  temporality: MetricTemporality;
  /** the REAL source (collections / selector) for מחושב; honest note otherwise */
  sourceHe: string;
  sourceCollections: CollectionKey[];
  calculationMethodHe: string;
  limitationsHe: string[];
  /** NAMED seed user (never a role); null when no honest owner exists */
  ownerId: string | null;
  /** seed metricDefinitions bridge (md-1..md-9) when relevant */
  seedMetricId: string | null;
  /** W7-E SUBMISSION_METRICS bridge key when the metric is shared */
  submissionKey: string | null;
  /** primary drilldown entity type ("lead" | "quotation" | …), null when none */
  entityType: string | null;
}

// ---------------------------------------------------------------------------
// series + points
// ---------------------------------------------------------------------------

export type DataCompleteness = "מלא" | "חלקי" | "אין נתונים";

export interface MetricPoint {
  /** catalogue key of the owning metric definition */
  metricDefinitionId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  /** null ⇒ "טרם נמדד" — MUST NEVER be rendered as 0 */
  value: number | null;
  unit: string;
  /** where the number came from (collections / selector name) */
  source: string;
  calculationMethod: string;
  /** false whenever value is null or the number is not a real measurement */
  measured: boolean;
  calculatedAt: ISODate;
  limitations: string[];
  sampleSize: number | null;
  dataCompleteness: DataCompleteness;
}

export interface MetricSeries {
  metricKey: string;
  titleHe: string;
  group: AnalyticsGroupKey;
  unit: string;
  betterWhen: BetterWhen;
  kind: AnalyticsMetricKind;
  temporality: MetricTemporality;
  points: MetricPoint[];
  sourceCollections: CollectionKey[];
  ownerId: string | null;
}

// ---------------------------------------------------------------------------
// comparison — the 6 honest states
// ---------------------------------------------------------------------------

export type MetricComparisonState =
  | "improved"
  | "declined"
  | "unchanged"
  | "insufficient_data"
  | "no_baseline"
  | "not_applicable";

export const COMPARISON_STATE_HE: Readonly<Record<MetricComparisonState, string>> = {
  improved: "שיפור",
  declined: "נסיגה",
  unchanged: "ללא שינוי",
  insufficient_data: "אין די נתונים",
  no_baseline: "אין קו בסיס להשוואה",
  not_applicable: "השוואה לא רלוונטית",
};

export interface MetricComparison {
  metricKey: string;
  state: MetricComparisonState;
  currentValue: number | null;
  previousValue: number | null;
  /** current − previous; null unless both values exist */
  deltaAbs: number | null;
  /** honest Hebrew label, e.g. "שיפור: ‎2.5 → 1.8 ימים" */
  labelHe: string;
}

// ---------------------------------------------------------------------------
// breakdown (dimension split of one metric)
// ---------------------------------------------------------------------------

export interface MetricBreakdownRow {
  keyHe: string;
  value: number;
}

export interface MetricBreakdown {
  metricKey: string;
  dimensionHe: string;
  rows: MetricBreakdownRow[];
}

// ---------------------------------------------------------------------------
// filters / query / saved view / dashboard
// ---------------------------------------------------------------------------

export type AnalyticsRangePreset = "30d" | "90d" | "365d";

export const RANGE_PRESET_HE: Readonly<Record<AnalyticsRangePreset, string>> = {
  "30d": "30 יום אחרונים",
  "90d": "90 יום אחרונים",
  "365d": "12 חודשים אחרונים",
};

export interface AnalyticsFilter {
  rangePreset: AnalyticsRangePreset;
  /** null = all groups */
  group: AnalyticsGroupKey | null;
  /** filter record-level metrics by owning user; null = everyone */
  ownerId: string | null;
  /** show only metrics whose primary entity type matches; null = all */
  entityType: string | null;
  /** record-status filter (applies where the entity has a status field) */
  status: string | null;
  /** show comparison vs the preceding equal-length period */
  comparePrevious: boolean;
}

export interface AnalyticsQuery {
  fromISO: ISODate;
  toISO: ISODate;
  filter: AnalyticsFilter;
}

/** persisted saved view — collection "analyticsViews" */
export interface AnalyticsView extends BaseEntity {
  nameHe: string;
  filter: AnalyticsFilter;
  createdById: string;
}

/** static dashboard descriptor (the /analytics page renders exactly one) */
export interface AnalyticsDashboard {
  key: string;
  titleHe: string;
  groupOrder: readonly AnalyticsGroupKey[];
}

// ---------------------------------------------------------------------------
// metric audit (rail "מבקר המדדים") — 8 detection kinds
// ---------------------------------------------------------------------------

export type MetricAlertKind =
  | "missing_baseline"
  | "target_without_source"
  | "observation_without_owner"
  | "stale_metric"
  | "incomplete_sample"
  | "conflicting_calculation"
  | "structural_presented_as_measured"
  | "pilot_target_presented_as_outcome";

export const METRIC_ALERT_KIND_HE: Readonly<Record<MetricAlertKind, string>> = {
  missing_baseline: "מדד ללא קו בסיס",
  target_without_source: "יעד ללא מקור מדידה",
  observation_without_owner: "תצפית ללא בעלים",
  stale_metric: "מדד מעופש (>90 יום)",
  incomplete_sample: "מדגם חלקי",
  conflicting_calculation: "חישוב סותר",
  structural_presented_as_measured: "מדד מבני שמוצג כנמדד",
  pilot_target_presented_as_outcome: "יעד פיילוט שמוצג כתוצאה",
};

/** persisted alert record shape — collection "metricAlerts" */
export interface MetricAlert extends BaseEntity {
  kind: MetricAlertKind;
  metricKey: string;
  messageHe: string;
  severity: "מידע" | "אזהרה" | "דחוף";
}

/** live (non-persisted) rail finding — same content, computed each render */
export interface MetricAuditFinding {
  kind: MetricAlertKind;
  metricKey: string;
  titleHe: string;
  messageHe: string;
}

// ---------------------------------------------------------------------------
// drilldown — every chart point resolves to its ACTUAL source records
// ---------------------------------------------------------------------------

export interface DrilldownRecord {
  collection: CollectionKey;
  id: string;
  titleHe: string;
  /** in-app route the record links to */
  route: string;
  /** short detail line (date / status), may be empty */
  detailHe: string;
}

// ---------------------------------------------------------------------------
// reports (Phase 8.3)
// ---------------------------------------------------------------------------

/** persisted — collection "reportDefinitions" */
export interface ReportDefinition extends BaseEntity {
  key: string;
  titleHe: string;
  descriptionHe: string;
  /** e.g. "שבועי" / "חודשי" / "לפי דרישה" */
  cadenceHe: string;
  /** period length in days the run covers */
  periodDays: number;
  metricKeys: string[];
  ownerId: string;
}

export interface ReportExportState {
  csvExportedAt: ISODate | null;
  printedAt: ISODate | null;
}

export interface ReportRunRow {
  metricKey: string;
  titleHe: string;
  /** null ⇒ "טרם נמדד" — never 0 */
  value: number | null;
  unit: string;
  displayHe: string;
  sampleSize: number | null;
  dataCompleteness: DataCompleteness;
  calculationMethod: string;
  limitations: string[];
}

/** persisted — collection "reportRuns" */
export interface ReportRun extends BaseEntity {
  reportDefinitionId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  generatedAt: ISODate;
  /** NAMED user id who generated the run */
  generatedBy: string;
  rows: ReportRunRow[];
  limitations: string[];
  exportState: ReportExportState;
}
