// TERAGON Business Graph — Phase 11 OPERATOR-AUTH credential-verification tests.
// Salted SHA-256 verifier; constant-time compare; wrong secret denied; the raw
// secret never stored/echoed.
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/governance/checksum";
import { constantTimeEqual, verifyOperatorSecret } from "@/graph";
import { freshSalt, freshSecret, verifierFor } from "./helpers";

describe("constantTimeEqual", () => {
  it("is true only for exact equality", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  it("returns false for unequal lengths without early exit", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "x")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("does not short-circuit on the first differing character", () => {
    // both a leading-diff and a trailing-diff of equal length must be false.
    const base = "0".repeat(64);
    const leadDiff = "1" + "0".repeat(63);
    const tailDiff = "0".repeat(63) + "1";
    expect(constantTimeEqual(base, leadDiff)).toBe(false);
    expect(constantTimeEqual(base, tailDiff)).toBe(false);
  });
});

describe("verifyOperatorSecret", () => {
  it("accepts the correct secret against its salted-hash verifier", () => {
    const secret = freshSecret();
    const salt = freshSalt();
    expect(verifyOperatorSecret(secret, verifierFor(secret, salt))).toBe(true);
  });

  it("rejects a wrong secret", () => {
    const secret = freshSecret();
    const salt = freshSalt();
    const verifier = verifierFor(secret, salt);
    expect(verifyOperatorSecret(freshSecret(), verifier)).toBe(false);
    expect(verifyOperatorSecret(secret + "x", verifier)).toBe(false);
  });

  it("depends on the salt (same secret, different salt ⇒ different hash)", () => {
    const secret = freshSecret();
    const v1 = verifierFor(secret, "salt-a");
    const v2 = verifierFor(secret, "salt-b");
    expect(v1.hashHex).not.toBe(v2.hashHex);
    expect(verifyOperatorSecret(secret, v1)).toBe(true);
    expect(verifyOperatorSecret(secret, v2)).toBe(true);
  });

  it("compares the SHA-256 of salt+secret (never the raw secret)", () => {
    const secret = freshSecret();
    const salt = freshSalt();
    const verifier = verifierFor(secret, salt);
    expect(verifier.hashHex).toBe(sha256Hex(salt + secret));
    // the verifier holds only a digest — not the secret itself.
    expect(JSON.stringify(verifier)).not.toContain(secret);
  });
});
