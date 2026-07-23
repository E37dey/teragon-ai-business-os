// W8-A — printable A4 view for report runs, following the submission print
// contract: RTL, light print palette, CSS-counter page numbers ("עמוד N"),
// product/version/date/owner header per section. Browser print / Save-as-PDF
// only — no native-PDF generation is claimed anywhere.
import type { ReactElement } from "react";
import type { ReportDefinition, ReportRun } from "@/domain/analytics";
import { NOT_MEASURED_HE } from "@/domain/analytics";
import { ANALYTICS_ENGINE_VERSION } from "@/analytics/catalogue";

export const ANALYTICS_PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .an-print-root, .an-print-root * { visibility: visible; }
  .an-print-root { position: absolute; inset-inline-start: 0; inset-block-start: 0; inline-size: 100%; display: block; }
  .an-no-print { display: none !important; }
}
@media screen { .an-print-root { display: none; } }
@page { size: A4; margin: 14mm; }
.an-print-root { color: #111; background: #fff; counter-reset: anpage; direction: rtl; }
.an-print-page { counter-increment: anpage; break-after: page; padding: 8px 0; border-bottom: 1px solid #ccc; }
.an-print-page footer::after { content: "עמוד " counter(anpage); color: #555; font-size: 11px; }
.an-print-page h2 { font-size: 16px; margin: 0 0 4px; }
.an-print-meta { font-size: 11px; color: #333; display: flex; gap: 12px; flex-wrap: wrap; }
.an-print-page table { border-collapse: collapse; font-size: 11px; inline-size: 100%; margin-block-start: 6px; }
.an-print-page td, .an-print-page th { border: 1px solid #999; padding: 3px 6px; text-align: right; }
.an-print-page ul { margin: 6px 0; padding-inline-start: 18px; font-size: 11px; }
.an-print-num { direction: ltr; unicode-bidi: isolate; }
`;

export interface ReportPrintProps {
  definition: ReportDefinition;
  run: ReportRun;
  ownerNameHe: string;
  generatedByNameHe: string;
}

/** one report run as a print section (A4 page with counter + header) */
export function ReportRunPrintView({
  definition,
  run,
  ownerNameHe,
  generatedByNameHe,
}: ReportPrintProps): ReactElement {
  return (
    <div className="an-print-root" dir="rtl">
      <section className="an-print-page">
        <h2>{definition.titleHe}</h2>
        <div className="an-print-meta">
          <span>מוצר: TERAGON AI BUSINESS OS · טרגון טכנולוגיות</span>
          <span>גרסת מנוע: {ANALYTICS_ENGINE_VERSION}</span>
          <span>תאריך הפקה: {run.generatedAt.slice(0, 10)}</span>
          <span>בעלים: {ownerNameHe}</span>
          <span>הופק על ידי: {generatedByNameHe}</span>
          <span>
            תקופה: <span className="an-print-num">{run.periodStart.slice(0, 10)}</span> —{" "}
            <span className="an-print-num">{run.periodEnd.slice(0, 10)}</span>
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>מדד</th>
              <th>ערך</th>
              <th>מדגם</th>
              <th>שלמות נתונים</th>
              <th>שיטת חישוב</th>
            </tr>
          </thead>
          <tbody>
            {run.rows.map((r) => (
              <tr key={r.metricKey}>
                <td>{r.titleHe}</td>
                <td>
                  {r.value === null ? (
                    NOT_MEASURED_HE
                  ) : (
                    <span className="an-print-num">{r.displayHe}</span>
                  )}
                </td>
                <td>
                  {r.sampleSize === null ? "—" : <span className="an-print-num">{r.sampleSize}</span>}
                </td>
                <td>{r.dataCompleteness}</td>
                <td>{r.calculationMethod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {run.limitations.length > 0 && (
          <ul>
            {run.limitations.map((l) => (
              <li key={l}>מגבלה: {l}</li>
            ))}
          </ul>
        )}
        <footer />
      </section>
    </div>
  );
}
