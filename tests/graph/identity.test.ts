import { describe, expect, it } from "vitest";
import {
  buildNodeId,
  classifyOrganization,
  GraphIdentityError,
  graphEntityRefSchema,
  graphNodeIdSchema,
  isArrayPositionId,
  parseNodeId,
  type GraphEntityRef,
} from "@/graph";

const validRef: GraphEntityRef = {
  organizationId: "org-1",
  entityType: "customer",
  entityId: "cu-1",
};

describe("node identity", () => {
  it("round-trips buildNodeId ↔ parseNodeId", () => {
    const id = buildNodeId(validRef);
    expect(id).toBe("teragon://org-1/customer/cu-1");
    expect(parseNodeId(id)).toEqual(validRef);
  });

  it("rejects a malformed teragon:// uri (#1)", () => {
    for (const bad of ["", "http://org-1/customer/cu-1", "teragon://org-1/customer", "cu-1"]) {
      expect(() => parseNodeId(bad)).toThrow(GraphIdentityError);
      expect(graphNodeIdSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects an unknown entity type (#10)", () => {
    expect(() => parseNodeId("teragon://org-1/spaceship/x-1")).toThrow(GraphIdentityError);
    expect(graphEntityRefSchema.safeParse({ ...validRef, entityType: "spaceship" }).success).toBe(
      false,
    );
  });

  it("rejects a missing / blank organizationId (#2)", () => {
    expect(graphEntityRefSchema.safeParse({ ...validRef, organizationId: "" }).success).toBe(false);
    expect(graphEntityRefSchema.safeParse({ ...validRef, organizationId: "   " }).success).toBe(
      false,
    );
    expect(() => parseNodeId("teragon:///customer/cu-1")).toThrow(GraphIdentityError);
  });

  it("rejects array-position entity ids (#3)", () => {
    expect(isArrayPositionId("0")).toBe(true);
    expect(isArrayPositionId("12")).toBe(true);
    expect(isArrayPositionId("cu-1")).toBe(false);
    for (const idx of ["0", "1", "2"]) {
      expect(graphEntityRefSchema.safeParse({ ...validRef, entityId: idx }).success).toBe(false);
      expect(() => parseNodeId(`teragon://org-1/customer/${idx}`)).toThrow(GraphIdentityError);
    }
  });

  it("refuses a display name as an entity id", () => {
    expect(graphEntityRefSchema.safeParse({ ...validRef, entityId: "Acme Corp" }).success).toBe(
      false,
    );
    expect(() => parseNodeId("teragon://org-1/customer/Acme Corp")).toThrow(GraphIdentityError);
  });

  it("classifies a missing/blank org as unmappable, never inventing one", () => {
    expect(classifyOrganization(null)).toEqual({
      status: "unmappable",
      reasonCode: "MISSING_ORG",
      reasonHe: expect.any(String),
    });
    expect(classifyOrganization("   ").status).toBe("unmappable");
    expect(classifyOrganization("org-1")).toEqual({ status: "mapped", organizationId: "org-1" });
  });
});
