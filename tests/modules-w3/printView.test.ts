import { describe, expect, it } from "vitest";
import { buildQuotationPrintHtml, escapeHtml } from "@/modules/quotations/printView";
import type { Quotation } from "@/domain/types";

function makeQuote(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: "q-test",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z",
    customerName: "לקוח בדיקה",
    customerId: null,
    title: "הצעה לבדיקה",
    lines: [
      { id: "q-test-1", description: "שורה רגילה", quantity: 2, unitPrice: 100, productId: null },
    ],
    discountPercent: 10,
    terms: "שוטף + 30",
    validUntil: "2026-08-01",
    status: "טיוטה",
    ownerId: "u-tzachi",
    ...overrides,
  };
}

describe("printView — escapeHtml", () => {
  it("escapes all five dangerous characters", () => {
    expect(escapeHtml(`<script>alert("x&y'")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;y&#39;&quot;)&lt;/script&gt;",
    );
  });

  it("passes numbers through as text", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("printView — buildQuotationPrintHtml", () => {
  it("escapes hostile customer/title/line/terms fields (donor XSS must not recur)", () => {
    const hostile = makeQuote({
      customerName: `<img src=x onerror="alert(1)">`,
      title: `<script>steal()</script>`,
      terms: `"><iframe>`,
      lines: [
        {
          id: "l1",
          description: `<b onmouseover=x>שורה</b>`,
          quantity: 1,
          unitPrice: 100,
          productId: null,
        },
      ],
    });
    const html = buildQuotationPrintHtml(hostile, `<em>owner</em>`);
    expect(html).not.toContain("<script>steal()");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<iframe>");
    expect(html).not.toContain("<em>owner</em>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders RTL document with totals incl. VAT", () => {
    const html = buildQuotationPrintHtml(makeQuote(), "צחי זוסטייהם");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("טרגון טכנולוגיות");
    // 200 subtotal, 10% discount → 180, VAT 32 → 212
    expect(html).toContain("212");
    expect(html).toContain('מע"מ (18%)');
  });

  it("omits the discount row when discount is 0", () => {
    const html = buildQuotationPrintHtml(makeQuote({ discountPercent: 0 }), "בעלים");
    expect(html).not.toContain("הנחה (");
  });
});
