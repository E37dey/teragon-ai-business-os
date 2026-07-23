// W8-A — zod schemas for the persisted analytics entities, pinned to the
// domain types via `satisfies z.ZodType<T>` (same drift-guard as domain/schemas.ts).
import { z } from "zod";
import { isoDate } from "@/domain/schemas";
import { COLLECTIONS } from "@/repositories/collections";
import type {
  AnalyticsFilter,
  AnalyticsView,
  MetricAlert,
  MetricPoint,
  ReportDefinition,
  ReportRun,
  ReportRunRow,
} from "./types";

const baseEntity = {
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
};

export const analyticsGroupKeySchema = z.enum(["א", "ב", "ג", "ד", "ה", "ו"]);

export const dataCompletenessSchema = z.enum(["מלא", "חלקי", "אין נתונים"]);

export const analyticsRangePresetSchema = z.enum(["30d", "90d", "365d"]);

export const analyticsFilterSchema = z.object({
  rangePreset: analyticsRangePresetSchema,
  group: analyticsGroupKeySchema.nullable(),
  ownerId: z.string().nullable(),
  entityType: z.string().nullable(),
  status: z.string().nullable(),
  comparePrevious: z.boolean(),
}) satisfies z.ZodType<AnalyticsFilter>;

export const analyticsViewSchema = z.object({
  ...baseEntity,
  nameHe: z.string().min(1, "שם התצוגה הוא שדה חובה"),
  filter: analyticsFilterSchema,
  createdById: z.string().min(1),
}) satisfies z.ZodType<AnalyticsView>;

export const metricPointSchema = z.object({
  metricDefinitionId: z.string().min(1),
  periodStart: isoDate,
  periodEnd: isoDate,
  value: z.number().nullable(),
  unit: z.string(),
  source: z.string(),
  calculationMethod: z.string(),
  measured: z.boolean(),
  calculatedAt: isoDate,
  limitations: z.array(z.string()),
  sampleSize: z.number().nullable(),
  dataCompleteness: dataCompletenessSchema,
}) satisfies z.ZodType<MetricPoint>;

export const metricAlertKindSchema = z.enum([
  "missing_baseline",
  "target_without_source",
  "observation_without_owner",
  "stale_metric",
  "incomplete_sample",
  "conflicting_calculation",
  "structural_presented_as_measured",
  "pilot_target_presented_as_outcome",
]);

export const metricAlertSchema = z.object({
  ...baseEntity,
  kind: metricAlertKindSchema,
  metricKey: z.string().min(1),
  messageHe: z.string(),
  severity: z.enum(["מידע", "אזהרה", "דחוף"]),
}) satisfies z.ZodType<MetricAlert>;

export const reportDefinitionSchema = z.object({
  ...baseEntity,
  key: z.string().min(1),
  titleHe: z.string().min(1),
  descriptionHe: z.string(),
  cadenceHe: z.string(),
  periodDays: z.number().int().positive(),
  metricKeys: z.array(z.string().min(1)),
  ownerId: z.string().min(1),
}) satisfies z.ZodType<ReportDefinition>;

export const reportRunRowSchema = z.object({
  metricKey: z.string().min(1),
  titleHe: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  displayHe: z.string(),
  sampleSize: z.number().nullable(),
  dataCompleteness: dataCompletenessSchema,
  calculationMethod: z.string(),
  limitations: z.array(z.string()),
}) satisfies z.ZodType<ReportRunRow>;

export const reportRunSchema = z.object({
  ...baseEntity,
  reportDefinitionId: z.string().min(1),
  periodStart: isoDate,
  periodEnd: isoDate,
  generatedAt: isoDate,
  generatedBy: z.string().min(1),
  rows: z.array(reportRunRowSchema),
  limitations: z.array(z.string()),
  exportState: z.object({
    csvExportedAt: isoDate.nullable(),
    printedAt: isoDate.nullable(),
  }),
}) satisfies z.ZodType<ReportRun>;

/** collection-key guard reused by drilldown validation */
export const collectionKeySchema = z.enum(COLLECTIONS);
