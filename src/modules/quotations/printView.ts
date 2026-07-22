// Wave 3 — quotation print view. The legacy donor injected raw strings into
// document.write (self-XSS). Here EVERY interpolated field passes escapeHtml
// first — no exceptions (unit tested).
import type { Quotation } from "@/domain/types";
import { quoteTotals, VAT_RATE } from "./quoteMath";
import { ils, dateHe } from "./fmt";

/** HTML-escape every interpolated value (donor XSS — do not repeat). */
export function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Build the full standalone RTL print document for a quotation. All fields escaped. */
export function buildQuotationPrintHtml(q: Quotation, ownerName: string): string {
  const totals = quoteTotals(q.lines, q.discountPercent);
  const rows = q.lines
    .map(
      (line, i) => `<tr>
        <td>${escapeHtml(i + 1)}</td>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${escapeHtml(line.quantity)}</td>
        <td class="num">${escapeHtml(ils(line.unitPrice))}</td>
        <td class="num">${escapeHtml(ils(line.quantity * line.unitPrice))}</td>
      </tr>`,
    )
    .join("");

  const discountRow =
    q.discountPercent > 0
      ? `<tr><td colspan="4">הנחה (${escapeHtml(q.discountPercent)}%)</td><td class="num">-${escapeHtml(ils(totals.discountAmount))}</td></tr>`
      : "";

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<title>הצעת מחיר ${escapeHtml(q.id)} — טרגון טכנולוגיות</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Heebo", "Assistant", Arial, sans-serif; color: #111827; margin: 0; padding: 32px; direction: rtl; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 700; color: #1d4ed8; }
  .brand small { display: block; font-size: 12px; color: #6b7280; font-weight: 400; }
  .meta { text-align: left; font-size: 13px; color: #374151; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: right; }
  th { background: #f3f4f6; }
  td.num, th.num { text-align: left; direction: ltr; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 600; }
  .totals { margin-top: 4px; }
  .grand td { background: #eff6ff; font-size: 15px; }
  .terms { margin-top: 24px; font-size: 13px; color: #374151; }
  .foot { margin-top: 40px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  @media print { body { padding: 12mm; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">טרגון טכנולוגיות<small>הדפסת תלת־ממד · קורסים · שירות</small></div>
    <div class="meta">
      <div>מס' הצעה: ${escapeHtml(q.id)}</div>
      <div>תאריך: ${escapeHtml(dateHe(q.updatedAt))}</div>
      <div>בתוקף עד: ${escapeHtml(dateHe(q.validUntil))}</div>
    </div>
  </div>
  <h1>${escapeHtml(q.title)}</h1>
  <div class="sub">לכבוד: ${escapeHtml(q.customerName)} · מטעם: ${escapeHtml(ownerName)}</div>
  <table>
    <thead>
      <tr><th>#</th><th>תיאור</th><th class="num">כמות</th><th class="num">מחיר יח'</th><th class="num">סה"כ</th></tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot class="totals">
      <tr><td colspan="4">סכום ביניים</td><td class="num">${escapeHtml(ils(totals.subtotal))}</td></tr>
      ${discountRow}
      <tr><td colspan="4">מע"מ (${escapeHtml(Math.round(VAT_RATE * 100))}%)</td><td class="num">${escapeHtml(ils(totals.vatAmount))}</td></tr>
      <tr class="grand"><td colspan="4">סה"כ לתשלום</td><td class="num">${escapeHtml(ils(totals.grandTotal))}</td></tr>
    </tfoot>
  </table>
  ${q.terms ? `<div class="terms"><strong>תנאים:</strong> ${escapeHtml(q.terms)}</div>` : ""}
  <div class="foot">טרגון טכנולוגיות · office@teragon.co.il · 03-9000000 — מסמך זה הופק ממערכת TERAGON AI BUSINESS OS (נתוני הדגמה)</div>
</body>
</html>`;
}

/** Open the print view in a new window and trigger the browser print dialog. */
export function openQuotationPrintView(q: Quotation, ownerName: string): boolean {
  const html = buildQuotationPrintHtml(q, ownerName);
  // NOTE: no "noopener" here — it would null the handle we must write into.
  // The document is fully self-authored (all fields escaped), never a foreign origin.
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // give fonts/layout a beat before the dialog
  win.setTimeout(() => win.print(), 250);
  return true;
}
