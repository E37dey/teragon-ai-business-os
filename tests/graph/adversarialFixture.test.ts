// TERAGON Business Graph — ADVERSARIAL security fixture tests (Phase 3.1).
// Proves the derivation upholds the cross-organization security contract on the
// hostile, org-mixed seed input:
//   • every cross-organization relation is REJECTED (CROSS_ORGANIZATION issue)
//     and NO forbidden cross-org edge is ever emitted;
//   • a rejected edge never aborts its node or the snapshot (safe continuation);
//   • the exact issue counts are DETERMINISTIC across runs.
import { describe, expect, it } from "vitest";
import {
  businessGraphEdgeSchema,
  deriveOrganizationGraphSnapshot,
  parseNodeId,
} from "@/graph";
import {
  ADVERSARIAL_CONTEXT,
  ADVERSARIAL_EXPECTED,
  buildAdversarialRecords,
} from "./fixtures/adversarialFixture";

const derive = () => deriveOrganizationGraphSnapshot(buildAdversarialRecords(), ADVERSARIAL_CONTEXT);

describe("adversarial fixture — cross-organization refusal", () => {
  const result = derive();

  it("has the exact, documented, DETERMINISTIC issue-severity counts", () => {
    expect(result.stats.issuesBySeverity.error).toBe(ADVERSARIAL_EXPECTED.errorIssues);
    expect(result.stats.issuesBySeverity.warning).toBe(ADVERSARIAL_EXPECTED.warningIssues);
    expect(result.stats.issuesBySeverity.info).toBe(ADVERSARIAL_EXPECTED.infoIssues);
  });

  it("every error-severity issue is a CROSS_ORGANIZATION rejection", () => {
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors.length).toBe(ADVERSARIAL_EXPECTED.crossOrgErrors);
    for (const e of errors) expect(e.code).toBe("CROSS_ORGANIZATION");
  });

  it("EVERY cross-organization relation is rejected: NO forbidden cross-org edge is emitted", () => {
    for (const e of result.edges) {
      const sourceOrg = parseNodeId(e.source).organizationId;
      const targetOrg = parseNodeId(e.target).organizationId;
      expect(sourceOrg).toBe(targetOrg);
      expect(sourceOrg).toBe(e.organizationId);
      // the edge schema itself forbids a cross-org edge — must still hold.
      expect(businessGraphEdgeSchema.safeParse(e).success).toBe(true);
    }
  });

  it("SAFE CONTINUATION: a rejected cross-org edge never aborts its source node", () => {
    // for every cross-org rejection, the offending source record still derived a
    // node — the rejected edge did not abort the node or the snapshot.
    const nodeKeys = new Set(result.nodes.map((n) => `${n.entityType}|${n.entityId}`));
    const crossOrg = result.issues.filter((i) => i.code === "CROSS_ORGANIZATION");
    expect(crossOrg.length).toBeGreaterThan(0);
    for (const issue of crossOrg) {
      expect(
        nodeKeys.has(`${issue.sourceEntityType}|${issue.sourceEntityId}`),
        `source node absent for rejected edge on ${issue.sourceEntityType}:${issue.sourceEntityId}`,
      ).toBe(true);
    }
    // the snapshot as a whole still produced nodes + edges.
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it("keeps unmappable / orphanReferences / duplicateEdges at the documented values", () => {
    expect(result.stats.unmappable).toBe(ADVERSARIAL_EXPECTED.unmappableRecords);
    expect(result.stats.orphanReferences).toBe(ADVERSARIAL_EXPECTED.orphanReferences);
    expect(result.stats.duplicateEdges).toBe(ADVERSARIAL_EXPECTED.duplicateEdges);
  });

  it("is DETERMINISTIC: two runs yield identical issue counts AND byte-equivalent JSON", () => {
    const a = derive();
    const b = derive();
    expect(a.stats.issuesBySeverity).toEqual(b.stats.issuesBySeverity);
    expect(a.stats.issuesBySeverity.error).toBe(ADVERSARIAL_EXPECTED.errorIssues);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
