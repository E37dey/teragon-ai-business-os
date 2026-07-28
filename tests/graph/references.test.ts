import { describe, expect, it } from "vitest";
import {
  classifyReference,
  parseKindIdRef,
  referenceMayBeAuthoritative,
  type ReferenceResolution,
} from "@/graph";

describe("reference safety", () => {
  it("parses a kind:id ref and flags malformed ones", () => {
    expect(parseKindIdRef("customer:cu-3")).toEqual({ kind: "customer", id: "cu-3" });
    expect(parseKindIdRef("agent-task:at-1")).toEqual({ kind: "agent-task", id: "at-1" });
    expect(parseKindIdRef("nope")).toEqual({ malformed: true });
    expect(parseKindIdRef(":cu-3")).toEqual({ malformed: true });
    expect(parseKindIdRef("customer:")).toEqual({ malformed: true });
  });

  it("never resolves a name/ambiguous reference to authoritative (#4)", () => {
    const name = classifyReference({
      raw: "Acme Corp",
      kind: "DENORMALIZED_NAME",
      viewerOrganizationId: "org-1",
    });
    expect(name.status).toBe("AMBIGUOUS");
    expect(referenceMayBeAuthoritative(name)).toBe(false);

    const ambiguous = classifyReference({
      raw: "customer:cu-3",
      kind: "KIND_ID",
      viewerOrganizationId: "org-1",
      candidateCount: 3,
    });
    expect(ambiguous.status).toBe("AMBIGUOUS");
    expect(referenceMayBeAuthoritative(ambiguous)).toBe(false);
  });

  it("only a VALID, same-org, non-name reference may be authoritative", () => {
    const valid = classifyReference({
      raw: "customer:cu-3",
      kind: "KIND_ID",
      viewerOrganizationId: "org-1",
      candidateCount: 1,
      targetOrganizationId: "org-1",
    });
    expect(valid.status).toBe("VALID");
    expect(referenceMayBeAuthoritative(valid)).toBe(true);
  });

  it("classifies cross-org, missing, malformed and embedded targets defensively", () => {
    const crossOrg = classifyReference({
      raw: "customer:cu-3",
      kind: "KIND_ID",
      viewerOrganizationId: "org-1",
      candidateCount: 1,
      targetOrganizationId: "org-2",
    });
    expect(crossOrg.status).toBe("CROSS_ORGANIZATION");

    const missing = classifyReference({
      raw: "customer:cu-404",
      kind: "KIND_ID",
      viewerOrganizationId: "org-1",
      candidateCount: 0,
    });
    expect(missing.status).toBe("MISSING_TARGET");

    const malformed = classifyReference({
      raw: "not-a-ref",
      kind: "KIND_ID",
      viewerOrganizationId: "org-1",
    });
    expect(malformed.status).toBe("MALFORMED");

    const embedded = classifyReference({
      raw: "stage-2",
      kind: "EMBEDDED_TARGET",
      viewerOrganizationId: "org-1",
    });
    expect(embedded.status).toBe("UNSUPPORTED");

    for (const res of [crossOrg, missing, malformed, embedded]) {
      expect(referenceMayBeAuthoritative(res as ReferenceResolution)).toBe(false);
    }
  });
});
