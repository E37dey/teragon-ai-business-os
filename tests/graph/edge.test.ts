import { describe, expect, it } from "vitest";
import {
  businessGraphEdgeSchema,
  edgeIsAuthoritative,
  type BusinessGraphEdge,
} from "@/graph";

function baseEdge(overrides: Partial<BusinessGraphEdge> = {}): BusinessGraphEdge {
  return {
    id: "e-1" as BusinessGraphEdge["id"],
    organizationId: "org-1",
    relationshipType: "OWNS",
    source: "teragon://org-1/customer/cu-1" as BusinessGraphEdge["source"],
    target: "teragon://org-1/customer/cu-2" as BusinessGraphEdge["target"],
    direction: "directed",
    provenance: "EXPLICIT",
    authority: "CANONICAL",
    evidenceRefs: [],
    sensitivity: "פנימי",
    approvalState: "approved",
    validFrom: "2026-01-01",
    validUntil: null,
    createdAt: "2026-01-01",
    createdBy: null,
    version: 1,
    staleState: "FRESH",
    ...overrides,
  };
}

describe("edge contract", () => {
  it("accepts a well-formed EXPLICIT/CANONICAL edge", () => {
    expect(businessGraphEdgeSchema.safeParse(baseEdge()).success).toBe(true);
  });

  it("refuses CANONICAL authority on an INFERRED edge (#5)", () => {
    const r = businessGraphEdgeSchema.safeParse(
      baseEdge({ provenance: "INFERRED", authority: "CANONICAL" }),
    );
    expect(r.success).toBe(false);
  });

  it("refuses CANONICAL on a FOREIGN_KEY_DERIVED edge (only EXPLICIT may)", () => {
    expect(
      businessGraphEdgeSchema.safeParse(
        baseEdge({ provenance: "FOREIGN_KEY_DERIVED", authority: "CANONICAL" }),
      ).success,
    ).toBe(false);
  });

  it("a PROPOSED edge must be UNVERIFIED and can never be approved", () => {
    expect(
      businessGraphEdgeSchema.safeParse(
        baseEdge({ provenance: "PROPOSED", authority: "DERIVED", approvalState: "none" }),
      ).success,
    ).toBe(false);
    expect(
      businessGraphEdgeSchema.safeParse(
        baseEdge({ provenance: "PROPOSED", authority: "UNVERIFIED", approvalState: "approved" }),
      ).success,
    ).toBe(false);
    expect(
      businessGraphEdgeSchema.safeParse(
        baseEdge({ provenance: "PROPOSED", authority: "UNVERIFIED", approvalState: "pending" }),
      ).success,
    ).toBe(true);
  });

  it("a REJECTED-authority edge can never be approved (#6)", () => {
    expect(
      businessGraphEdgeSchema.safeParse(
        baseEdge({ provenance: "EXPLICIT", authority: "REJECTED", approvalState: "approved" }),
      ).success,
    ).toBe(false);
    expect(edgeIsAuthoritative({ authority: "REJECTED", provenance: "EXPLICIT", approvalState: "rejected" })).toBe(
      false,
    );
  });

  it("rejects a cross-organization edge (#7)", () => {
    expect(
      businessGraphEdgeSchema.safeParse(
        baseEdge({ target: "teragon://org-2/customer/cu-9" as BusinessGraphEdge["target"] }),
      ).success,
    ).toBe(false);
  });

  it("rejects an edge whose org disagrees with its node org", () => {
    expect(businessGraphEdgeSchema.safeParse(baseEdge({ organizationId: "org-9" })).success).toBe(
      false,
    );
  });

  it("rejects an unknown relationship type (#10)", () => {
    expect(
      businessGraphEdgeSchema.safeParse(
        baseEdge({ relationshipType: "FRIENDS_WITH" as BusinessGraphEdge["relationshipType"] }),
      ).success,
    ).toBe(false);
  });

  it("represents stale/superseded edge state (#11)", () => {
    for (const s of ["FRESH", "STALE", "BROKEN", "SUPERSEDED", "UNRESOLVED"] as const) {
      expect(businessGraphEdgeSchema.safeParse(baseEdge({ staleState: s })).success).toBe(true);
    }
  });

  it("round-trips deterministically through JSON (#12)", () => {
    const edge = baseEdge();
    expect(businessGraphEdgeSchema.parse(JSON.parse(JSON.stringify(edge)))).toEqual(edge);
  });
});
