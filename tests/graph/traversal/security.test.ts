// TERAGON Business Graph — Phase 6 per-hop security unit tests.
import { describe, expect, it } from "vitest";
import {
  classifyEdge,
  clearanceMeets,
  isEdgePermitted,
  isNodeAccessible,
  resolveLimits,
} from "@/graph";
import { ALLOW_ALL, ctxFor, denyEntityTypes, synthEdge, synthNode } from "./helpers";

describe("clearanceMeets — ordered sensitivity scale", () => {
  it("meets equal/lower, refuses higher", () => {
    expect(clearanceMeets("רגיש", "פנימי")).toBe(true);
    expect(clearanceMeets("פנימי", "פנימי")).toBe(true);
    expect(clearanceMeets("פנימי", "רגיש")).toBe(false);
    expect(clearanceMeets("ציבורי", "מוגבל")).toBe(false);
  });
});

describe("isNodeAccessible — deny-by-default per node", () => {
  const a = synthNode("customer", "cu-1");

  it("allows a same-org, cleared, permitted, live node", () => {
    expect(isNodeAccessible(a, ctxFor())).toBe(true);
  });

  it("refuses a cross-organization node", () => {
    const foreign = synthNode("customer", "cu-9", { organizationId: "org-other" });
    expect(isNodeAccessible(foreign, ctxFor())).toBe(false);
  });

  it("refuses when the viewer org disagrees with the query org", () => {
    const ctx = ctxFor({ viewer: { organizationId: "org-other", actor: { kind: "SYSTEM" } } });
    expect(isNodeAccessible(a, ctx)).toBe(false);
  });

  it("refuses when clearance is below node sensitivity", () => {
    const secret = synthNode("memoryRecord", "m-1", { sensitivity: "מוגבל" });
    expect(isNodeAccessible(secret, ctxFor({ viewerClearance: "פנימי" }))).toBe(false);
    expect(isNodeAccessible(secret, ctxFor({ viewerClearance: "מוגבל" }))).toBe(true);
  });

  it("refuses when the entity permission oracle denies", () => {
    const ctx = ctxFor({ permissions: denyEntityTypes(new Set(["customer"])) });
    expect(isNodeAccessible(a, ctx)).toBe(false);
  });

  it("refuses archived; refuses superseded unless historical is allowed", () => {
    expect(isNodeAccessible(synthNode("customer", "c", { archived: true }), ctxFor())).toBe(false);
    const sup = synthNode("memoryRecord", "old", { superseded: true });
    expect(isNodeAccessible(sup, ctxFor())).toBe(false);
    expect(isNodeAccessible(sup, ctxFor(), { allowHistorical: true })).toBe(true);
  });
});

describe("classifyEdge / isEdgePermitted — authoritative-only default", () => {
  const a = synthNode("customer", "a");
  const b = synthNode("customer", "b");
  const limits = resolveLimits();
  const base = ctxFor({ permissions: ALLOW_ALL });

  it("classifies by authority + provenance", () => {
    expect(classifyEdge(synthEdge("OWNS", a, b))).toBe("AUTHORITATIVE");
    expect(
      classifyEdge(synthEdge("SUPPORTED_BY", a, b, { provenance: "INFERRED", authority: "DERIVED" })),
    ).toBe("INFERRED");
    expect(
      classifyEdge(synthEdge("PURCHASED", a, b, { provenance: "PROPOSED", authority: "UNVERIFIED" })),
    ).toBe("NON_AUTHORITATIVE");
    expect(classifyEdge(synthEdge("REJECTED_BY", a, b, { authority: "REJECTED" }))).toBe(
      "NON_AUTHORITATIVE",
    );
  });

  it("permits authoritative by default; gates inferred/unverified behind flags; never rejected", () => {
    const authoritative = synthEdge("OWNS", a, b);
    const inferred = synthEdge("SUPPORTED_BY", a, b, { provenance: "INFERRED", authority: "DERIVED" });
    const proposed = synthEdge("PURCHASED", a, b, { provenance: "PROPOSED", authority: "UNVERIFIED" });
    const rejected = synthEdge("REJECTED_BY", a, b, { authority: "REJECTED" });

    expect(isEdgePermitted(authoritative, base, limits)).toBe(true);
    expect(isEdgePermitted(inferred, base, limits)).toBe(false);
    expect(isEdgePermitted(inferred, ctxFor({ includeInferred: true }), limits)).toBe(true);
    expect(isEdgePermitted(proposed, base, limits)).toBe(false);
    expect(isEdgePermitted(proposed, ctxFor({ includeUnverified: true }), limits)).toBe(true);
    // rejected is NEVER traversable, even with every flag on.
    expect(
      isEdgePermitted(rejected, ctxFor({ includeInferred: true, includeUnverified: true }), limits),
    ).toBe(false);
  });

  it("excludes an edge outside the relationship allow-list", () => {
    const narrowed = resolveLimits({ allowedRelationshipTypes: ["USES"] });
    expect(isEdgePermitted(synthEdge("OWNS", a, b), base, narrowed)).toBe(false);
    expect(isEdgePermitted(synthEdge("USES", a, b), base, narrowed)).toBe(true);
  });
});
