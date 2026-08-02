import { describe, expect, it } from "vitest";
import {
  businessGraphNodeSchema,
  protectedPayloadReferenceSchema,
  type BusinessGraphNode,
  type ProtectedPayloadReference,
} from "@/graph";

const node: BusinessGraphNode = {
  id: "teragon://org-1/customer/cu-1" as BusinessGraphNode["id"],
  organizationId: "org-1",
  entityType: "customer",
  entityId: "cu-1",
  title: "לקוח לדוגמה",
  status: "פעיל",
  sensitivity: "פנימי",
  ownerRef: null,
  version: null,
  authoritative: true,
  archived: false,
  superseded: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  metadataSummary: { revenue: 1000, active: true, note: null, tier: "gold" },
};

describe("node envelope", () => {
  it("parses a valid node", () => {
    expect(businessGraphNodeSchema.safeParse(node).success).toBe(true);
  });

  it("carries no body/content/prompt/notes field (#8)", () => {
    const keys = Object.keys(businessGraphNodeSchema.shape);
    for (const forbidden of ["body", "content", "bodyMarkdown", "prompt", "notes", "plainText"]) {
      expect(keys).not.toContain(forbidden);
    }
    // unknown sensitive fields are stripped, never surfaced.
    const parsed = businessGraphNodeSchema.parse({ ...node, bodyMarkdown: "SECRET" });
    expect("bodyMarkdown" in parsed).toBe(false);
  });

  it("ProtectedPayloadReference points at a body but carries no content", () => {
    const ref: ProtectedPayloadReference = {
      entityRef: { organizationId: "org-1", entityType: "memoryRecord", entityId: "mem-1" },
      fieldName: "bodyMarkdown",
      sensitivity: "רגיש",
      requiresRevealReason: true,
    };
    expect(protectedPayloadReferenceSchema.safeParse(ref).success).toBe(true);
    expect(Object.keys(protectedPayloadReferenceSchema.shape)).not.toContain("content");
  });

  it("represents archived / superseded lifecycle state (#11)", () => {
    const archived = businessGraphNodeSchema.parse({ ...node, archived: true, superseded: true });
    expect(archived.archived).toBe(true);
    expect(archived.superseded).toBe(true);
  });

  it("round-trips deterministically through JSON (#12)", () => {
    const round = businessGraphNodeSchema.parse(JSON.parse(JSON.stringify(node)));
    expect(round).toEqual(node);
  });
});
