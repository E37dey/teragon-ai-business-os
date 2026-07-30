// TERAGON Business Graph — Phase 7 BUSINESS QUERY behavior tests.
// Proves each supported query returns the expected evidence, and each
// unsupported-data case returns an HONEST readiness state (never fabricated).
import { beforeAll, describe, expect, it } from "vitest";
import type { GraphIndexSnapshot } from "@/graph";
import {
  approvedTaskSnapshot,
  contradictSnapshot,
  detQueryService,
  deriveAugmentedSnapshot,
  deriveValidSnapshot,
  nid,
  printerImpactSnapshot,
  qctx,
  recurringServiceSnapshot,
} from "./helpers";

let valid: GraphIndexSnapshot;
let augmented: GraphIndexSnapshot;
beforeAll(async () => {
  valid = await deriveValidSnapshot();
  augmented = await deriveAugmentedSnapshot();
});

// ---------------------------------------------------------------------------
// Q1 — findCustomersNeedingFollowUp
// ---------------------------------------------------------------------------

describe("Q1 findCustomersNeedingFollowUp", () => {
  it("flags a customer with an open follow-up task + open opportunity (evidence path shown)", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.subject.entityType).toBe("customer");
    // the open opportunity is an AUTHORITATIVE (FK-derived) follow-up signal.
    expect(f.reasonCodes).toContain("OPEN_OPPORTUNITY");
    // every required envelope field present
    expect(f.snapshotId).toBe(r.snapshotId);
    expect(f.policyVersion).toBe("business-query-v1");
    expect(f.supportingPaths.length).toBeGreaterThan(0);
    expect(f.evidence.every((e) => e.bodyOpened === false)).toBe(true);
    expect(f.queryExecutionId).toBe(r.audit.executionId);
  });

  it("EXCLUDES a completed follow-up task (augmented fixture)", async () => {
    const svc = detQueryService(augmented);
    // opt into INFERRED edges so the (soft-referenced) task links surface, still
    // provenance-labelled — proving the COMPLETED task is excluded by status.
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx({ includeInferred: true }),
    );
    const taskEvidence = r.findings.flatMap((f) => f.evidence).filter((e) => e.entityType === "task");
    // only the OPEN task (t-1) — never the completed t-2.
    expect(taskEvidence.map((e) => e.entityRef.entityId)).toContain("t-1");
    expect(taskEvidence.map((e) => e.entityRef.entityId)).not.toContain("t-2");
  });

  it("an UNRESOLVED customer-name reference creates NO follow-up finding", async () => {
    const svc = detQueryService(augmented);
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-2")] },
      qctx(),
    );
    // cu-2's only "follow-up" is a name-based task ref that never became an edge.
    expect(r.findings).toHaveLength(0);
    expect(r.readiness).toBe("SUPPORTED");
  });
});

// ---------------------------------------------------------------------------
// Q2 — findUnansweredQuotations
// ---------------------------------------------------------------------------

describe("Q2 findUnansweredQuotations", () => {
  it("an APPROVED quotation is NOT unanswered (base fixture, deterministic cutoff)", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findUnansweredQuotations(
      { query: "findUnansweredQuotations", subjects: [nid("quotation", "q-1")], asOf: "2026-07-30T00:00:00.000Z", thresholdDays: 14 },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(0);
    expect(r.policy.cutoff).toBe("2026-07-16T00:00:00.000Z");
  });

  it("a SENT + aged quotation is flagged UNANSWERED (augmented fixture)", async () => {
    const svc = detQueryService(augmented);
    const r = await svc.findUnansweredQuotations(
      { query: "findUnansweredQuotations", subjects: [nid("quotation", "q-2")], asOf: "2026-07-30T00:00:00.000Z", thresholdDays: 14 },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.reasonCodes).toEqual(["UNANSWERED_QUOTATION_AGED"]);
    expect(r.findings[0]!.subject.entityRef.entityId).toBe("q-2");
  });
});

// ---------------------------------------------------------------------------
// Q3 — findRecurringServiceIssues
// ---------------------------------------------------------------------------

describe("Q3 findRecurringServiceIssues", () => {
  it("returns INSUFFICIENT_GRAPH_DATA on the spine (no ticket→printer edge)", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findRecurringServiceIssues(
      { query: "findRecurringServiceIssues", subjects: [nid("printerModel", "pm-1")] },
      qctx(),
    );
    expect(r.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
    expect(r.findings).toHaveLength(0);
    expect(r.missingFacts.length).toBeGreaterThan(0);
  });

  it("detects a recurring model with MULTIPLE tickets (synthetic, counts + paths)", async () => {
    const { snap, pm } = recurringServiceSnapshot();
    const svc = detQueryService(snap);
    const r = await svc.findRecurringServiceIssues(
      { query: "findRecurringServiceIssues", subjects: [pm.id] },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    const tickets = r.findings[0]!.evidence.filter((e) => e.entityType === "serviceTicket");
    expect(tickets).toHaveLength(3);
    // paths are 2-hop (model→printer→ticket) and carry NO body.
    expect(r.findings[0]!.supportingPaths.every((p) => p.length === 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Q4 — findDelayedEnrollments (delay NEVER fabricated)
// ---------------------------------------------------------------------------

describe("Q4 findDelayedEnrollments", () => {
  it("INSUFFICIENT_GRAPH_DATA when progress/due-date facts are absent (never infer from age)", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findDelayedEnrollments(
      { query: "findDelayedEnrollments", subjects: [nid("enrollment", "en-1")] },
      qctx(),
    );
    expect(r.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
    expect(r.findings).toHaveLength(0);
    expect(r.missingFacts.some((m) => m.includes("progress") || m.includes("dueDate"))).toBe(true);
  });

  it("flags a delayed enrollment ONLY when progress + due-date facts exist", async () => {
    const svc = detQueryService(augmented);
    const r = await svc.findDelayedEnrollments(
      { query: "findDelayedEnrollments", subjects: [nid("enrollment", "en-2")], asOf: "2026-07-30T00:00:00.000Z" },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.reasonCodes).toEqual(["DELAYED_ENROLLMENT"]);
  });
});

// ---------------------------------------------------------------------------
// Q5 — assessPrinterModelSupportImpact
// ---------------------------------------------------------------------------

describe("Q5 assessPrinterModelSupportImpact", () => {
  it("is bounded + deterministic + INSUFFICIENT when the model has no outbound impact", async () => {
    const svc = detQueryService(valid);
    const req = { query: "assessPrinterModelSupportImpact" as const, startNodeId: nid("printerModel", "pm-1") };
    const r1 = await svc.assessPrinterModelSupportImpact(req, qctx());
    const r2 = await svc.assessPrinterModelSupportImpact(req, qctx());
    expect(r1.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
    expect(r1.findings).toHaveLength(0);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("returns DIRECT + INDIRECT affected entities via calculateImpact (synthetic)", async () => {
    const { snap, pm } = printerImpactSnapshot();
    const svc = detQueryService(snap);
    const r = await svc.assessPrinterModelSupportImpact(
      { query: "assessPrinterModelSupportImpact", startNodeId: pm.id },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    const direct = r.findings.filter((f) => f.reasonCodes.includes("PRINTER_MODEL_IMPACT_DIRECT"));
    const indirect = r.findings.filter((f) => f.reasonCodes.includes("PRINTER_MODEL_IMPACT_INDIRECT"));
    expect(direct).toHaveLength(1);
    expect(indirect.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Q6 — findSupersededEvidence
// ---------------------------------------------------------------------------

describe("Q6 findSupersededEvidence", () => {
  it("labels the SUPERSEDES target HISTORICAL and the source CURRENT", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findSupersededEvidence(
      { query: "findSupersededEvidence", subjects: [nid("memoryRecord", "mem-0")] },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.reasonCodes).toContain("SUPERSEDED_EVIDENCE_HISTORICAL");
    expect(f.subject.entityRef.entityId).toBe("mem-0"); // historical
    expect(f.relatedEntities[0]!.entityRef.entityId).toBe("mem-1"); // current
  });
});

// ---------------------------------------------------------------------------
// Q7 — findRecommendationConflicts (registered relationships only)
// ---------------------------------------------------------------------------

describe("Q7 findRecommendationConflicts", () => {
  it("finds a REGISTERED CONTRADICTS conflict and NEVER infers one", async () => {
    const { snap, recA, recC } = contradictSnapshot();
    const svc = detQueryService(snap);
    const hit = await svc.findRecommendationConflicts(
      { query: "findRecommendationConflicts", subjects: [recA.id] },
      qctx(),
    );
    expect(hit.findings).toHaveLength(1);
    expect(hit.findings[0]!.reasonCodes).toEqual(["REGISTERED_CONTRADICTION"]);
    // recC merely RELATES to another node — no registered contradiction ⇒ nothing.
    const miss = await svc.findRecommendationConflicts(
      { query: "findRecommendationConflicts", subjects: [recC.id] },
      qctx(),
    );
    expect(miss.findings).toHaveLength(0);
    expect(miss.readiness).toBe("SUPPORTED");
  });

  it("finds no conflict on the base fixture (no CONTRADICTS edge)", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findRecommendationConflicts(
      { query: "findRecommendationConflicts", subjects: [nid("aiRecommendation", "rec-1")] },
      qctx(),
    );
    expect(r.findings).toHaveLength(0);
    expect(r.readiness).toBe("SUPPORTED");
  });
});

// ---------------------------------------------------------------------------
// Q8 — findTasksFromApprovedRecommendations
// ---------------------------------------------------------------------------

describe("Q8 findTasksFromApprovedRecommendations", () => {
  it("INSUFFICIENT on the spine (no approved APPROVED_BY edge / named human)", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findTasksFromApprovedRecommendations(
      { query: "findTasksFromApprovedRecommendations", subjects: [nid("aiRecommendation", "rec-1")] },
      qctx(),
    );
    expect(r.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
    expect(r.findings).toHaveLength(0);
  });

  it("qualifies a task from an APPROVED (named-human) recommendation; UNAPPROVED does NOT", async () => {
    const { snap, recApproved, recUnapproved, taskApproved } = approvedTaskSnapshot();
    const svc = detQueryService(snap);
    const ok = await svc.findTasksFromApprovedRecommendations(
      { query: "findTasksFromApprovedRecommendations", subjects: [recApproved.id] },
      qctx(),
    );
    expect(ok.readiness).toBe("SUPPORTED");
    expect(ok.findings).toHaveLength(1);
    expect(ok.findings[0]!.subject.nodeId).toBe(taskApproved.id);
    expect(ok.findings[0]!.reasonCodes).toEqual(["APPROVED_RECOMMENDATION_TASK"]);

    const no = await svc.findTasksFromApprovedRecommendations(
      { query: "findTasksFromApprovedRecommendations", subjects: [recUnapproved.id] },
      qctx(),
    );
    expect(no.findings).toHaveLength(0);
    expect(no.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
  });
});

// ---------------------------------------------------------------------------
// Q9 — buildFullEvidencePath
// ---------------------------------------------------------------------------

describe("Q9 buildFullEvidencePath", () => {
  it("returns a bounded, provenance-labelled path with protected bodies UNOPENED", async () => {
    const svc = detQueryService(valid);
    // SUPPORTED_BY is an INFERRED hop — opt in so the evidence path can be built,
    // with the inferred provenance kept VISIBLY LABELLED on the hop.
    const r = await svc.buildFullEvidencePath(
      { query: "buildFullEvidencePath", startNodeId: nid("aiRecommendation", "rec-1"), targetNodeId: nid("knowledgeArticle", "ka-1") },
      qctx({ includeInferred: true }),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.reasonCodes).toEqual(["EVIDENCE_PATH"]);
    expect(f.supportingPaths.length).toBeGreaterThan(0);
    expect(f.evidence.every((e) => e.bodyOpened === false)).toBe(true);
    // every hop carries a provenance + authority label
    expect(f.evidence.every((e) => e.provenance !== undefined && e.authority !== undefined)).toBe(true);
  });
});
