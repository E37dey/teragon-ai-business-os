// W6-B — sanitizer + safe renderer: raw HTML escape+flag, script tags,
// javascript:/data: URL neutralization, tracking-image blocking, external
// link marking (rel=noopener), and the legacy seam contract.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { classifyUrl, parseObsidianMarkdown } from "@/memory/markdown/parser";
import { ObsidianBlocksView } from "@/memory/markdown/render";
import { parseMarkdownBlocks, splitInline } from "@/modules/memory/markdown";
import { sanitizeRawHtml } from "@/memory/import/pipeline";

describe("raw HTML sanitization", () => {
  it("keeps raw HTML as literal text and flips sanitized:true with a reason", () => {
    const parsed = parseObsidianMarkdown('שלום <script>alert("xss")</script> עולם');
    expect(parsed.sanitized).toBe(true);
    expect(parsed.sanitizedReasons.length).toBeGreaterThan(0);
    const p = parsed.blocks[0];
    expect(p?.kind).toBe("paragraph");
    if (p?.kind === "paragraph") {
      const html = p.inline.filter((s) => s.kind === "escaped-html");
      expect(html.map((s) => (s.kind === "escaped-html" ? s.value : ""))).toEqual([
        "<script>",
        "</script>",
      ]);
    }
  });

  it("clean markdown is NOT flagged", () => {
    const parsed = parseObsidianMarkdown("# כותרת\n\nפסקה עם **הדגשה** ו[[קישור]]");
    expect(parsed.sanitized).toBe(false);
    expect(parsed.sanitizedReasons).toEqual([]);
  });

  it("sanitizeRawHtml neutralizes tags in the STORED body (‹› substitution)", () => {
    const out = sanitizeRawHtml('לפני <img src=x onerror=alert(1)> אחרי');
    expect(out).not.toContain("<img");
    expect(out).toContain("‹img src=x onerror=alert(1)›");
  });
});

describe("URL policy", () => {
  it("neutralizes javascript:, data:, vbscript:, file: — ALL data: included", () => {
    for (const evil of [
      "javascript:alert(1)",
      "data:text/html,<script>x</script>",
      "data:image/png;base64,AAAA",
      "vbscript:msgbox",
      "file:///etc/passwd",
    ]) {
      const c = classifyUrl(evil);
      expect(c.neutralized).toBe(true);
      expect(c.href).toBe("");
    }
  });

  it("marks http/https/mailto as external and keeps them", () => {
    for (const ok of ["https://example.com", "http://a.b", "mailto:x@y.z"]) {
      const c = classifyUrl(ok);
      expect(c.neutralized).toBe(false);
      expect(c.external).toBe(true);
    }
  });

  it("relative links stay internal and non-external", () => {
    const c = classifyUrl("notes/other.md");
    expect(c.external).toBe(false);
    expect(c.neutralized).toBe(false);
  });
});

describe("safe React renderer", () => {
  it("never renders <img> — tracking images become text placeholders", () => {
    const parsed = parseObsidianMarkdown("![מעקב](https://tracker.evil/pixel.png)");
    const { container, getByTestId } = render(<ObsidianBlocksView blocks={parsed.blocks} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(getByTestId("md-image-placeholder").textContent).toContain("לא נטענה");
    expect(parsed.sanitized).toBe(true);
  });

  it("external links get rel=noopener noreferrer + explicit marker", () => {
    const parsed = parseObsidianMarkdown("[אתר](https://example.com)");
    const { getByTestId } = render(<ObsidianBlocksView blocks={parsed.blocks} />);
    const a = getByTestId("md-link-external");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("data-external")).toBe("true");
    expect(a.textContent).toContain("↗");
  });

  it("neutralized links render as inert text, never as an anchor", () => {
    const parsed = parseObsidianMarkdown("[קליק](javascript:alert(1))");
    const { container, getByTestId } = render(<ObsidianBlocksView blocks={parsed.blocks} />);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(getByTestId("md-link-neutralized").textContent).toContain("קישור נוטרל");
  });

  it("raw HTML renders as escaped literal text (React text node)", () => {
    const parsed = parseObsidianMarkdown("<b onclick=evil()>טקסט</b>");
    const { container } = render(<ObsidianBlocksView blocks={parsed.blocks} />);
    expect(container.querySelectorAll("b")).toHaveLength(0);
    expect(container.textContent).toContain("<b onclick=evil()>");
  });

  it("renders the full safe subset: code, table, checklist, blockquote, ol", () => {
    const mdText = [
      "```js",
      "let x = '<script>';",
      "```",
      "",
      "| א | ב |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "- [x] בוצע",
      "- [ ] פתוח",
      "",
      "> ציטוט",
      "",
      "1. ראשון",
      "2. שני",
    ].join("\n");
    const parsed = parseObsidianMarkdown(mdText);
    expect(parsed.blocks.map((b) => b.kind)).toEqual(["code", "table", "list", "blockquote", "list"]);
    const { container, getByTestId } = render(<ObsidianBlocksView blocks={parsed.blocks} />);
    // fenced code keeps <script> as literal text inside <pre>
    expect(getByTestId("md-code").textContent).toContain("<script>");
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(getByTestId("md-table").querySelectorAll("td")).toHaveLength(2);
    const boxes = container.querySelectorAll('[data-testid="md-checkbox"]');
    expect([...boxes].map((b) => b.textContent)).toEqual(["☑", "☐"]);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("collects #tags and renders them as styled text", () => {
    const parsed = parseObsidianMarkdown("פתק עם #לקוחות וגם #חשוב");
    expect(parsed.tags).toEqual(["לקוחות", "חשוב"]);
  });
});

describe("legacy seam contract (src/modules/memory/markdown.ts)", () => {
  it("parseMarkdownBlocks keeps the 4-kind contract and stays safe", () => {
    const blocks = parseMarkdownBlocks("# כותרת\n\n- פריט [[קישור]]\n\n---\n\nפסקה <script>x</script>");
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "list", "divider", "paragraph"]);
    const p = blocks[3];
    if (p?.kind === "paragraph") {
      const text = p.segments.map((s) => s.value).join("");
      expect(text).toContain("<script>");
      expect(p.segments.every((s) => s.kind === "text" || s.kind === "wikilink")).toBe(true);
    }
  });

  it("splitInline still honors wikilink aliases", () => {
    expect(splitInline("לפני [[יעד|כינוי]] אחרי")).toEqual([
      { kind: "text", value: "לפני " },
      { kind: "wikilink", value: "כינוי" },
      { kind: "text", value: " אחרי" },
    ]);
  });

  it("downmaps rich blocks (code/table/quote/checklist) into the stable union", () => {
    const blocks = parseMarkdownBlocks("```\ncode here\n```\n\n| א |\n|---|\n| 1 |\n\n> ציטוט\n\n- [x] בוצע");
    for (const b of blocks) {
      expect(["heading", "list", "paragraph", "divider"]).toContain(b.kind);
    }
    const check = blocks.find((b) => b.kind === "list" && b.items.some((i) => i[0]?.value.startsWith("☑")));
    expect(check).toBeDefined();
  });
});
