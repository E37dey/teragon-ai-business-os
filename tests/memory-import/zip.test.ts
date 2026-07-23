// W6-B — minimal ZIP engine: round-trip, deflate read, and the full attack
// suite (traversal ×4 forms, bomb ratio pre-inflation + runtime cap, nested
// archives, duplicates, executables, symlinks, encryption, malformed UTF-8,
// CRC). Every rejection is a typed Hebrew MemoryImportError.
import { describe, expect, it } from "vitest";
import { readZip, writeZip, assertSafeZipPath } from "@/memory/zip/zip";
import { crc32 } from "@/memory/zip/crc32";
import { MemoryImportError, IMPORT_ERROR_HE } from "@/memory/import/limits";
import { deflateRaw, dec, enc, forgeZip } from "./helpers";

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    expect.unreachable(`expected rejection with ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(MemoryImportError);
    expect((e as MemoryImportError).code).toBe(code);
    // safe Hebrew error from the typed map
    expect((e as MemoryImportError).message).toContain(
      IMPORT_ERROR_HE[(e as MemoryImportError).code],
    );
  }
}

describe("round-trip (store method)", () => {
  it("write → read preserves paths (Hebrew incl.) and content", async () => {
    const zip = writeZip(
      [
        { path: "לקוחות/פתק.md", bytes: enc.encode("# פתק\nתוכן") },
        { path: "כללי/note-2.md", bytes: enc.encode("שני") },
      ],
      "2026-07-23T08:00:00.000Z",
    );
    const { entries } = await readZip(zip);
    expect(entries.map((e) => e.path).sort()).toEqual(["כללי/note-2.md", "לקוחות/פתק.md"]);
    const note = entries.find((e) => e.path === "לקוחות/פתק.md");
    expect(dec.decode(note?.bytes)).toBe("# פתק\nתוכן");
    expect(note?.method).toBe(0);
    expect(note?.malformedName).toBe(false);
  });

  it("writer is deterministic for a fixed date (stable bytes)", () => {
    const mk = (): Uint8Array => writeZip([{ path: "a.md", bytes: enc.encode("x") }], "2026-07-23T08:00:00.000Z");
    expect([...mk()]).toEqual([...mk()]);
  });
});

describe("deflate (method 8) read path", () => {
  it("inflates a genuine deflate-raw entry via DecompressionStream", async () => {
    const content = enc.encode("תוכן דחוס ".repeat(50));
    const compressed = await deflateRaw(content);
    const zip = forgeZip([
      { name: "c.md", data: compressed, method: 8, uncompressedSize: content.length, crc: crc32(content) },
    ]);
    const { entries } = await readZip(zip);
    expect(entries).toHaveLength(1);
    expect(dec.decode(entries[0]?.bytes)).toBe(dec.decode(content));
    expect(entries[0]?.method).toBe(8);
  });

  it("aborts mid-stream when actual output exceeds the declared size (runtime bomb guard)", async () => {
    const content = enc.encode("A".repeat(50_000));
    const compressed = await deflateRaw(content);
    // declared uncompressed LIES small (ratio looks fine) — runtime cap must catch it
    const zip = forgeZip([
      { name: "lie.md", data: compressed, method: 8, uncompressedSize: 600, crc: crc32(content) },
    ]);
    await expectCode(readZip(zip), "COMPRESSION_RATIO_EXCEEDED");
  });
});

describe("path traversal — 4 forms", () => {
  const payload = enc.encode("x");
  const evil = [
    "../evil.md", // dotdot
    "/abs/evil.md", // absolute
    "C:/evil.md", // drive letter
    "docs\\..\\..\\evil.md", // backslash trick
  ];
  for (const name of evil) {
    it(`rejects "${name}"`, async () => {
      await expectCode(readZip(forgeZip([{ name, data: payload }])), "ZIP_PATH_TRAVERSAL");
    });
  }

  it("assertSafeZipPath allows honest nested paths", () => {
    expect(assertSafeZipPath("a/b/c.md")).toBe("a/b/c.md");
  });

  it("rejects directory depth over 8", async () => {
    const deep = "a/b/c/d/e/f/g/h/i.md"; // 9 segments
    await expectCode(readZip(forgeZip([{ name: deep, data: payload }])), "DIR_DEPTH_EXCEEDED");
  });
});

describe("zip-bomb declared-ratio guard (BEFORE inflation)", () => {
  it("rejects a declared ratio over 100× without inflating", async () => {
    // 10 bytes "compressed", claims 1.5MB uncompressed (ratio 150,000×) —
    // screen must throw before any DecompressionStream work (data is garbage)
    const zip = forgeZip([
      { name: "bomb.md", data: enc.encode("0123456789"), method: 8, uncompressedSize: 1_500_000, crc: 0 },
    ]);
    await expectCode(readZip(zip), "COMPRESSION_RATIO_EXCEEDED");
  });
});

describe("hostile entries", () => {
  const payload = enc.encode("x");

  it("rejects nested archives", async () => {
    await expectCode(readZip(forgeZip([{ name: "inner.zip", data: payload }])), "ZIP_NESTED_ARCHIVE");
  });

  it("rejects hidden executables (.exe/.js/.sh/.ps1/.svg…)", async () => {
    for (const name of ["run.exe", "x.sh", "y.js", "z.ps1", "img.svg"]) {
      await expectCode(readZip(forgeZip([{ name, data: payload }])), "ZIP_EXECUTABLE");
    }
  });

  it("rejects duplicate filenames (collision, case-insensitive)", async () => {
    const zip = forgeZip([
      { name: "a.md", data: payload },
      { name: "A.md", data: payload },
    ]);
    await expectCode(readZip(zip), "ZIP_DUPLICATE_NAME");
  });

  it("rejects symlink entries (unix mode in external attrs)", async () => {
    const zip = forgeZip([{ name: "link.md", data: payload, externalAttrs: 0xa1ff0000 }]);
    await expectCode(readZip(zip), "ZIP_SYMLINK");
  });

  it("rejects encrypted entries", async () => {
    const zip = forgeZip([{ name: "enc.md", data: payload, flags: 0x1 }]);
    await expectCode(readZip(zip), "ZIP_ENCRYPTED");
  });

  it("decodes malformed UTF-8 names with safe replacement + flag", async () => {
    const badName = new Uint8Array([0xff, 0xfe, 0x61, 0x2e, 0x6d, 0x64]); // ??a.md
    const { entries } = await readZip(forgeZip([{ name: badName, data: payload }]));
    expect(entries[0]?.malformedName).toBe(true);
    expect(entries[0]?.path).toContain("�");
  });

  it("rejects a corrupted archive as malformed", async () => {
    await expectCode(readZip(enc.encode("not a zip at all")), "ZIP_MALFORMED");
  });

  it("rejects CRC mismatch (tampered content)", async () => {
    const zip = forgeZip([{ name: "t.md", data: payload, crc: 0xdeadbeef }]);
    await expectCode(readZip(zip), "ZIP_CRC_MISMATCH");
  });

  it("oversized single entry is rejected by declared size", async () => {
    const zip = forgeZip([
      { name: "big.md", data: enc.encode("small"), method: 8, uncompressedSize: 3 * 1024 * 1024, crc: 0 },
    ]);
    await expectCode(readZip(zip), "FILE_TOO_LARGE");
  });
});
