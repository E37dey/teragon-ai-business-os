// TERAGON Business Graph — Phase 6 deterministic-ordering unit tests.
import { describe, expect, it } from "vitest";
import { compareEdges, comparePaths } from "@/graph";
import type { GraphPath } from "@/graph";
import { synthEdge, synthNode } from "./helpers";

describe("compareEdges — relationshipType → source → target → edgeId", () => {
  const a = synthNode("customer", "a");
  const b = synthNode("customer", "b");
  const c = synthNode("customer", "c");

  it("orders by relationshipType first", () => {
    expect(compareEdges(synthEdge("OWNS", a, b), synthEdge("USES", a, b))).toBeLessThan(0);
  });

  it("breaks ties by source then target", () => {
    expect(compareEdges(synthEdge("USES", a, b), synthEdge("USES", b, c))).toBeLessThan(0);
    expect(compareEdges(synthEdge("USES", a, b), synthEdge("USES", a, c))).toBeLessThan(0);
  });

  it("is a total order (antisymmetric)", () => {
    const e1 = synthEdge("OWNS", a, b);
    const e2 = synthEdge("USES", a, c);
    expect(Math.sign(compareEdges(e1, e2))).toBe(-Math.sign(compareEdges(e2, e1)));
    expect(compareEdges(e1, e1)).toBe(0);
  });
});

describe("comparePaths — shorter first, then canonical step order", () => {
  const mk = (length: number): GraphPath => ({ nodes: [], steps: [], length });
  it("orders a shorter path first", () => {
    expect(comparePaths(mk(1), mk(3))).toBeLessThan(0);
    expect(comparePaths(mk(3), mk(1))).toBeGreaterThan(0);
  });
});
