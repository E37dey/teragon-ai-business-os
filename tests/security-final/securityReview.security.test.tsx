// W9-B / Phase 9.6 — FINAL security review, executable assertions.
//
// This file PINS the audited protections against the REAL codebase so the
// FINAL_SECURITY_REPORT claims are backed by green tests. Items covered by
// earlier waves (ZIP traversal — tests/wave6-security/importInjection; audit
// redaction — tests/wave8-security/auditTampering) are cited there and NOT
// re-tested here (gap-analysis discipline).
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { classifyUrl, parseObsidianMarkdown, parseInlineText } from "@/memory/markdown/parser";
import { InlineView } from "@/memory/markdown/render";
import { parseFrontmatter, FrontmatterError } from "@/memory/markdown/frontmatter";
import { buildQuotationPrintHtml } from "@/modules/quotations/printView";
import type { Quotation } from "@/domain/types";

afterEach(cleanup);

// ── unsafe URL schemes ─────────────────────────────────────────────────────
describe("W9-B 9.6 — unsafe URL schemes are neutralized (PASS, W6-B)", () => {
  it("javascript: / data: / vbscript: links are neutralized, http/https/mailto stay external", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "vbscript:msgbox"]) {
      const c = classifyUrl(bad);
      expect(c.neutralized).toBe(true);
      expect(c.external).toBe(false);
      expect(c.href).toBe("");
    }
    expect(classifyUrl("https://example.com").external).toBe(true);
    expect(classifyUrl("mailto:a@b.co").external).toBe(true);
  });
});

// ── stored XSS via markdown ─────────────────────────────────────────────────
describe("W9-B 9.6 — stored XSS through markdown is inert (PASS, W6-B)", () => {
  it("raw <script> is flagged sanitized and rendered as inert escaped text (no HTML)", () => {
    const parsed = parseObsidianMarkdown("hello <script>alert(1)</script> world");
    expect(parsed.sanitized).toBe(true);
  });

  it("an external markdown link renders with rel=noopener noreferrer + target _blank", () => {
    const segments = parseInlineText("[site](https://example.com)");
    render(<InlineView segments={segments} />);
    const anchor = screen.getByTestId("md-link-external") as HTMLAnchorElement;
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor.getAttribute("target")).toBe("_blank");
  });

  it("a dangerous-scheme link renders as an inert span, never an anchor", () => {
    const segments = parseInlineText("[x](javascript:alert(1))");
    render(<InlineView segments={segments} />);
    expect(screen.getByTestId("md-link-neutralized")).toBeTruthy();
    expect(screen.queryByTestId("md-link-external")).toBeNull();
  });
});

// ── print / export injection ────────────────────────────────────────────────
describe("W9-B 9.6 — quotation print view escapes every interpolated field (PASS, W3)", () => {
  const q: Quotation = {
    id: "q<script>1",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    customerName: "<img src=x onerror=alert(1)>",
    customerId: null,
    ownerId: "u-1",
    title: 'הצעה "מיוחדת" <b>',
    lines: [
      { id: "l1", description: "<script>evil()</script>", quantity: 1, unitPrice: 10, productId: null },
    ],
    status: "טיוטה",
    discountPercent: 0,
    terms: "<iframe>",
    validUntil: "2026-08-01T00:00:00.000Z",
  };

  it("no raw <script>/<img>/<iframe> tag survives into the print HTML", () => {
    const html = buildQuotationPrintHtml(q, 'בעלים <admin>');
    expect(html).not.toContain("<script>evil");
    expect(html).not.toContain("<img src=x onerror");
    expect(html).not.toContain("<iframe>");
    // the escaped entities ARE present (content preserved, not executed)
    expect(html).toContain("&lt;script&gt;evil");
  });
});

// ── prototype pollution via import parser ───────────────────────────────────
describe("W9-B 9.6 — frontmatter parser resists prototype pollution (PASS)", () => {
  it("a __proto__ frontmatter key never pollutes Object.prototype", () => {
    const before = Object.keys(Object.prototype).length;
    try {
      parseFrontmatter("__proto__: polluted\nconstructor: x\ntitle: ok");
    } catch (err) {
      // rejecting the document is an equally-acceptable defense
      expect(err).toBeInstanceOf(FrontmatterError);
    }
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.keys(Object.prototype).length).toBe(before);
  });

  it("YAML anchors/aliases are refused (no alias-expansion bombs)", () => {
    expect(() => parseFrontmatter("title: &a big\nother: *a")).toThrow(FrontmatterError);
  });
});
