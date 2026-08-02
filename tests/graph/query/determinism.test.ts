// TERAGON Business Graph — Phase 7 BUSINESS QUERY determinism + audit tests.
// Proves: repeated queries are deterministic except for the execution id, the
// business audit is SEPARATE from and links to the underlying traversal audits
// (no duplicate sensitive logging), and the traversal snapshot is byte-identical
// after running all 9 queries (traversal stays immutable).
import { beforeAll, describe, expect, it } from "vitest";
import {
  BusinessGraphQueryService,
  BusinessGraphTraversalService,
  type BusinessQueryRequest,
  type BusinessQueryResult,
  type GraphIndexSnapshot,
} from "@/graph";
import {
  FIXED_NOW_ISO,
  detQueryService,
  deriveValidSnapshot,
  nid,
  qctx,
} from "./helpers";
import { counterExec, healthyStore } from "../traversal/helpers";

let valid: GraphIndexSnapshot;
beforeAll(async () => {
  valid = await deriveValidSnapshot();
});

/** Blank every execution-id-bearing field so two runs can be compared for equality. */
function stripExecIds(result: BusinessQueryResult): unknown {
  return JSON.parse(
    JSON.stringify(result, (key, value) => {
      if (key === "executionId" || key === "queryExecutionId") return "X";
      if (key === "traversalExecutionIds") return [];
      return value as unknown;
    }),
  );
}

// ---------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------

describe("repeated queries are deterministic except for the execution id", () => {
  it("byte-identical with a fixed execution-id provider", async () => {
    const svc = detQueryService(valid);
    const req: BusinessQueryRequest = { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] };
    const a = await svc.findCustomersNeedingFollowUp(req, qctx());
    const b = await svc.findCustomersNeedingFollowUp(req, qctx());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("differs ONLY in execution ids with a counter provider", async () => {
    const traversal = new BusinessGraphTraversalService(healthyStore(valid), { now: () => 0, executionIdProvider: counterExec() });
    const svc = new BusinessGraphQueryService(traversal, { now: FIXED_NOW_ISO, executionIdProvider: counterExec() });
    const req: BusinessQueryRequest = { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] };
    const a = await svc.findCustomersNeedingFollowUp(req, qctx());
    const b = await svc.findCustomersNeedingFollowUp(req, qctx());
    // the raw execution ids differ …
    expect(a.audit.executionId).not.toBe(b.audit.executionId);
    // … but everything else is identical.
    expect(stripExecIds(a)).toEqual(stripExecIds(b));
  });
});

// ---------------------------------------------------------------------------
// audit: separate + linked + safe
// ---------------------------------------------------------------------------

describe("audit records are separate + safe", () => {
  it("the business audit links to (and is distinct from) every underlying traversal audit", async () => {
    // ONE shared counter ⇒ every id (traversal + business) is globally unique.
    const exec = counterExec();
    const traversal = new BusinessGraphTraversalService(healthyStore(valid), { now: () => 0, executionIdProvider: exec });
    const svc = new BusinessGraphQueryService(traversal, { now: FIXED_NOW_ISO, executionIdProvider: exec });
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx(),
    );
    // at least one underlying traversal audit was collected …
    expect(r.traversalAudits.length).toBeGreaterThan(0);
    // … the business audit references every one of them by execution id …
    expect(r.audit.traversalExecutionIds).toEqual(r.traversalAudits.map((a) => a.executionId));
    // … and the business execution id is NOT one of the traversal ids (separate identity).
    expect(r.audit.traversalExecutionIds).not.toContain(r.audit.executionId);
  });

  it("no raw search text is ever present on the business audit (safe metadata only)", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx(),
    );
    const serialized = JSON.stringify(r.audit);
    expect(serialized).not.toContain("searchText");
    // the traversal layer only ever stores a hash/class, never raw text.
    for (const a of r.traversalAudits) {
      expect(a.searchTextHash).toBeNull();
      expect(a.searchTextClass).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// traversal snapshot immutability (byte-identical after all 9 queries)
// ---------------------------------------------------------------------------

describe("traversal snapshots remain immutable", () => {
  it("the snapshot is byte-identical after running all 9 queries", async () => {
    const before = JSON.stringify(valid);
    const svc = detQueryService(valid);
    const ctx = qctx({ includeInferred: true });
    const requests: Array<[keyof BusinessGraphQueryService, BusinessQueryRequest]> = [
      ["findCustomersNeedingFollowUp", { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] }],
      ["findUnansweredQuotations", { query: "findUnansweredQuotations", subjects: [nid("quotation", "q-1")] }],
      ["findRecurringServiceIssues", { query: "findRecurringServiceIssues", subjects: [nid("printerModel", "pm-1")] }],
      ["findDelayedEnrollments", { query: "findDelayedEnrollments", subjects: [nid("enrollment", "en-1")] }],
      ["assessPrinterModelSupportImpact", { query: "assessPrinterModelSupportImpact", startNodeId: nid("printerModel", "pm-1") }],
      ["findSupersededEvidence", { query: "findSupersededEvidence", subjects: [nid("memoryRecord", "mem-0")] }],
      ["findRecommendationConflicts", { query: "findRecommendationConflicts", subjects: [nid("aiRecommendation", "rec-1")] }],
      ["findTasksFromApprovedRecommendations", { query: "findTasksFromApprovedRecommendations", subjects: [nid("aiRecommendation", "rec-1")] }],
      ["buildFullEvidencePath", { query: "buildFullEvidencePath", startNodeId: nid("aiRecommendation", "rec-1"), targetNodeId: nid("knowledgeArticle", "ka-1") }],
    ];
    for (const [method, req] of requests) {
      const fn = svc[method] as (r: BusinessQueryRequest, c: typeof ctx) => Promise<BusinessQueryResult>;
      const res = await fn.call(svc, req, ctx);
      expect(res.query).toBe(req.query);
    }
    expect(JSON.stringify(valid)).toBe(before);
  });
});
