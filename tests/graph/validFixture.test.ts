// TERAGON Business Graph — VALID canonical fixture tests (Phase 3.1).
// Proves the hand-built single-org fixture derives a CLEAN graph: 0 error issues,
// 0 unmappable, 0 orphanReferences, 0 duplicateEdges; all 15 Core-V1 entities
// present as nodes; the expected authoritative relationships present; and
// byte-equivalent (deterministic) output on repeated derivation.
import { describe, expect, it } from "vitest";
import {
  businessGraphEdgeSchema,
  businessGraphNodeSchema,
  deriveOrganizationGraphSnapshot,
  parseNodeId,
  type GraphEntityType,
} from "@/graph";
import {
  VALID_CONTEXT,
  VALID_CORE_V1_TYPES,
  VALID_EXPECTED_RELATIONSHIPS,
  buildValidRecords,
} from "./fixtures/validFixture";

const derive = () => deriveOrganizationGraphSnapshot(buildValidRecords(), VALID_CONTEXT);

const nodeType = (nodeId: string): GraphEntityType => parseNodeId(nodeId).entityType;

describe("valid canonical fixture — clean derivation", () => {
  const result = derive();

  it("produces exactly 0 error-severity issues", () => {
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(result.stats.issuesBySeverity.error).toBe(0);
  });

  it("produces 0 unmappableRecords, 0 orphanReferences, 0 duplicateEdges", () => {
    expect(result.unmappableRecords).toEqual([]);
    expect(result.orphanReferences).toEqual([]);
    expect(result.duplicateEdges).toEqual([]);
    expect(result.stats.unmappable).toBe(0);
    expect(result.stats.orphanReferences).toBe(0);
    expect(result.stats.duplicateEdges).toBe(0);
  });

  it("emits ZERO warnings as well (a fully pristine fixture)", () => {
    // Not a hard requirement (only errors must be zero), but the canonical
    // fixture is built so nothing dangles or misses — no MISSING_TARGET,
    // AMBIGUOUS_REFERENCE, or DUPLICATE_EDGE warnings arise.
    expect(result.stats.issuesBySeverity.warning).toBe(0);
  });

  it("represents ALL 15 Core-V1 entities as nodes", () => {
    const present = new Set(result.nodes.map((n) => n.entityType));
    for (const t of VALID_CORE_V1_TYPES) {
      expect(present.has(t), `missing Core-V1 node type ${t}`).toBe(true);
    }
    expect(VALID_CORE_V1_TYPES.length).toBe(15);
  });

  it("every node and edge is schema-valid", () => {
    for (const n of result.nodes) {
      expect(businessGraphNodeSchema.safeParse(n).success, `bad node ${n.id}`).toBe(true);
    }
    for (const e of result.edges) {
      expect(businessGraphEdgeSchema.safeParse(e).success, `bad edge ${e.id}`).toBe(true);
    }
  });

  it("has the exact expected node + edge counts", () => {
    expect(result.nodes.length).toBe(22);
    expect(result.edges.length).toBe(22);
  });

  it("emits the SOURCE-pointing OWNS(organization→customer) + RESOLVED_BY(serviceTicket→repairAction)", () => {
    const keys = new Set(
      result.edges.map((e) => `${e.relationshipType}|${nodeType(e.source)}|${nodeType(e.target)}`),
    );
    expect(keys.has("OWNS|organization|customer")).toBe(true);
    expect(keys.has("RESOLVED_BY|serviceTicket|repairAction")).toBe(true);
  });

  it("carries every expected authoritative relationship (by real ids, not names)", () => {
    const present = new Set(
      result.edges.map((e) => `${e.relationshipType}|${nodeType(e.source)}|${nodeType(e.target)}`),
    );
    for (const rel of VALID_EXPECTED_RELATIONSHIPS) {
      const key = `${rel.relationshipType}|${rel.sourceType}|${rel.targetType}`;
      expect(present.has(key), `missing relationship ${key}`).toBe(true);
    }
    expect(result.edges.length).toBe(VALID_EXPECTED_RELATIONSHIPS.length);
  });

  it("emits only authoritative edges (CANONICAL / DERIVED, never UNVERIFIED/REJECTED)", () => {
    for (const e of result.edges) {
      expect(["CANONICAL", "DERIVED"]).toContain(e.authority);
    }
    // and at least the EXPLICIT join relationships reach CANONICAL.
    const canonical = result.edges.filter((e) => e.authority === "CANONICAL");
    expect(canonical.some((e) => e.relationshipType === "ENROLLED_IN")).toBe(true);
    expect(canonical.some((e) => e.relationshipType === "APPROVED_BY")).toBe(true);
  });

  it("never emits a cross-organization edge (all endpoints share the org)", () => {
    for (const e of result.edges) {
      expect(parseNodeId(e.source).organizationId).toBe(e.organizationId);
      expect(parseNodeId(e.target).organizationId).toBe(e.organizationId);
    }
  });

  it("carries NO sensitive body on any node envelope", () => {
    for (const n of result.nodes) {
      for (const forbidden of ["markdown", "bodyMarkdown", "content", "body", "notes", "prompt", "plainText"]) {
        expect(forbidden in n.metadataSummary).toBe(false);
      }
    }
  });

  it("is deterministic: deriving twice yields byte-equivalent JSON", () => {
    const a = derive();
    const b = derive();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
