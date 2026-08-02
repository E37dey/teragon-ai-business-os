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

async function baseValidSnapshot(): Promise<GraphIndexSnapshot> {
  const derivation = deriveOrganizationGraphSnapshot(buildValidRecords(), VALID_CONTEXT);
  return (await buildIndexSnapshot(derivation, VALID_CONTEXT, { now: makeClock() })).snapshot;
}

/** Re-stamp counts + checksum after mutating a snapshot's content arrays. */
async function reseal(snapshot: GraphIndexSnapshot): Promise<GraphIndexSnapshot> {
  const resealed: GraphIndexSnapshot = {
    ...snapshot,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    checksum: "",
  };
  resealed.checksum = await recomputeChecksum(resealed);
  return resealed;
}

describe("validateSnapshot — happy path", () => {
  it("the valid canonical fixture validates with zero errors + verified checksum + core-v1 covered", async () => {
    const result = await validateSnapshot(await baseValidSnapshot(), { now: makeClock() });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checksumVerified).toBe(true);
    expect(result.coreV1Covered).toBe(true);
  });

  it("a clean-but-partial org validates (no errors) but flags incomplete core-v1 coverage as a warning", async () => {
    const derivation = deriveOrganizationGraphSnapshot(cleanRecords(), contextFor("org-partial-cov"));
    const snapshot = (await buildIndexSnapshot(derivation, contextFor("org-partial-cov"), { now: makeClock() })).snapshot;
    const result = await validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(true);
    expect(result.coreV1Covered).toBe(false);
    expect(result.warnings.some((w) => w.code === "CORE_V1_COVERAGE_INCOMPLETE")).toBe(true);
  });
});

describe("validateSnapshot — blocking errors", () => {
  it("blocks a checksum mismatch", async () => {
    const snapshot = { ...(await baseValidSnapshot()), checksum: "deadbeefdeadbeef" };
    const result = await validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.checksumVerified).toBe(false);
    expect(result.errors.some((e) => e.code === "CHECKSUM_MISMATCH")).toBe(true);
  });

  it("blocks an unsupported schema version", async () => {
    const snapshot = await reseal({ ...(await baseValidSnapshot()), schemaVersion: "graph-index-v999" });
    const result = await validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SCHEMA_VERSION_UNSUPPORTED")).toBe(true);
  });

  it("blocks an unsupported registry version", async () => {
    const snapshot = await reseal({ ...(await baseValidSnapshot()), registryVersion: "core-v999" });
    const result = await validateSnapshot(snapshot, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "REGISTRY_VERSION_UNSUPPORTED")).toBe(true);
  });

  it("blocks a duplicate node id", async () => {
    const base = await baseValidSnapshot();
    const dup = await reseal({ ...base, nodes: [...base.nodes, base.nodes[0]!] });
    const result = await validateSnapshot(dup, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_NODE_ID")).toBe(true);
  });

  it("blocks an orphan edge endpoint (a node an edge points at is absent)", async () => {
    const base = await baseValidSnapshot();
    const endpoint = base.edges[0]!.target;
    const orphaned = await reseal({ ...base, nodes: base.nodes.filter((n) => n.id !== endpoint) });
    const result = await validateSnapshot(orphaned, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EDGE_SOURCE_ABSENT" || e.code === "EDGE_TARGET_ABSENT")).toBe(true);
  });

  it("blocks a sensitive body payload on a node envelope", async () => {
    const base = await baseValidSnapshot();
    const leaked = await reseal({
      ...base,
      nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, metadataSummary: { ...n.metadataSummary, body: "סוד" } } : n)),
    });
    const result = await validateSnapshot(leaked, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SENSITIVE_PAYLOAD_ON_NODE")).toBe(true);
  });

  it("blocks a proposed-and-approved edge (trust invariant)", async () => {
    const base = await baseValidSnapshot();
    const badEdge = { ...base.edges[0]!, provenance: "PROPOSED" as const, authority: "UNVERIFIED" as const, approvalState: "approved" as const };
    const tampered = await reseal({ ...base, edges: [badEdge, ...base.edges.slice(1)] });
    const result = await validateSnapshot(tampered, { now: makeClock() });
    expect(result.valid).toBe(false);
  });

  it("blocks when derivation error-severity issues are present (no silent suppression)", async () => {
    const base = await baseValidSnapshot();
    const withErr = await reseal({
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
    const result = await validateSnapshot(withErr, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DERIVATION_ERRORS_PRESENT")).toBe(true);
  });

  it("permits a derivation error whose code is in the closed SAFE_NON_INDEXABLE policy", async () => {
    const base = await baseValidSnapshot();
    const withErr = await reseal({
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
    // EXCLUDED_ENTITY is inside the closed policy ⇒ tolerated (even by default).
    const result = await validateSnapshot(withErr, { now: makeClock(), allowedErrorCodes: ["EXCLUDED_ENTITY"] });
    expect(result.valid).toBe(true);
    const byDefault = await validateSnapshot(withErr, { now: makeClock() });
    expect(byDefault.valid).toBe(true);
  });
});

describe("validateSnapshot — legacy FNV (graph-index-v1) snapshot is rejected", () => {
  it("a legacy-versioned snapshot fails validation as SCHEMA_VERSION_UNSUPPORTED (never silently accepted)", async () => {
    // a snapshot that predates the SHA-256 checksum scheme carries the legacy
    // schemaVersion. It must NOT validate — a rebuild is required.
    const legacy = await reseal({ ...(await baseValidSnapshot()), schemaVersion: "graph-index-v1" });
    const result = await validateSnapshot(legacy, { now: makeClock() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SCHEMA_VERSION_UNSUPPORTED")).toBe(true);
  });
});

describe("validateSnapshot — closed activation policy (forbidden codes never allow-listed)", () => {
  const FORBIDDEN = [
    "CROSS_ORGANIZATION",
    "SENSITIVITY_BLOCKED",
    "DANGLING_ENDPOINT",
    "MISSING_ORGANIZATION",
    "DUPLICATE_EDGE",
    "MALFORMED_REFERENCE",
  ] as const;

  for (const code of FORBIDDEN) {
    it(`refuses to allow-list the forbidden code ${code} even when explicitly passed`, async () => {
      const base = await baseValidSnapshot();
      const withErr = await reseal({
        ...base,
        issues: [
          {
            code,
            sourceEntityType: "customer" as const,
            sourceEntityId: "cu-1",
            severity: "error" as const,
            reasonHe: "בדיקה",
            safeRemediationHe: "בדיקה",
            indexingMayContinue: true,
          },
        ],
      });
      // passing the forbidden code as allowedErrorCodes MUST NOT enable activation.
      const result = await validateSnapshot(withErr, { now: makeClock(), allowedErrorCodes: [code] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DERIVATION_ERRORS_PRESENT")).toBe(true);
    });
  }
});
