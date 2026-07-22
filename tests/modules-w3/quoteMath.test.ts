import { describe, expect, it } from "vitest";
import {
  expiringSoon,
  isEditable,
  isExpired,
  linesSubtotal,
  MAX_DISCOUNT_PERCENT,
  QUOTATION_NEXT_STATUS,
  quoteTotals,
  validateDiscount,
  VAT_RATE,
} from "@/modules/quotations/quoteMath";

describe("quoteMath — totals", () => {
  it("computes subtotal across lines", () => {
    expect(
      linesSubtotal([
        { quantity: 2, unitPrice: 100 },
        { quantity: 1, unitPrice: 50 },
      ]),
    ).toBe(250);
  });

  it("applies discount then VAT 18%", () => {
    const t = quoteTotals([{ quantity: 1, unitPrice: 1000 }], 10);
    expect(t.subtotal).toBe(1000);
    expect(t.discountAmount).toBe(100);
    expect(t.afterDiscount).toBe(900);
    expect(t.vatAmount).toBe(Math.round(900 * VAT_RATE));
    expect(t.grandTotal).toBe(900 + Math.round(900 * VAT_RATE));
  });

  it("zero discount keeps subtotal intact", () => {
    const t = quoteTotals([{ quantity: 3, unitPrice: 95 }], 0);
    expect(t.subtotal).toBe(285);
    expect(t.discountAmount).toBe(0);
    expect(t.grandTotal).toBe(285 + Math.round(285 * 0.18));
  });

  it("VAT rate is 18%", () => {
    expect(VAT_RATE).toBe(0.18);
  });
});

describe("quoteMath — discount validation (Hebrew errors)", () => {
  it("accepts the max boundary", () => {
    expect(validateDiscount(MAX_DISCOUNT_PERCENT)).toBeNull();
    expect(validateDiscount(0)).toBeNull();
  });

  it("rejects over-max with a Hebrew CEO-approval message", () => {
    const err = validateDiscount(MAX_DISCOUNT_PERCENT + 1);
    expect(err).toContain('דורשת אישור מנכ"ל');
    expect(err).toContain(String(MAX_DISCOUNT_PERCENT));
  });

  it("rejects negative and NaN", () => {
    expect(validateDiscount(-5)).toContain("שלילית");
    expect(validateDiscount(Number.NaN)).toContain("מספרי");
  });
});

describe("quoteMath — lifecycle", () => {
  it("only drafts are editable", () => {
    expect(isEditable("טיוטה")).toBe(true);
    expect(isEditable("נשלחה")).toBe(false);
    expect(isEditable("אושרה")).toBe(false);
  });

  it("status flow: draft→sent→approved/rejected/expired", () => {
    expect(QUOTATION_NEXT_STATUS["טיוטה"]).toEqual(["נשלחה"]);
    expect(QUOTATION_NEXT_STATUS["נשלחה"]).toContain("אושרה");
    expect(QUOTATION_NEXT_STATUS["נשלחה"]).toContain("נדחתה");
    expect(QUOTATION_NEXT_STATUS["אושרה"]).toEqual([]);
  });

  it("isExpired only for open quotes past validUntil", () => {
    expect(isExpired({ validUntil: "2026-07-01", status: "נשלחה" }, "2026-07-22")).toBe(true);
    expect(isExpired({ validUntil: "2026-08-01", status: "נשלחה" }, "2026-07-22")).toBe(false);
    expect(isExpired({ validUntil: "2026-07-01", status: "אושרה" }, "2026-07-22")).toBe(false);
  });

  it("expiringSoon finds open quotes within the window only", () => {
    const qs = [
      { validUntil: "2026-07-25", status: "נשלחה" as const },
      { validUntil: "2026-09-01", status: "נשלחה" as const },
      { validUntil: "2026-07-25", status: "אושרה" as const },
      { validUntil: "2026-07-20", status: "טיוטה" as const }, // already past
    ];
    const soon = expiringSoon(qs, "2026-07-22", 7);
    expect(soon).toHaveLength(1);
    expect(soon[0]?.validUntil).toBe("2026-07-25");
  });
});
