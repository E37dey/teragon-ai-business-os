// W8-A — page-side helpers: honest value formatting + real file download.
import type { MetricPoint } from "@/domain/analytics";
import { NOT_MEASURED_HE } from "@/domain/analytics";

/** null NEVER becomes 0 — it becomes the honest "טרם נמדד" */
export function fmtPointValue(value: number | null, unit: string): string {
  if (value === null) return NOT_MEASURED_HE;
  const v = Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
  return `${v} ${unit}`.trim();
}

/** the newest measured point of a series (null when nothing is measured) */
export function latestMeasured(points: readonly MetricPoint[]): MetricPoint | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i];
    if (p !== undefined && p.value !== null) return p;
  }
  return null;
}

/** REAL browser download — a Blob object URL, clicked and revoked. */
export function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function shortDateHe(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}
