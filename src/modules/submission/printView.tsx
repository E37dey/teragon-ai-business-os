// W7-E (Phase 7.20) — printable A4 view of the 12 deliverables. RTL, light
// print palette, CSS-counter page numbers, product+version+date+owner+
// approval+evidence refs, no navigation. Browser print / Save-as-PDF only —
// no native-PDF generation is claimed anywhere.
import type { ReactElement } from "react";
import {
  CANONICAL_CEO_NAME,
  CANONICAL_COMPANY_NAME,
  ONE_PAGER,
  SUBMISSION_METRICS,
  METRIC_GROUP_TITLES,
  SUPPORT_TIER_ARTEFACTS,
  type DeliverableEvaluation,
  type MetricGroupKey,
} from "@/domain/submission";
import { QUALITY_VALIDATOR_VERSION } from "@/validation/submission/qualityValidator";

export const SUBMISSION_PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .sub-print-root, .sub-print-root * { visibility: visible; }
  .sub-print-root { position: absolute; inset-inline-start: 0; inset-block-start: 0; inline-size: 100%; }
  .sub-no-print { display: none !important; }
}
@page { size: A4; margin: 14mm; }
.sub-print-root { color: #111; background: #fff; counter-reset: subpage; direction: rtl; }
.sub-print-page { counter-increment: subpage; break-after: page; padding: 8px 0; border-bottom: 1px solid #ccc; }
.sub-print-page footer::after { content: "עמוד " counter(subpage); color: #555; font-size: 11px; }
.sub-print-page h2 { font-size: 16px; margin: 0 0 4px; }
.sub-print-meta { font-size: 11px; color: #333; display: flex; gap: 12px; flex-wrap: wrap; }
.sub-print-page ul { margin: 6px 0; padding-inline-start: 18px; font-size: 12px; }
.sub-print-page table { border-collapse: collapse; font-size: 11px; inline-size: 100%; }
.sub-print-page td, .sub-print-page th { border: 1px solid #999; padding: 3px 6px; text-align: right; }
`;

function PrintSection({
  ev,
  dateISO,
  children,
}: {
  ev: DeliverableEvaluation;
  dateISO: string;
  children?: ReactElement | null;
}): ReactElement {
  return (
    <section className="sub-print-page">
      <h2>
        {ev.order}. {ev.title}
      </h2>
      <div className="sub-print-meta">
        <span>מוצר: TERAGON AI BUSINESS OS · {CANONICAL_COMPANY_NAME}</span>
        <span>גרסת ולידטור: {QUALITY_VALIDATOR_VERSION}</span>
        <span>תאריך: {dateISO.slice(0, 10)}</span>
        <span>בעלים: {ev.ownerNameHe ?? "לא הוקצה אחראי"}</span>
        <span>אישור: {ev.approvalStatusHe}</span>
        <span>מצב: {ev.state}</span>
      </div>
      <ul>
        {ev.evidence.map((e) => (
          <li key={e.label}>
            ראיה: {e.label} — {e.statusHe}
            {e.ref ? ` (${e.ref.collection}/${e.ref.recordId})` : ""}
          </li>
        ))}
        {ev.stateReasonsHe.map((r) => (
          <li key={r}>◦ {r}</li>
        ))}
      </ul>
      {children ?? null}
      <footer />
    </section>
  );
}

export function SubmissionPrintView({
  evaluations,
  dateISO,
}: {
  evaluations: readonly DeliverableEvaluation[];
  dateISO: string;
}): ReactElement {
  const groups: MetricGroupKey[] = ["A", "B", "C"];
  return (
    <div className="sub-print-root" dir="rtl">
      <header style={{ paddingBlockEnd: 8 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>
          מרכז ההגשה והראיות — {CANONICAL_COMPANY_NAME}
        </h1>
        <p style={{ fontSize: 12, margin: "4px 0" }}>
          מנכ"ל: {CANONICAL_CEO_NAME} · הודפס מתצוגת הדפדפן (הדפסה / שמירה כ-PDF) ·{" "}
          {dateISO.slice(0, 10)}
        </p>
      </header>
      {evaluations.map((ev) => (
        <PrintSection key={ev.key} ev={ev} dateISO={dateISO}>
          {ev.key === "one-pager" ? (
            <div>
              <h3 style={{ fontSize: 13 }}>הבעיה העסקית</h3>
              <ul>
                {ONE_PAGER.businessProblemHe.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <h3 style={{ fontSize: 13 }}>הפתרון</h3>
              <ul>
                {ONE_PAGER.solutionHe.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <h3 style={{ fontSize: 13 }}>ערך (מסומן-סוג)</h3>
              <ul>
                {ONE_PAGER.valueClaims.map((c) => (
                  <li key={c.claimHe}>
                    [{c.kindHe}] {c.claimHe} — {c.basisHe}
                  </li>
                ))}
              </ul>
            </div>
          ) : ev.key === "metric-levels" ? (
            <table>
              <thead>
                <tr>
                  <th>מדד</th>
                  <th>רמה</th>
                  <th>סוג</th>
                  <th>קו בסיס</th>
                  <th>יעד</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((g) =>
                  SUBMISSION_METRICS.filter((m) => m.group === g).map((m) => (
                    <tr key={m.key}>
                      <td>{m.nameHe}</td>
                      <td>{METRIC_GROUP_TITLES[g]}</td>
                      <td>{m.type}</td>
                      <td>{m.baseline === null ? "לא הוגדר קו בסיס" : m.baseline}</td>
                      <td>{m.targetHe ?? "—"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          ) : ev.key === "support-plan" ? (
            <table>
              <thead>
                <tr>
                  <th>שכבה</th>
                  <th>קהל</th>
                  <th>SLA יעד</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORT_TIER_ARTEFACTS.map((t) => (
                  <tr key={t.tier}>
                    <td>{t.titleHe}</td>
                    <td>{t.audienceHe}</td>
                    <td>{t.targetSlaHe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </PrintSection>
      ))}
    </div>
  );
}
