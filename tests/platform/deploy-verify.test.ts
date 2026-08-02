// Gate S7.0 — deploy/verify provenance: wrong commit/site/project rejected;
// clean-tree + reviewed-commit preconditions enforced.
import { describe, expect, it } from "vitest";
import { assertCleanAndReviewed, verifyDeployProvenance } from "../../scripts/platform/deploy-preview.mjs";
import { assertPreviewHealth } from "../../scripts/platform/verify-preview.mjs";

describe("assertCleanAndReviewed", () => {
  it("passes only on a clean tree at the exact reviewed branch+commit", () => {
    const ok = assertCleanAndReviewed({ clean: true, branch: "feature/x", commit: "abc123" }, { branch: "feature/x", commit: "abc123" });
    expect(ok.ok).toBe(true);
  });

  it("fails on a dirty tree", () => {
    const r = assertCleanAndReviewed({ clean: false, branch: "feature/x", commit: "abc123" }, { branch: "feature/x", commit: "abc123" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/not clean/);
  });

  it("fails on the wrong branch or commit", () => {
    expect(assertCleanAndReviewed({ clean: true, branch: "other", commit: "abc" }, { branch: "feature/x", commit: "abc" }).ok).toBe(false);
    expect(assertCleanAndReviewed({ clean: true, branch: "feature/x", commit: "dead" }, { branch: "feature/x", commit: "beef" }).ok).toBe(false);
  });
});

describe("verifyDeployProvenance", () => {
  it("accepts a ready deploy on the intended commit + site", () => {
    const r = verifyDeployProvenance({ state: "ready", commit: "abc123", siteId: "site-1" }, { commit: "abc123", siteId: "site-1" });
    expect(r.ok).toBe(true);
  });

  it("REJECTS a mismatched commit", () => {
    const r = verifyDeployProvenance({ state: "ready", commit: "wrong", siteId: "site-1" }, { commit: "abc123", siteId: "site-1" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/commit/);
  });

  it("REJECTS a mismatched site", () => {
    const r = verifyDeployProvenance({ state: "ready", commit: "abc123", siteId: "wrong-site" }, { commit: "abc123", siteId: "site-1" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/site/);
  });

  it("REJECTS a non-ready deploy", () => {
    expect(verifyDeployProvenance({ state: "error", commit: "abc123", siteId: "site-1" }, { commit: "abc123", siteId: "site-1" }).ok).toBe(false);
  });
});

describe("assertPreviewHealth", () => {
  it("requires 200 + CSP header", () => {
    expect(assertPreviewHealth({ status: 200, headers: { "content-security-policy": "default-src 'self'" } }).ok).toBe(true);
    expect(assertPreviewHealth({ status: 500, headers: {} }).ok).toBe(false);
    expect(assertPreviewHealth({ status: 200, headers: {} }).ok).toBe(false);
  });
});
