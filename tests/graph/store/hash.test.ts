// TERAGON Business Graph — deterministic hashing tests (Phase 4).
import { describe, expect, it } from "vitest";
import { canonicalJSON, fnv1a64, hashContent, buildSnapshotId } from "@/graph";

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

  it("fnv1a64 is a stable 16-char hex string", () => {
    const h = fnv1a64("teragon");
    expect(h).toMatch(/^[0-9a-f]{16}$/u);
    expect(fnv1a64("teragon")).toBe(h);
  });

  it("different content yields different hashes", () => {
    expect(hashContent({ a: 1 })).not.toBe(hashContent({ a: 2 }));
  });

  it("identical canonical input yields identical hash", () => {
    expect(hashContent({ x: [1, 2], y: "ק" })).toBe(hashContent({ y: "ק", x: [1, 2] }));
  });

  it("buildSnapshotId is deterministic and sanitizes the org", () => {
    const id = buildSnapshotId("org/with:weird chars", "abcdef0123456789");
    expect(id).toBe("idx-org_with_weird_chars-abcdef0123456789");
    expect(buildSnapshotId("org-a", "deadbeefdeadbeef")).toBe("idx-org-a-deadbeefdeadbeef");
  });
});
