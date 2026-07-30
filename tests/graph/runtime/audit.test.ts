// TERAGON Business Graph — Phase 10 RUNTIME audit-adapter tests.
// Proves: safe-only whitelist; bounded buffer; OK/DEGRADED/FAILED write states;
// fail-CLOSED for sensitive queries (data suppressed on a failed durable write);
// fail-SAFE degraded for low-risk status calls; audit never leaks or grants.
import { describe, expect, it } from "vitest";
import {
  RuntimeBusinessGraphAuditAdapter,
  resolveQueryOutcome,
  resolveStatusOutcome,
  SENSITIVE_GRAPH_QUERIES,
  type BusinessGraphFacadeAuditRecord,
  type BusinessGraphFacadeResult,
} from "@/graph";
import { recordingAuditWriter, throwingAuditWriter, VALID_ORG } from "./helpers";

function record(over: Partial<BusinessGraphFacadeAuditRecord> = {}): BusinessGraphFacadeAuditRecord {
  return {
    facadeExecutionId: "fx-1",
    correlationId: "c-1",
    operation: "findCustomersNeedingFollowUp",
    actorRef: { kind: "HUMAN", userId: "u-tzachi" },
    organizationId: VALID_ORG,
    readiness: "SUPPORTED",
    health: "HEALTHY",
    resultCount: 3,
    truncated: false,
    resultCode: "OK",
    queryExecutionId: "qx-1",
    traversalExecutionIds: ["tx-1"],
    ...over,
  };
}

function okResult(over: Partial<BusinessGraphFacadeResult> = {}): BusinessGraphFacadeResult {
  return {
    code: "OK",
    ok: true,
    correlationId: "c-1",
    facadeExecutionId: "fx-1",
    query: "findCustomersNeedingFollowUp",
    view: {
      query: "findCustomersNeedingFollowUp",
      organizationId: VALID_ORG,
      snapshotId: "snap-1",
      health: "HEALTHY",
      stale: false,
      readiness: "SUPPORTED",
      capability: {
        query: "findCustomersNeedingFollowUp",
        baselineReadiness: "SUPPORTED",
        requiredEntities: [],
        requiredRelationships: [],
        requiredNodeFacts: [],
        missingFacts: [],
        traversalOps: [],
        descriptionHe: "",
      },
      policyVersion: "business-query-v1",
      findings: [],
      counts: { findings: 0, entities: 0 },
      truncated: false,
      missingFacts: [],
    },
    audit: record(),
    error: null,
    ...over,
  };
}

describe("runtime audit adapter", () => {
  it("treats all 9 business queries as sensitive (fail-closed set)", () => {
    expect(SENSITIVE_GRAPH_QUERIES).toHaveLength(9);
  });

  it("records only safe whitelisted metadata (no bodies/tokens/raw text fields)", () => {
    const adapter = new RuntimeBusinessGraphAuditAdapter();
    adapter.record(record());
    const entry = adapter.lastEntry();
    expect(entry).not.toBeNull();
    expect(Object.keys(entry!).sort()).toEqual(
      [
        "actorRef",
        "correlationId",
        "facadeExecutionId",
        "health",
        "operation",
        "organizationId",
        "queryExecutionId",
        "readiness",
        "resultCode",
        "resultCount",
        "traversalExecutionIds",
      ].sort(),
    );
  });

  it("is DEGRADED with no writer, OK with a working writer", () => {
    const degraded = new RuntimeBusinessGraphAuditAdapter();
    degraded.record(record({ facadeExecutionId: "fx-a" }));
    expect(degraded.writeState("fx-a")).toBe("DEGRADED");

    const rec = recordingAuditWriter();
    const ok = new RuntimeBusinessGraphAuditAdapter({ writer: rec.writer });
    ok.record(record({ facadeExecutionId: "fx-b" }));
    expect(ok.writeState("fx-b")).toBe("OK");
    expect(rec.count()).toBe(1);
  });

  it("is FAILED (and never throws) when the durable writer throws", () => {
    const adapter = new RuntimeBusinessGraphAuditAdapter({ writer: throwingAuditWriter() });
    expect(() => adapter.record(record({ facadeExecutionId: "fx-c" }))).not.toThrow();
    expect(adapter.writeState("fx-c")).toBe("FAILED");
  });

  it("bounds the internal buffer (oldest dropped past capacity)", () => {
    const adapter = new RuntimeBusinessGraphAuditAdapter({ capacity: 2 });
    adapter.record(record({ facadeExecutionId: "fx-1" }));
    adapter.record(record({ facadeExecutionId: "fx-2" }));
    adapter.record(record({ facadeExecutionId: "fx-3" }));
    expect(adapter.entries()).toHaveLength(2);
    expect(adapter.entries().map((e) => e.facadeExecutionId)).toEqual(["fx-2", "fx-3"]);
  });

  it("fail-CLOSED: a FAILED audit write suppresses data for a sensitive query", () => {
    const outcome = resolveQueryOutcome(okResult(), "FAILED");
    expect(outcome.released).toBe(false);
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.view).toBeNull();
    expect(outcome.result.code).toBe("INTERNAL_FAILURE");
  });

  it("fail-CLOSED does not fire when the write is OK or merely DEGRADED", () => {
    expect(resolveQueryOutcome(okResult(), "OK").released).toBe(true);
    expect(resolveQueryOutcome(okResult(), "OK").result.view).not.toBeNull();
    expect(resolveQueryOutcome(okResult(), "DEGRADED").released).toBe(true);
    expect(resolveQueryOutcome(okResult(), "DEGRADED").result.view).not.toBeNull();
  });

  it("fail-SAFE: a low-risk status call is always released, marked degraded", () => {
    expect(resolveStatusOutcome({ any: 1 }, "OK")).toEqual({ result: { any: 1 }, auditState: "OK", degraded: false });
    expect(resolveStatusOutcome({ any: 1 }, "DEGRADED").degraded).toBe(true);
    expect(resolveStatusOutcome({ any: 1 }, "FAILED").degraded).toBe(true);
  });
});
