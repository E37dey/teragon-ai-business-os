// TERAGON Business Graph — health computation tests (Phase 4, pure).
import { describe, expect, it } from "vitest";
import {
  buildIndexSnapshot,
  computeHealth,
  deriveOrganizationGraphSnapshot,
  recomputeChecksum,
  type GraphIndexSnapshot,
} from "@/graph";
import { VALID_CONTEXT, buildValidRecords } from "../fixtures/validFixture";
import { makeClock } from "./helpers";

/** A served, VALID snapshot (checksum stays valid — build/validation state unhashed). */
function servedSnapshot(): GraphIndexSnapshot {
  const derivation = deriveOrganizationGraphSnapshot(buildValidRecords(), VALID_CONTEXT);
  const built = buildIndexSnapshot(derivation, VALID_CONTEXT, { now: makeClock() }).snapshot;
  return { ...built, buildState: "ACTIVE", validationState: "VALID", activatedAt: "2026-07-29T00:00:00.000Z" };
}

describe("computeHealth", () => {
  const org = VALID_CONTEXT.organizationId;

  it("HEALTHY requires a served+valid snapshot with a verified checksum (not just 'IDB opened')", () => {
    const health = computeHealth(org, servedSnapshot(), { now: makeClock() });
    expect(health.state).toBe("HEALTHY");
    expect(health.checksumVerified).toBe(true);
  });

  it("MISSING when there is no active snapshot", () => {
    expect(computeHealth(org, null, { now: makeClock() }).state).toBe("MISSING");
  });

  it("CORRUPT on a read error", () => {
    expect(computeHealth(org, servedSnapshot(), { now: makeClock(), readError: true }).state).toBe("CORRUPT");
  });

  it("CORRUPT on a checksum mismatch", () => {
    const bad = { ...servedSnapshot(), checksum: "0000000000000000" };
    expect(computeHealth(org, bad, { now: makeClock() }).state).toBe("CORRUPT");
  });

  it("CORRUPT on a partial write (header count disagrees with the persisted rows)", () => {
    const partial = { ...servedSnapshot(), nodeCount: 999 };
    const health = computeHealth(org, partial, { now: makeClock() });
    expect(health.state).toBe("CORRUPT");
  });

  it("REBUILD_REQUIRED on an unsupported schema version", () => {
    const s = servedSnapshot();
    const bad = { ...s, schemaVersion: "graph-index-v999", checksum: recomputeChecksum({ ...s, schemaVersion: "graph-index-v999" }) };
    expect(computeHealth(org, bad, { now: makeClock() }).state).toBe("REBUILD_REQUIRED");
  });

  it("STALE when the source hash differs from the latest canonical derivation", () => {
    const s = servedSnapshot();
    expect(computeHealth(org, s, { now: makeClock(), latestSourceHash: "deadbeefdeadbeef" }).state).toBe("STALE");
    expect(computeHealth(org, s, { now: makeClock(), latestSourceHash: s.sourceHash }).state).toBe("HEALTHY");
  });

  it("DEGRADED when an edge endpoint no longer resolves to a node (orphan)", () => {
    const s = servedSnapshot();
    const endpoint = s.edges[0]!.target;
    const nodes = s.nodes.filter((n) => n.id !== endpoint);
    const degraded: GraphIndexSnapshot = { ...s, nodes, nodeCount: nodes.length };
    degraded.checksum = recomputeChecksum(degraded);
    expect(computeHealth(org, degraded, { now: makeClock() }).state).toBe("DEGRADED");
  });
});
