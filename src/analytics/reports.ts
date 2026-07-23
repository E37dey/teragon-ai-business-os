// W8-A (Phase 8.3) — the 7 canonical ReportDefinitions + run generation.
// Bootstrap is IDEMPOTENT (stable ids rd-1..rd-7; re-running creates nothing).
// A ReportRun's rows are REAL engine outputs: value null stays null ("טרם
// נמדד"), never 0; generatedBy is a NAMED user; limitations are carried.
import type { ISODate } from "@/domain/types";
import type {
  ReportDefinition,
  ReportRun,
  ReportRunRow,
} from "@/domain/analytics";
import { NOT_MEASURED_HE } from "@/domain/analytics";
import type { AnalyticsSources } from "./engine";
import { computeBucket, wholeRange } from "./engine";
import { metricByKey } from "./catalogue";
import type { AnalyticsPeriod } from "./engine";

export const CANONICAL_REPORTS: readonly Omit<
  ReportDefinition,
  "createdAt" | "updatedAt"
>[] = [
  {
    id: "rd-1",
    key: "weekly-activity",
    titleHe: "דוח פעילות שבועי",
    descriptionHe: "פעילות מתועדת, לידים, הצעות, פניות תמיכה ומשימות באיחור — שבוע אחרון.",
    cadenceHe: "שבועי",
    periodDays: 7,
    metricKeys: ["activities_count", "leads_new", "quotations_created", "support_volume", "tasks_overdue"],
    ownerId: "u-tzachi",
  },
  {
    id: "rd-2",
    key: "monthly-sales",
    titleHe: "דוח מכירות חודשי",
    descriptionHe: "לידים, זמן תגובה, הצעות מחיר, המרה ושווי צבר — 30 יום אחרונים.",
    cadenceHe: "חודשי",
    periodDays: 30,
    metricKeys: [
      "leads_new",
      "lead_first_response_hours",
      "quotations_created",
      "quotation_conversion",
      "pipeline_value",
      "approved_revenue",
    ],
    ownerId: "u-maya",
  },
  {
    id: "rd-3",
    key: "service-issues",
    titleHe: "דוח שירות ותקלות",
    descriptionHe: "זמני פתרון, קריאות פתוחות, חריגות SLA ואסקלציות — 30 יום אחרונים.",
    cadenceHe: "חודשי",
    periodDays: 30,
    metricKeys: ["service_resolution_days", "open_tickets", "sla_breaches", "escalation_rate", "support_volume"],
    ownerId: "u-ran",
  },
  {
    id: "rd-4",
    key: "student-progress",
    titleHe: "דוח התקדמות תלמידים",
    descriptionHe: "השלמת שלבי למידה של התלמידים + מדדי ההדרכה שטרם נמדדו (מוצגים בכנות).",
    cadenceHe: "חודשי",
    periodDays: 30,
    metricKeys: ["enrollment_progress", "training_completion", "knowledge_check", "training_satisfaction"],
    ownerId: "u-oren",
  },
  {
    id: "rd-5",
    key: "adoption",
    titleHe: "דוח אימוץ והטמעה",
    descriptionHe: "שימוש בזיכרון ובידע, פעילות ופניות תמיכה; מדדי טלמטריה מוצגים כלא-נמדדים.",
    cadenceHe: "חודשי",
    periodDays: 30,
    metricKeys: [
      "activities_count",
      "memory_usage_count",
      "knowledge_usage_count",
      "support_volume",
      "wau",
      "repeat_usage",
    ],
    ownerId: "u-noa",
  },
  {
    id: "rd-6",
    key: "ai-governance",
    titleHe: "דוח ממשל AI",
    descriptionHe: "שיעורי אישור/עריכה/דחייה, ריצות מקומיות, המלצות, fallback ואוטומציות.",
    cadenceHe: "חודשי",
    periodDays: 30,
    metricKeys: [
      "rec_approved_rate",
      "rec_edited_rate",
      "rec_rejected_rate",
      "ai_runs_count",
      "ai_recommendations_count",
      "ai_fallbacks",
      "automation_success",
    ],
    ownerId: "u-tzachi",
  },
  {
    id: "rd-7",
    key: "submission-readiness",
    titleHe: "דוח מוכנות להגשה",
    descriptionHe:
      "תוצאות עסקיות במצבן הכן: מה נמדד (הכנסות, המרה) ומה טרם נמדד (NPS, ROI, זמן שנחסך, שימור, זמינות).",
    cadenceHe: "לפי דרישה",
    periodDays: 30,
    metricKeys: [
      "revenue_total",
      "approved_revenue",
      "quotation_conversion",
      "nps",
      "roi",
      "time_saved_hours",
      "customer_retention",
      "downtime",
    ],
    ownerId: "u-tzachi",
  },
];

export interface ReportRepo {
  list(): Promise<ReportDefinition[]>;
  create(item: ReportDefinition): Promise<ReportDefinition>;
}

/**
 * Idempotent bootstrap: create only the canonical definitions whose stable id
 * is not present yet. Returns the ids actually created (empty on re-run).
 */
export async function bootstrapReportDefinitions(
  repo: ReportRepo,
  nowISO: ISODate,
): Promise<string[]> {
  const existing = new Set((await repo.list()).map((d) => d.id));
  const created: string[] = [];
  for (const def of CANONICAL_REPORTS) {
    if (existing.has(def.id)) continue;
    await repo.create({ ...def, createdAt: nowISO, updatedAt: nowISO });
    created.push(def.id);
  }
  return created;
}

function fmtValue(value: number | null, unit: string): string {
  if (value === null) return NOT_MEASURED_HE;
  const v = Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
  return `${v} ${unit}`.trim();
}

/** period covering the report's last periodDays, ending at nowISO */
export function reportPeriod(def: Pick<ReportDefinition, "periodDays">, nowISO: ISODate): AnalyticsPeriod {
  const end = Date.parse(nowISO);
  const start = end - def.periodDays * 86_400_000;
  return {
    startISO: new Date(start).toISOString(),
    endISO: new Date(end).toISOString(),
    labelHe: `${def.periodDays} ימים אחרונים`,
  };
}

/**
 * Generate one run from REAL engine rows. Pure except for the id the caller
 * provides — persistence is the caller's concern (stores + page).
 */
export function buildReportRun(
  def: ReportDefinition,
  sources: AnalyticsSources,
  generatedBy: string,
  runId: string,
): ReportRun {
  const period = reportPeriod(def, sources.nowISO);
  const rows: ReportRunRow[] = [];
  const limitations = new Set<string>();
  for (const key of def.metricKeys) {
    const metric = metricByKey(key);
    if (metric === undefined) continue;
    // snapshot metrics aggregate over the whole current range; series metrics
    // aggregate over the report period — both via the same honest bucket fn.
    const p = metric.temporality === "series" ? period : wholeRange(sources.nowISO, "30d");
    const b = computeBucket(metric, sources, p);
    for (const l of metric.limitationsHe) limitations.add(l);
    rows.push({
      metricKey: key,
      titleHe: metric.titleHe,
      value: b.value,
      unit: metric.unit,
      displayHe: fmtValue(b.value, metric.unit),
      sampleSize: b.sampleSize,
      dataCompleteness: b.dataCompleteness,
      calculationMethod: `${metric.calculationMethodHe} · ${b.methodNoteHe}`,
      limitations: metric.limitationsHe,
    });
  }
  const unmeasuredCount = rows.filter((r) => r.value === null).length;
  if (unmeasuredCount > 0) {
    limitations.add(`${unmeasuredCount} מתוך ${rows.length} מדדים בדוח טרם נמדדו — מוצגים ללא ערך`);
  }
  return {
    id: runId,
    createdAt: sources.nowISO,
    updatedAt: sources.nowISO,
    reportDefinitionId: def.id,
    periodStart: period.startISO,
    periodEnd: period.endISO,
    generatedAt: sources.nowISO,
    generatedBy,
    rows,
    limitations: [...limitations],
    exportState: { csvExportedAt: null, printedAt: null },
  };
}
