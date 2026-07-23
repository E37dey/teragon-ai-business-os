// W8-A — deterministic CSV serialization for tabular observations.
// null values export as an EMPTY cell + measured=false — never as 0.
// Only whitelisted metric fields are exported (no emails/phones/keys).
import type { MetricSeries, ReportRun } from "@/domain/analytics";
import { NOT_MEASURED_HE } from "@/domain/analytics";

function esc(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`;
  return cell;
}

function row(cells: readonly (string | number | null)[]): string {
  return cells.map((c) => (c === null ? "" : esc(String(c)))).join(",");
}

export const SERIES_CSV_HEADER = [
  "metricKey",
  "titleHe",
  "group",
  "periodStart",
  "periodEnd",
  "value",
  "unit",
  "measured",
  "sampleSize",
  "dataCompleteness",
  "calculationMethod",
  "limitations",
] as const;

/** BOM prefix so Excel opens the Hebrew correctly */
export const CSV_BOM = "﻿";

export function seriesToCsv(seriesList: readonly MetricSeries[]): string {
  const lines: string[] = [row([...SERIES_CSV_HEADER])];
  for (const s of seriesList) {
    for (const p of s.points) {
      lines.push(
        row([
          s.metricKey,
          s.titleHe,
          s.group,
          p.periodStart,
          p.periodEnd,
          p.value, // null ⇒ empty cell, NEVER 0
          p.unit,
          p.measured ? "true" : "false",
          p.sampleSize,
          p.dataCompleteness,
          p.calculationMethod,
          p.limitations.join(" | "),
        ]),
      );
    }
  }
  return lines.join("\r\n");
}

export const REPORT_CSV_HEADER = [
  "metricKey",
  "titleHe",
  "value",
  "unit",
  "displayHe",
  "sampleSize",
  "dataCompleteness",
  "calculationMethod",
  "limitations",
] as const;

export function reportRunToCsv(run: ReportRun): string {
  const lines: string[] = [row([...REPORT_CSV_HEADER])];
  for (const r of run.rows) {
    lines.push(
      row([
        r.metricKey,
        r.titleHe,
        r.value,
        r.unit,
        r.value === null ? NOT_MEASURED_HE : r.displayHe,
        r.sampleSize,
        r.dataCompleteness,
        r.calculationMethod,
        r.limitations.join(" | "),
      ]),
    );
  }
  return lines.join("\r\n");
}
