import { describe, expect, it } from "vitest";
import { resolveEdgeAuthority, type EdgeAuthorityInput } from "@/graph";

/** All six conditions satisfied for a FOREIGN_KEY_DERIVED → CANONICAL edge. */
function fkAllGood(overrides: Partial<EdgeAuthorityInput> = {}): EdgeAuthorityInput {
  return {
    provenance: "FOREIGN_KEY_DERIVED",
    registryAuthoritative: true,
    sourceEligible: true,
    targetExists: true,
    sameOrganization: true,
    sourceArchived: false,
    sourceRejected: false,
    sourceInvalid: false,
    ambiguousResolution: false,
    approvalState: "none",
    ...overrides,
  };
}

describe("resolveEdgeAuthority — centralized authority policy", () => {
  it("(a) FK_DERIVED is CANONICAL when all six conditions hold", () => {
    expect(resolveEdgeAuthority(fkAllGood()).authority).toBe("CANONICAL");
  });

  describe("(a) FK_DERIVED is DOWNGRADED (never CANONICAL) when any single condition fails", () => {
    it("registry NOT authoritative → DERIVED", () => {
      const d = resolveEdgeAuthority(fkAllGood({ registryAuthoritative: false }));
      expect(d.authority).toBe("DERIVED");
      expect(d.authority).not.toBe("CANONICAL");
    });

    it("source NOT eligible → UNVERIFIED", () => {
      expect(resolveEdgeAuthority(fkAllGood({ sourceEligible: false })).authority).toBe("UNVERIFIED");
    });

    it("target does NOT exist (broken FK) → UNVERIFIED (non-authoritative)", () => {
      const d = resolveEdgeAuthority(fkAllGood({ targetExists: false }));
      expect(d.authority).toBe("UNVERIFIED");
      expect(d.reasons.join(" ")).toContain("issue");
    });

    it("cross-organization → UNVERIFIED", () => {
      expect(resolveEdgeAuthority(fkAllGood({ sameOrganization: false })).authority).toBe(
        "UNVERIFIED",
      );
    });

    it("source archived → DERIVED", () => {
      expect(resolveEdgeAuthority(fkAllGood({ sourceArchived: true })).authority).toBe("DERIVED");
    });

    it("source rejected → REJECTED", () => {
      expect(resolveEdgeAuthority(fkAllGood({ sourceRejected: true })).authority).toBe("REJECTED");
    });

    it("source invalid → UNVERIFIED", () => {
      expect(resolveEdgeAuthority(fkAllGood({ sourceInvalid: true })).authority).toBe("UNVERIFIED");
    });

    it("ambiguous resolution → UNVERIFIED", () => {
      expect(resolveEdgeAuthority(fkAllGood({ ambiguousResolution: true })).authority).toBe(
        "UNVERIFIED",
      );
    });
  });

  it("(b) INFERRED can never be CANONICAL — capped at DERIVED even when everything else is perfect", () => {
    const d = resolveEdgeAuthority(fkAllGood({ provenance: "INFERRED" }));
    expect(d.authority).toBe("DERIVED");
    expect(d.authority).not.toBe("CANONICAL");
  });

  it("(b) INFERRED with a hard failure → UNVERIFIED", () => {
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "INFERRED", sourceEligible: false })).authority,
    ).toBe("UNVERIFIED");
  });

  it("(c) PROPOSED stays UNVERIFIED until approved (and even 'approved' stays UNVERIFIED here — re-provenance promotes it elsewhere)", () => {
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "PROPOSED", approvalState: "none" })).authority,
    ).toBe("UNVERIFIED");
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "PROPOSED", approvalState: "pending" })).authority,
    ).toBe("UNVERIFIED");
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "PROPOSED", approvalState: "approved" }))
        .authority,
    ).toBe("UNVERIFIED");
  });

  it("(d) REJECTED (source rejected OR approval rejected) is never authoritative", () => {
    expect(resolveEdgeAuthority(fkAllGood({ sourceRejected: true })).authority).toBe("REJECTED");
    expect(resolveEdgeAuthority(fkAllGood({ approvalState: "rejected" })).authority).toBe(
      "REJECTED",
    );
    // even an EXPLICIT edge with a rejected source is REJECTED.
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "EXPLICIT", sourceRejected: true })).authority,
    ).toBe("REJECTED");
  });

  it("(e) ambiguous resolution caps authority below CANONICAL for every canonical-eligible provenance", () => {
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "EXPLICIT", ambiguousResolution: true }))
        .authority,
    ).toBe("UNVERIFIED");
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "FOREIGN_KEY_DERIVED", ambiguousResolution: true }))
        .authority,
    ).toBe("UNVERIFIED");
  });

  it("EXPLICIT is CANONICAL by construction (no registry flag required)", () => {
    expect(
      resolveEdgeAuthority(fkAllGood({ provenance: "EXPLICIT", registryAuthoritative: false }))
        .authority,
    ).toBe("CANONICAL");
  });

  it("returns human-readable reasons", () => {
    expect(resolveEdgeAuthority(fkAllGood()).reasons.length).toBeGreaterThan(0);
  });
});
