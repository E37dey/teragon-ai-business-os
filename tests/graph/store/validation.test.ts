// TERAGON Business Graph — snapshot validation tests (Phase 4, pure).
import { describe, expect, it } from "vitest";
import {
  buildIndexSnapshot,
  deriveOrganizationGraphSnapshot,
  recomputeChecksum,
  validateSnapshot,
  type GraphIndexSnapshot,
} from "@/graph";
import { VALID_CONTEXT, buildValidRecords } from "../fixtures/validFixture";
import { cleanRecords, contextFor, makeClock } from "./helpers";

function baseValidSnapshot(): GraphIndexSnapshot {
  const derivation = deriveOrganizationGraphSnapshot(buildValidRecords(), VALID_CONTEXT);
  return buildIndexSnapshot(derivation, VALID_CONTEXT, { now: makeClock() }).snapshot;
}

/** Re-stamp counts + checksum after mutating a snapshot's content arrays. */
function reseal(snapshot: GraphIndexSnapshot): GraphIndexSnapshot {
  const resealed: GraphIndexSnapshot = {
    ...snapshot,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    checksum: "",
  };
  resealed.checksum = recomputeChecksum(resealed);
  return resealed;
}

describe("validateSnapshot — happy path", () => {
  it("the valid canonical fixture validates with zero errors + verified checksum + core-v1 covered", () => {
    const result = validateSnapshot(baseValidSnapshot(), { now: makeClock() });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checksumVerified).toBe(true);
    expect(result.coreV1Covered).toBe(true);
  });

  it("a clean-but-partial org validates (no errors) but flags incomplete core-v1 coverage as a warning", () => {
    const derivation = deriveOrganizationGraphSnapshot(cleanRecords(), contextFor("org-partial-cov"));
    const snapshot = buildIndexSnapshot(derivation, contextFor("org-partial-cov"), { now: makeClock() }).snapshot;
    const result = validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(true);
    expect(result.coreV1Covered).toBe(false);
    expect(result.warnings.some((w) => w.code === "CORE_V1_COVERAGE_INCOMPLETE")).toBe(true);
  });
});

describe("validateSnapshot — blocking errors", () => {
  it("blocks a checksum mismatch", () => {
    const snapshot = { ...baseValidSnapshot(), checksum: "deadbeefdeadbeef" };
    const result = validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.checksumVerified).toBe(false);
    expect(result.errors.some((e) => e.code === "CHECKSUM_MISMATCH")).toBe(true);
  });

  it("blocks an unsupported schema version", () => {
    const snapshot = reseal({ ...baseValidSnapshot(), schemaVersion: "graph-index-v999" });
    const result = validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SCHEMA_VERSION_UNSUPPORTED")).toBe(true);
  });

  it("blocks an unsupported registry version", () => {
    const snapshot = reseal({ ...baseValidSnapshot(), registryVersion: "core-v999" });
    const result = validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "REGISTRY_VERSION_UNSUPPORTED")).toBe(true);
  });

  it("blocks a duplicate node id", () => {
    const base = baseValidSnapshot();
    const dup = reseal({ ...base, nodes: [...base.nodes, base.nodes[0]!] });
    const result = validateSnapshot(dup, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_NODE_ID")).toBe(true);
  });

  it("blocks an orphan edge endpoint (a node an edge points at is absent)", () => {
    const base = baseValidSnapshot();
    const endpoint = base.edges[0]!.target;
    const orphaned = reseal({ ...base, nodes: base.nodes.filter((n) => n.id !== endpoint) });
    const result = validateSnapshot(orphaned, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EDGE_SOURCE_ABSENT" || e.code === "EDGE_TARGET_ABSENT")).toBe(true);
  });

  it("blocks a sensitive body payload on a node envelope", () => {
    const base = baseValidSnapshot();
    const leaked = reseal({
      ...base,
      nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, metadataSummary: { ...n.metadataSummary, body: "סוד" } } : n)),
    });
    const result = validateSnapshot(leaked, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SENSITIVE_PAYLOAD_ON_NODE")).toBe(true);
  });

  it("blocks a proposed-and-approved edge (trust invariant)", () => {
    const base = baseValidSnapshot();
    const badEdge = { ...base.edges[0]!, provenance: "PROPOSED" as const, authority: "UNVERIFIED" as const, approvalState: "approved" as const };
    const tampered = reseal({ ...base, edges: [badEdge, ...base.edges.slice(1)] });
    const result = validateSnapshot(tampered, { now: makeClock() });
    expect(result.valid).toBe(false);
  });

  it("blocks when derivation error-severity issues are present (no silent suppression)", () => {
    const base = baseValidSnapshot();
    const withErr = reseal({
      ...base,
      issues: [
        {
          code: "CROSS_ORGANIZATION" as const,
          sourceEntityType: "customer" as const,
          sourceEntityId: "cu-1",
          severity: "error" as const,
          reasonHe: "בדיקה",
          safeRemediationHe: "בדיקה",
          indexingMayContinue: true,
        },
      ],
    });
    const result = validateSnapshot(withErr, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DERIVATION_ERRORS_PRESENT")).toBe(true);
  });

  it("permits a derivation error explicitly classified safe-non-indexable (opt-in only)", () => {
    const base = baseValidSnapshot();
    const withErr = reseal({
      ...base,
      issues: [
        {
          code: "EXCLUDED_ENTITY" as const,
          sourceEntityType: "auditEvent" as const,
          sourceEntityId: "ae-1",
          severity: "error" as const,
          reasonHe: "בדיקה",
          safeRemediationHe: "בדיקה",
          indexingMayContinue: true,
        },
      ],
    });
    const result = validateSnapshot(withErr, { now: makeClock(), allowedErrorCodes: ["EXCLUDED_ENTITY"] });
    expect(result.valid).toBe(true);
  });
});
