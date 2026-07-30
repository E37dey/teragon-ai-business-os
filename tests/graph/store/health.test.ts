// TERAGON Business Graph — health computation tests (Phase 4.1, pure + async SHA-256).
import { describe, expect, it } from "vitest";
import {
  buildIndexSnapshot,
  computeHealth,
  deriveOrganizationGraphSnapshot,
  recomputeChecksum,
  type GraphIndexSnapshot,
} from "@/graph";
import { VALID_CONTEXT, buildValidContext, buildValidRecords } from "../fixtures/validFixture";
import { makeClock } from "./helpers";

/** A served, VALID snapshot (checksum stays valid — build/validation state unhashed). */
async function servedSnapshot(): Promise<GraphIndexSnapshot> {
  const derivation = deriveOrganizationGraphSnapshot(buildValidRecords(), VALID_CONTEXT);
  const built = (await buildIndexSnapshot(derivation, VALID_CONTEXT, { now: makeClock() })).snapshot;
  return { ...built, buildState: "ACTIVE", validationState: "VALID", activatedAt: "2026-07-29T00:00:00.000Z" };
}

describe("computeHealth", () => {
  const org = VALID_CONTEXT.organizationId;

  it("HEALTHY requires a served+valid snapshot with a verified checksum (not just 'IDB opened')", async () => {
    const health = await computeHealth(org, await servedSnapshot(), { now: makeClock() });
    expect(health.state).toBe("HEALTHY");
    expect(health.checksumVerified).toBe(true);
  });

  it("MISSING when there is no active snapshot", async () => {
    expect((await computeHealth(org, null, { now: makeClock() })).state).toBe("MISSING");
  });

  it("CORRUPT on a read error", async () => {
    expect((await computeHealth(org, await servedSnapshot(), { now: makeClock(), readError: true })).state).toBe("CORRUPT");
  });

  it("CORRUPT on a checksum mismatch", async () => {
    const bad = { ...(await servedSnapshot()), checksum: "0000000000000000" };
    expect((await computeHealth(org, bad, { now: makeClock() })).state).toBe("CORRUPT");
  });

  it("CORRUPT on a partial write (header count disagrees with the persisted rows)", async () => {
    const partial = { ...(await servedSnapshot()), nodeCount: 999 };
    const health = await computeHealth(org, partial, { now: makeClock() });
    expect(health.state).toBe("CORRUPT");
  });

  it("REBUILD_REQUIRED on an unsupported schema version", async () => {
    const s = await servedSnapshot();
    const legacy = { ...s, schemaVersion: "graph-index-v999" };
    const bad = { ...legacy, checksum: await recomputeChecksum(legacy) };
    expect((await computeHealth(org, bad, { now: makeClock() })).state).toBe("REBUILD_REQUIRED");
  });

  it("REBUILD_REQUIRED for a legacy core-v1 registry snapshot — Phase 9 bumped to core-v2", async () => {
    // a snapshot derived under the old core-v1 registry version is NO LONGER a
    // supported registry version; the derived index rebuilds cleanly to core-v2.
    const derivation = deriveOrganizationGraphSnapshot(buildValidRecords(), buildValidContext({ registryVersion: "core-v1" }));
    const built = (await buildIndexSnapshot(derivation, buildValidContext({ registryVersion: "core-v1" }), { now: makeClock() })).snapshot;
    const legacy = { ...built, buildState: "ACTIVE" as const, validationState: "VALID" as const, activatedAt: "2026-07-29T00:00:00.000Z" };
    expect(legacy.registryVersion).toBe("core-v1");
    const health = await computeHealth(org, legacy, { now: makeClock() });
    expect(health.state).toBe("REBUILD_REQUIRED");
    expect(health.findings.some((f) => f.code === "REGISTRY_VERSION_UNSUPPORTED")).toBe(true);
    // a fresh derivation under the current context is core-v2 and HEALTHY.
    expect((await computeHealth(org, await servedSnapshot(), { now: makeClock() })).state).toBe("HEALTHY");
    expect((await servedSnapshot()).registryVersion).toBe("core-v2");
  });

  it("REBUILD_REQUIRED for a LEGACY FNV (graph-index-v1) snapshot — never silently accepted", async () => {
    const s = await servedSnapshot();
    // simulate a legacy v1 snapshot that predates the SHA-256 checksum scheme.
    const legacy = { ...s, schemaVersion: "graph-index-v1" };
    const bad = { ...legacy, checksum: await recomputeChecksum(legacy) };
    const health = await computeHealth(org, bad, { now: makeClock() });
    expect(health.state).toBe("REBUILD_REQUIRED");
    expect(health.findings.some((f) => f.code === "SCHEMA_VERSION_UNSUPPORTED")).toBe(true);
  });

  it("STALE when the source hash differs from the latest canonical derivation", async () => {
    const s = await servedSnapshot();
    expect((await computeHealth(org, s, { now: makeClock(), latestSourceHash: "deadbeefdeadbeef" })).state).toBe("STALE");
    expect((await computeHealth(org, s, { now: makeClock(), latestSourceHash: s.sourceHash })).state).toBe("HEALTHY");
  });

  it("DEGRADED when an edge endpoint no longer resolves to a node (orphan)", async () => {
    const s = await servedSnapshot();
    const endpoint = s.edges[0]!.target;
    const nodes = s.nodes.filter((n) => n.id !== endpoint);
    const degraded: GraphIndexSnapshot = { ...s, nodes, nodeCount: nodes.length };
    degraded.checksum = await recomputeChecksum(degraded);
    expect((await computeHealth(org, degraded, { now: makeClock() })).state).toBe("DEGRADED");
  });
});
