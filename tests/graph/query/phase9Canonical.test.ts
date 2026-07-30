// TERAGON Business Graph — Phase 9 CANONICAL derivation → query tests.
// ---------------------------------------------------------------------------
// Proves the FULL canonical → derivation → query path for the four lifted
// queries using REAL canonical records that carry the new additive fields
// (ServiceTicket.customerPrinterId / faultCategory, Task.sourceRecommendationId)
// and embedded StageProgress. Nothing is asserted on a hand-built synthetic edge:
// every graph under test is produced by running the real derivation over domain
// records. Also proves: free-text references create NO findings, incomplete
// records stay INSUFFICIENT, and evidence retains provenance/authority/approval.
import { describe, expect, it } from "vitest";
import type { CanonicalRecord, GraphIndexSnapshot } from "@/graph";
import { deriveSnapshot, detQueryService, nid, qctx } from "./helpers";

const C = "2026-07-01T09:00:00.000Z";
const U = "2026-07-02T09:00:00.000Z";
const ORG = "org-canonical";
const PAST_DUE = "2026-06-01T00:00:00.000Z";
const ASOF = "2026-07-30T00:00:00.000Z";

/**
 * A single-org canonical record set carrying every Phase-9 fact. Derived through
 * the REAL store; the returned snapshot is the DERIVED graph the queries read.
 */
function phase9Records(): Partial<Record<string, CanonicalRecord[]>> {
  return {
    users: [{ id: "u-1", name: "מהנדס שירות", status: "פעיל", createdAt: C, updatedAt: U }],
    organizations: [{ id: ORG, name: "ארגון קנוני", status: "פעיל", createdAt: C, updatedAt: U }],
    customers: [{ id: "cu-1", name: "לקוח קנוני", organizationId: ORG, status: "פעיל", createdAt: C, updatedAt: U }],
    printerModels: [{ id: "pm-1", name: "Teragon X1", createdAt: C, updatedAt: U }],
    customerPrinters: [
      { id: "cp-1", customerId: "cu-1", printerModelId: "pm-1", createdAt: C, updatedAt: U },
      { id: "cp-2", customerId: "cu-1", printerModelId: "pm-1", createdAt: C, updatedAt: U },
    ],
    serviceTickets: [
      // TWO tickets, SAME faultCategory, on printers of pm-1 → recurring.
      { id: "st-1", customerId: "cu-1", customerPrinterId: "cp-1", faultCategory: "סתימת אקסטרודר", printer: "Teragon X1", issue: "סתימה", status: "בבדיקה", createdAt: C, updatedAt: U },
      { id: "st-2", customerId: "cu-1", customerPrinterId: "cp-2", faultCategory: "סתימת אקסטרודר", printer: "Teragon X1", issue: "סתימה", status: "בבדיקה", createdAt: C, updatedAt: U },
      // a different category — single ticket → NOT recurring.
      { id: "st-3", customerId: "cu-1", customerPrinterId: "cp-1", faultCategory: "כיול", printer: "Teragon X1", issue: "כיול", status: "בבדיקה", createdAt: C, updatedAt: U },
      // FREE-TEXT ONLY — no customerPrinterId / faultCategory. Must NEVER be grouped.
      { id: "st-free", customerId: "cu-1", printer: "Teragon X1", issue: "סתימת אקסטרודר", status: "בבדיקה", createdAt: C, updatedAt: U },
    ],
    courses: [{ id: "co-1", instructorId: "u-1", title: "קורס", status: "פעיל", createdAt: C, updatedAt: U }],
    students: [{ id: "s-1", name: "תלמיד", status: "פעיל", createdAt: C, updatedAt: U }],
    enrollments: [
      { id: "en-delayed", courseId: "co-1", studentId: "s-1", paymentStatus: "שולם", stages: [{ stageId: "lp-1", status: "בעבודה", due: PAST_DUE, updated: C }], createdAt: C, updatedAt: U },
      { id: "en-ontime", courseId: "co-1", studentId: "s-1", paymentStatus: "שולם", stages: [{ stageId: "lp-1", status: "אושר", due: PAST_DUE, updated: C }], createdAt: C, updatedAt: U },
      { id: "en-nofacts", courseId: "co-1", studentId: "s-1", paymentStatus: "שולם", createdAt: C, updatedAt: U },
    ],
    agents: [{ id: "ag-1", name: "סוכן", status: "פעיל", promptVersion: 1, createdAt: C, updatedAt: U }],
    // approved by a canonical HUMAN (decidedById → user u-1).
    approvals: [{ id: "ap-1", status: "אושר", decidedById: "u-1", createdAt: C, updatedAt: U }],
    aiRecommendations: [
      { id: "rec-1", agentId: "ag-1", approvalId: "ap-1", approvalRequired: true, createdAt: C, updatedAt: U },
      // rec-2 has NO approved-human approval (pending) → must NOT qualify.
      { id: "rec-2", agentId: "ag-1", approvalId: "ap-2", approvalRequired: true, createdAt: C, updatedAt: U },
    ],
    // ap-2 is pending → its APPROVED_BY hop is not traversable.
    // (declared after rec so the lookup still resolves.)
    tasks: [
      { id: "t-1", ownerId: "u-1", sourceRecommendationId: "rec-1", relatedRef: "customer:cu-1", title: "משימה מהמלצה", status: "פתוחה", createdAt: C, updatedAt: U },
      { id: "t-2", ownerId: "u-1", sourceRecommendationId: "rec-2", relatedRef: "customer:cu-1", title: "משימה מהמלצה לא מאושרת", status: "פתוחה", createdAt: C, updatedAt: U },
    ],
  };
}

function withPendingApproval(records: Partial<Record<string, CanonicalRecord[]>>): Partial<Record<string, CanonicalRecord[]>> {
  return {
    ...records,
    approvals: [
      ...(records.approvals ?? []),
      { id: "ap-2", status: "ממתין", decidedById: null, createdAt: C, updatedAt: U },
    ],
  };
}

let snap: GraphIndexSnapshot;
async function build(): Promise<GraphIndexSnapshot> {
  snap ??= await deriveSnapshot(withPendingApproval(phase9Records()));
  return snap;
}

// ---------------------------------------------------------------------------
// Q3 — recurrence proven through the canonical chain
// ---------------------------------------------------------------------------

describe("Phase 9 canonical Q3 findRecurringServiceIssues", () => {
  it("groups by (printerModel, faultCategory) through serviceTicket→customerPrinter→printerModel", async () => {
    const svc = detQueryService(await build());
    const r = await svc.findRecurringServiceIssues(
      { query: "findRecurringServiceIssues", subjects: [nid("printerModel", "pm-1")] },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    const tickets = r.findings[0]!.evidence.filter((e) => e.entityType === "serviceTicket").map((e) => e.entityRef.entityId);
    // exactly the two same-category tickets; NEVER st-3 (other category) or st-free (free text).
    expect(tickets.sort()).toEqual(["st-1", "st-2"]);
    expect(tickets).not.toContain("st-3");
    expect(tickets).not.toContain("st-free");
    // 2-hop canonical paths (model→printer→ticket), body never opened.
    expect(r.findings[0]!.supportingPaths.every((p) => p.length === 2)).toBe(true);
    expect(r.findings[0]!.evidence.every((e) => e.bodyOpened === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Q4 — delay projected from embedded StageProgress
// ---------------------------------------------------------------------------

describe("Phase 9 canonical Q4 findDelayedEnrollments", () => {
  it("flags a delayed enrollment from the projected OPEN-stage due", async () => {
    const svc = detQueryService(await build());
    const r = await svc.findDelayedEnrollments(
      { query: "findDelayedEnrollments", subjects: [nid("enrollment", "en-delayed")], asOf: ASOF },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.reasonCodes).toEqual(["DELAYED_ENROLLMENT"]);
  });

  it("a completed-stage enrollment is SUPPORTED + [] (facts present, not delayed)", async () => {
    const svc = detQueryService(await build());
    const r = await svc.findDelayedEnrollments(
      { query: "findDelayedEnrollments", subjects: [nid("enrollment", "en-ontime")], asOf: ASOF },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(0);
  });

  it("an enrollment with NO stage facts stays INSUFFICIENT (never delayed-by-age)", async () => {
    const svc = detQueryService(await build());
    const r = await svc.findDelayedEnrollments(
      { query: "findDelayedEnrollments", subjects: [nid("enrollment", "en-nofacts")], asOf: ASOF },
      qctx(),
    );
    expect(r.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
    expect(r.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Q5 — inbound printer-model impact (deterministic)
// ---------------------------------------------------------------------------

describe("Phase 9 canonical Q5 assessPrinterModelSupportImpact", () => {
  it("walks USES inbound to the dependent printers/customers/tickets (DIRECT vs INDIRECT)", async () => {
    const svc = detQueryService(await build());
    const req = { query: "assessPrinterModelSupportImpact" as const, startNodeId: nid("printerModel", "pm-1") };
    const r1 = await svc.assessPrinterModelSupportImpact(req, qctx());
    const r2 = await svc.assessPrinterModelSupportImpact(req, qctx());
    expect(r1.readiness).toBe("SUPPORTED");
    const direct = r1.findings.filter((f) => f.reasonCodes.includes("PRINTER_MODEL_IMPACT_DIRECT")).map((f) => f.subject.entityRef.entityId).sort();
    expect(direct).toEqual(["cp-1", "cp-2"]); // the two printers of pm-1 (USES inbound)
    const impactedTypes = new Set(r1.findings.map((f) => f.subject.entityType));
    expect(impactedTypes.has("customer")).toBe(true);
    expect(impactedTypes.has("serviceTicket")).toBe(true);
    // deterministic
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ---------------------------------------------------------------------------
// Q6/Q8 — approved-recommendation → task through the canonical link
// ---------------------------------------------------------------------------

describe("Phase 9 canonical Q8 findTasksFromApprovedRecommendations", () => {
  it("qualifies a task from an APPROVED (human-decided) recommendation", async () => {
    const svc = detQueryService(await build());
    const r = await svc.findTasksFromApprovedRecommendations(
      { query: "findTasksFromApprovedRecommendations", subjects: [nid("aiRecommendation", "rec-1")] },
      qctx(),
    );
    expect(r.readiness).toBe("SUPPORTED");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.subject.entityRef.entityId).toBe("t-1");
    expect(r.findings[0]!.reasonCodes).toEqual(["APPROVED_RECOMMENDATION_TASK"]);
    // the approval hop retained approved state; provenance/authority present.
    expect(r.findings[0]!.approvalStateSummary).toContain("approved");
    expect(r.findings[0]!.evidence.every((e) => e.provenance !== undefined && e.authority !== undefined)).toBe(true);
  });

  it("a task from a PENDING (non-human-approved) recommendation does NOT qualify", async () => {
    const svc = detQueryService(await build());
    const r = await svc.findTasksFromApprovedRecommendations(
      { query: "findTasksFromApprovedRecommendations", subjects: [nid("aiRecommendation", "rec-2")] },
      qctx(),
    );
    expect(r.readiness).toBe("INSUFFICIENT_GRAPH_DATA");
    expect(r.findings).toHaveLength(0);
    expect(r.missingFacts.length).toBeGreaterThan(0);
  });
});
