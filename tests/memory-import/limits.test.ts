// W6-B — limits matrix: every constant is pinned; every overflow rejects
// with the typed Hebrew error.
import { describe, expect, it } from "vitest";
import {
  IMPORT_ALLOWED_EXTENSIONS,
  IMPORT_MAX_COMPRESSION_RATIO,
  IMPORT_MAX_DIR_DEPTH,
  IMPORT_MAX_FILES,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_MARKDOWN_CHARS,
  IMPORT_MAX_TOTAL_BYTES,
  MemoryImportError,
} from "@/memory/import/limits";
import { FRONTMATTER_MAX_BYTES } from "@/memory/markdown/frontmatter";
import { prepareImport } from "@/memory/import/pipeline";
import { enc, md } from "./helpers";

describe("limit constants (contract)", () => {
  it("pins the mandated limits", () => {
    expect([...IMPORT_ALLOWED_EXTENSIONS]).toEqual([".md", ".markdown", ".zip"]);
    expect(IMPORT_MAX_TOTAL_BYTES).toBe(20 * 1024 * 1024);
    expect(IMPORT_MAX_FILES).toBe(200);
    expect(IMPORT_MAX_FILE_BYTES).toBe(2 * 1024 * 1024);
    expect(IMPORT_MAX_COMPRESSION_RATIO).toBe(100);
    expect(IMPORT_MAX_DIR_DEPTH).toBe(8);
    expect(IMPORT_MAX_MARKDOWN_CHARS).toBe(500_000);
    expect(FRONTMATTER_MAX_BYTES).toBe(16 * 1024);
  });
});

describe("prepareImport enforcement", () => {
  it("rejects an empty selection", async () => {
    await expect(prepareImport([], [])).rejects.toBeInstanceOf(MemoryImportError);
  });

  it("rejects disallowed extensions per-file (honest rejection list)", async () => {
    const preview = await prepareImport([md("note.md", "# א\nתוכן"), md("evil.exe", "x")], []);
    expect(preview.files).toHaveLength(1);
    expect(preview.rejections).toHaveLength(1);
    expect(preview.rejections[0]?.code).toBe("EXTENSION_NOT_ALLOWED");
    expect(preview.rejections[0]?.messageHe).toContain("סוג קובץ לא נתמך");
  });

  it("rejects when total exceeds 20MB", async () => {
    const big = { name: "big.md", bytes: new Uint8Array(IMPORT_MAX_TOTAL_BYTES + 1) };
    try {
      await prepareImport([big], []);
      expect.unreachable("should throw");
    } catch (e) {
      expect((e as MemoryImportError).code).toBe("TOTAL_TOO_LARGE");
    }
  });

  it("rejects a single markdown file over 2MB", async () => {
    const big = { name: "one.md", bytes: new Uint8Array(IMPORT_MAX_FILE_BYTES + 1) };
    const preview = await prepareImport([big], []);
    expect(preview.files).toHaveLength(0);
    expect(preview.rejections[0]?.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects more than 200 markdown files", async () => {
    const inputs = Array.from({ length: 201 }, (_, i) => md(`n${i}.md`, "# א\nתוכן"));
    try {
      await prepareImport(inputs, []);
      expect.unreachable("should throw");
    } catch (e) {
      expect((e as MemoryImportError).code).toBe("TOO_MANY_FILES");
    }
  });

  it("rejects markdown over 500K chars", async () => {
    const long = { name: "long.md", bytes: enc.encode("א".repeat(IMPORT_MAX_MARKDOWN_CHARS + 1)) };
    const preview = await prepareImport([long], []);
    expect(preview.rejections[0]?.code).toBe("MARKDOWN_TOO_LONG");
  });

  it("rejects oversized frontmatter (>16KB) with the Hebrew reason", async () => {
    const fm = `---\nnote: ${"x".repeat(FRONTMATTER_MAX_BYTES + 10)}\n---\nגוף`;
    const preview = await prepareImport([md("fm.md", fm)], []);
    expect(preview.files).toHaveLength(0);
    expect(preview.rejections[0]?.code).toBe("FRONTMATTER");
    expect(preview.rejections[0]?.messageHe).toContain("frontmatter");
  });

  it("rejects an empty markdown file (no silent skip)", async () => {
    const preview = await prepareImport([md("empty.md", "   \n")], []);
    expect(preview.rejections[0]?.code).toBe("EMPTY_FILE");
  });
});
