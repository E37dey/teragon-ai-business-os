// Wave 3 — quotation money math (pure, unit tested).
// VAT 18% · discount capped at MAX_DISCOUNT_PERCENT with a Hebrew error.
import type { Quotation, QuotationLine, QuotationStatus } from "@/domain/types";

export const VAT_RATE = 0.18;

/** Business rule: discounts above this require a CEO override outside the system. */
export const MAX_DISCOUNT_PERCENT = 30;

export interface QuoteTotals {
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  vatAmount: number;
  grandTotal: number;
}

export function lineTotal(line: Pick<QuotationLine, "quantity" | "unitPrice">): number {
  return line.quantity * line.unitPrice;
}

export function linesSubtotal(
  lines: readonly Pick<QuotationLine, "quantity" | "unitPrice">[],
): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

/** Full money breakdown: subtotal → discount → VAT 18% → grand total (rounded ₪). */
export function quoteTotals(
  lines: readonly Pick<QuotationLine, "quantity" | "unitPrice">[],
  discountPercent: number,
): QuoteTotals {
  const subtotal = linesSubtotal(lines);
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = Math.round(afterDiscount * VAT_RATE);
  return {
    subtotal,
    discountAmount,
    afterDiscount,
    vatAmount,
    grandTotal: afterDiscount + vatAmount,
  };
}

/**
 * Hebrew validation error for a discount value, or null when valid.
 * Rule: 0 ≤ pct ≤ MAX_DISCOUNT_PERCENT (over-max requires CEO approval outside the flow).
 */
export function validateDiscount(pct: number): string | null {
  if (Number.isNaN(pct)) return "יש להזין אחוז הנחה מספרי";
  if (pct < 0) return "הנחה לא יכולה להיות שלילית";
  if (pct > MAX_DISCOUNT_PERCENT)
    return `הנחה מעל ${MAX_DISCOUNT_PERCENT}% דורשת אישור מנכ"ל — הזינו ערך עד ${MAX_DISCOUNT_PERCENT}%`;
  return null;
}

/** Quotation status flow: which statuses may follow the current one. */
export const QUOTATION_NEXT_STATUS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  טיוטה: ["נשלחה"],
  נשלחה: ["אושרה", "נדחתה", "פג תוקף"],
  אושרה: [],
  נדחתה: ["טיוטה"],
  "פג תוקף": ["טיוטה"],
};

/** true when the quotation may still be edited (only drafts are editable). */
export function isEditable(status: QuotationStatus): boolean {
  return status === "טיוטה";
}

/** true when validUntil passed and the quotation is still open. */
export function isExpired(q: Pick<Quotation, "validUntil" | "status">, todayIso: string): boolean {
  return (q.status === "טיוטה" || q.status === "נשלחה") && q.validUntil < todayIso;
}

/** open quotations expiring within `days` days (not yet expired). */
export function expiringSoon<T extends Pick<Quotation, "validUntil" | "status">>(
  quotations: readonly T[],
  todayIso: string,
  days = 7,
): T[] {
  const limit = new Date(`${todayIso}T00:00:00`);
  limit.setDate(limit.getDate() + days);
  const limitIso = limit.toISOString().slice(0, 10);
  return quotations.filter(
    (q) =>
      (q.status === "טיוטה" || q.status === "נשלחה") &&
      q.validUntil >= todayIso &&
      q.validUntil <= limitIso,
  );
}
