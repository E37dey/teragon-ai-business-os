import { describe, expect, it } from "vitest";
import {
  assertEntityRegistryExhaustive,
  CORE_V1_ENTITY_SPINE,
  CORE_V1_PRIORITY_RELATIONSHIPS,
  EDGE_REGISTRY,
  ENTITY_REGISTRY,
  ENTITY_REGISTRY_ENTRIES,
  GRAPH_ENTITY_TYPES,
  GRAPH_RELATIONSHIP_TYPES,
  edgeRegistryEntrySchema,
  entityRegistryEntrySchema,
  isGraphEntityType,
  type GraphEntityType,
} from "@/graph";

describe("registries", () => {
  it("has exactly 37 entity types and 22 relationship types", () => {
    expect(GRAPH_ENTITY_TYPES).toHaveLength(37);
    expect(new Set(GRAPH_ENTITY_TYPES).size).toBe(37);
    expect(GRAPH_RELATIONSHIP_TYPES).toHaveLength(22);
    expect(new Set(GRAPH_RELATIONSHIP_TYPES).size).toBe(22);
  });

  it("keeps PrinterModel/CustomerPrinter and agentRun/agentEvent separate; excludes permission", () => {
    expect(isGraphEntityType("printerModel")).toBe(true);
    expect(isGraphEntityType("customerPrinter")).toBe(true);
    expect(isGraphEntityType("agentRun")).toBe(true);
    expect(isGraphEntityType("agentEvent")).toBe(true);
    expect(isGraphEntityType("permission")).toBe(false);
    expect(isGraphEntityType("stageProgress")).toBe(false);
  });

  it("ENTITY_REGISTRY is exhaustive over every GraphEntityType", () => {
    expect(() => assertEntityRegistryExhaustive()).not.toThrow();
    expect(ENTITY_REGISTRY_ENTRIES).toHaveLength(37);
    for (const t of GRAPH_ENTITY_TYPES) {
      const entry = ENTITY_REGISTRY[t as GraphEntityType];
      expect(entry.entityType).toBe(t);
      expect(entityRegistryEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it("records duplicate/legacy disambiguation via discriminator, never normalized away", () => {
    expect(ENTITY_REGISTRY.role.discriminator).toBeTypeOf("string");
    expect(ENTITY_REGISTRY.memoryRecord.discriminator).toBeTypeOf("string");
    expect(ENTITY_REGISTRY.governanceRisk.discriminator).toBeTypeOf("string");
    expect(ENTITY_REGISTRY.governanceIncident.discriminator).toBeTypeOf("string");
  });

  it("every EDGE_REGISTRY entry validates and references real entity types", () => {
    expect(EDGE_REGISTRY.length).toBeGreaterThan(0);
    for (const e of EDGE_REGISTRY) {
      expect(edgeRegistryEntrySchema.safeParse(e).success).toBe(true);
      expect(isGraphEntityType(e.sourceType)).toBe(true);
      expect(isGraphEntityType(e.targetType)).toBe(true);
    }
  });

  it("core-v1 spine is 15 entities, all mapped and graph-eligible", () => {
    expect(CORE_V1_ENTITY_SPINE).toHaveLength(15);
    for (const t of CORE_V1_ENTITY_SPINE) {
      expect(isGraphEntityType(t)).toBe(true);
      expect(ENTITY_REGISTRY[t].graphEligible).toBe(true);
    }
    expect(CORE_V1_PRIORITY_RELATIONSHIPS.length).toBeGreaterThan(0);
    for (const r of CORE_V1_PRIORITY_RELATIONSHIPS) {
      expect(GRAPH_RELATIONSHIP_TYPES).toContain(r);
    }
  });

  it("every core-v1 priority relationship appears in the edge registry", () => {
    const present = new Set(EDGE_REGISTRY.map((e) => e.relationshipType));
    for (const r of CORE_V1_PRIORITY_RELATIONSHIPS) {
      expect(present.has(r)).toBe(true);
    }
  });
});
