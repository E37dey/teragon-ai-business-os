// TERAGON Business Graph — deterministic hashing tests (Phase 4.1, SHA-256).
import { describe, expect, it } from "vitest";
import { canonicalJSON, sha256Hex, hashContent, buildSnapshotId } from "@/graph";

describe("deterministic content hashing", () => {
  it("canonicalJSON is key-order independent", () => {
    const a = canonicalJSON({ b: 1, a: 2, c: [3, { z: 9, y: 8 }] });
    const b = canonicalJSON({ c: [3, { y: 8, z: 9 }], a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("canonicalJSON preserves array order (arrays are ordered content)", () => {
    expect(canonicalJSON([1, 2, 3])).not.toBe(canonicalJSON([3, 2, 1]));
  });

  it("canonicalJSON drops undefined object properties", () => {
    expect(canonicalJSON({ a: 1, b: undefined })).toBe(canonicalJSON({ a: 1 }));
  });

  it("canonicalJSON refuses non-finite numbers (not stable JSON)", () => {
    expect(() => canonicalJSON(Number.NaN)).toThrow();
    expect(() => canonicalJSON(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("sha256Hex is a stable 64-char (256-bit) hex string via Web Crypto", async () => {
    const h = await sha256Hex("teragon");
    expect(h).toMatch(/^[0-9a-f]{64}$/u);
    // the STANDARD SHA-256("teragon") digest — proves Web Crypto emits the
    // canonical digest, byte-identical in browser + Node (no external dependency).
    expect(h).toBe("0610987c75ff7dbd4386657d99479069ebb364f67d87bb30e821c2adf08ff13c");
    expect(await sha256Hex("teragon")).toBe(h);
  });

  it("identical input ⇒ identical SHA-256; a one-byte change ⇒ different digest", async () => {
    const a = await sha256Hex("teragon");
    const b = await sha256Hex("teragoN"); // one byte changed
    expect(a).not.toBe(b);
    expect(await sha256Hex("teragon")).toBe(a);
  });

  it("different content yields different hashes", async () => {
    expect(await hashContent({ a: 1 })).not.toBe(await hashContent({ a: 2 }));
  });

  it("identical canonical input yields identical hash (key-order independent)", async () => {
    expect(await hashContent({ x: [1, 2], y: "ק" })).toBe(await hashContent({ y: "ק", x: [1, 2] }));
  });

  it("buildSnapshotId embeds the full digest and sanitizes the org", () => {
    const full = "a".repeat(64);
    const id = buildSnapshotId("org/with:weird chars", full);
    expect(id).toBe(`idx-org_with_weird_chars-${full}`);
    expect(buildSnapshotId("org-a", full)).toBe(`idx-org-a-${full}`);
  });
});
