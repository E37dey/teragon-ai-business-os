// TERAGON Business Graph — Phase 7 BUSINESS QUERY service (internal, typed).
// ---------------------------------------------------------------------------
// BusinessGraphQueryService answers 9 typed, evidence-backed business questions
// STRICTLY ON TOP of BusinessGraphTraversalService. Non-negotiables:
//   • EVERY query goes THROUGH the traversal service — no direct snapshot read,
//     no protected-body read, no re-implemented BFS in this layer;
//   • findings are assembled from what traversal returned AFTER its own security
//     filtering, so inaccessible entities are already gone BEFORE any count;
//   • an honest readiness state is returned when required facts are missing —
//     delay is never inferred from age, conflicts never from semantics, and no
//     natural-language fact or AI confidence is ever invented;
//   • the query clock is INJECTED (no hidden Date.now); the applied asOf +
//     thresholds are recorded on the result policy;
//   • both the business query AND its underlying traversal operations are audited
//     (the traversal audit records are collected and linked by execution id).
import { parseNodeId, type GraphNodeId, type GraphEntityType, type GraphEntityRef } from "../contracts/identity";
import type {
  GraphProvenance,
  GraphAuthority,
  GraphEdgeApprovalState,
  GraphRelationshipType,
} from "../contracts/edge";
import type { GraphSensitivity } from "../contracts/node";
import type { BusinessGraphNode } from "../contracts/node";
import type { GraphIndexHealthState } from "../store/contracts";
import type { BusinessGraphTraversalService } from "../traversal/service";
import { relationshipRequiresApproval } from "../traversal/security";
import type {
  GraphPath,
  GraphPathStep,
  GraphQueryAuditRecord,
  GraphQueryContext,
  GraphTraversalResult,
  GraphTruncationState,
  GraphImpactedNode,
} from "../traversal/types";
import { BUSINESS_QUERY_CAPABILITIES } from "./capabilities";
import { resolvePolicy } from "./policy";
import {
  isOpenTaskStatus,
  isOpenOpportunityStage,
  isUnansweredQuotationStatus,
  isPendingQuotationStatus,
} from "./policy";
import {
  businessQueryRequestSchema,
  type BusinessQueryRequest,
  type BusinessQueryResult,
  type BusinessQueryFinding,
  type BusinessQueryEvidence,
  type BusinessQueryReadiness,
  type BusinessQueryReasonCode,
  type BusinessQueryPolicy,
  type BusinessQueryName,
  type BusinessEntityReference,
  type BusinessRelationshipKind,
  type BusinessQueryAuditRecord,
} from "./types";

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------

export interface BusinessQueryServiceOptions {
  /** injected ISO clock — resolves asOf when neither the request nor ctx supplies one */
  now: () => string;
  /** unique business-query execution-id provider (default crypto.randomUUID) */
  executionIdProvider?: () => string;
}

// Phase 9 — INSTANCE-level missing-fact strings surfaced when a structurally
// SUPPORTED query is downgraded to INSUFFICIENT_GRAPH_DATA because the required
// canonical FACTS were absent on the encountered records (NOT a contract gap).
const INSTANCE_MISSING_FACTS: Record<string, readonly string[]> = {
  findRecurringServiceIssues: [
    "serviceTicket.customerPrinterId (relevant tickets exist for this model's customers but are not linked to a specific printer)",
    "serviceTicket.faultCategory (linked tickets are uncategorized, so recurrence cannot be grouped)",
  ],
  findDelayedEnrollments: [
    "enrollment stage due/status facts (the enrollment carries no dated OPEN-stage progress; delay is never inferred from age)",
  ],
  findTasksFromApprovedRecommendations: [
    "aiRecommendation → approved-human APPROVED_BY (no approval with status אושר decided by a canonical human was reached)",
    "aiRecommendation → task GENERATED_TASK (no task carries sourceRecommendationId back to this recommendation)",
  ],
};

// hard traversal refusals that BLOCK the whole business query (not per-subject).
const HARD_REFUSALS: ReadonlySet<string> = new Set<string>([
  "GRAPH_UNAVAILABLE",
  "STALE_NOT_AUTHORIZED",
  "ORG_CONTEXT_MISMATCH",
  "INVALID_CONTEXT",
  "INVALID_REQUEST",
]);

function readinessForRefusal(reason: string): BusinessQueryReadiness {
  if (reason === "GRAPH_UNAVAILABLE" || reason === "STALE_NOT_AUTHORIZED") return "BLOCKED_BY_HEALTH";
  if (reason === "ORG_CONTEXT_MISMATCH" || reason === "INVALID_CONTEXT") return "BLOCKED_BY_PERMISSION";
  return "UNSUPPORTED";
}

/** Accumulator threaded across the traversal calls of one business query. */
interface Accum {
  audits: GraphQueryAuditRecord[];
  execIds: string[];
  snapshotId: string | null;
  registryVersion: string | null;
  health: GraphIndexHealthState;
  stale: boolean;
  truncated: boolean;
  hardRefusal: string | null;
}

function newAccum(): Accum {
  return {
    audits: [],
    execIds: [],
    snapshotId: null,
    registryVersion: null,
    health: "MISSING",
    stale: false,
    truncated: false,
    hardRefusal: null,
  };
}

// ---------------------------------------------------------------------------
// pure envelope-safe builders
// ---------------------------------------------------------------------------

/** Read a non-empty STRING metadata fact off a node envelope, or null. */
function metaString(node: BusinessGraphNode, key: string): string | null {
  const v = node.metadataSummary[key];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function refFromId(id: GraphNodeId): { entityType: GraphEntityType; entityRef: GraphEntityRef } {
  const ref = parseNodeId(id);
  return { entityType: ref.entityType, entityRef: ref };
}

function entityRefOfNode(node: BusinessGraphNode): BusinessEntityReference {
  return {
    nodeId: node.id,
    entityType: node.entityType,
    entityRef: { organizationId: node.organizationId, entityType: node.entityType, entityId: node.entityId },
  };
}

function entityRefOfId(id: GraphNodeId): BusinessEntityReference {
  const { entityType, entityRef } = refFromId(id);
  return { nodeId: id, entityType, entityRef };
}

/** Approval state inferred from the traversal CONTRACT: an approval-gated hop that
 *  was traversed at all is necessarily `approved`; otherwise it is not meaningful. */
function approvalStateForRelationship(rt: GraphRelationshipType | null): GraphEdgeApprovalState {
  if (rt === null) return "none";
  return relationshipRequiresApproval(rt) ? "approved" : "none";
}

function oneHopPath(startId: GraphNodeId, step: GraphPathStep, otherId: GraphNodeId): GraphPath {
  return { nodes: [startId, otherId], steps: [step], length: 1 };
}

function makeEvidence(args: {
  nodeId: GraphNodeId;
  provenance: GraphProvenance;
  authority: GraphAuthority;
  relationshipType: GraphRelationshipType | null;
  direct: boolean;
  sensitivity: GraphSensitivity | null;
  path: GraphPath;
}): BusinessQueryEvidence {
  const { entityType, entityRef } = refFromId(args.nodeId);
  return {
    nodeId: args.nodeId,
    entityType,
    entityRef,
    provenance: args.provenance,
    authority: args.authority,
    approvalState: approvalStateForRelationship(args.relationshipType),
    relationshipType: args.relationshipType,
    direct: args.direct,
    sensitivity: args.sensitivity,
    path: args.path,
    bodyOpened: false,
  };
}

function relationshipKindOf(evidence: readonly BusinessQueryEvidence[]): BusinessRelationshipKind {
  if (evidence.length === 0) return "NONE";
  const anyDirect = evidence.some((e) => e.direct);
  const anyIndirect = evidence.some((e) => !e.direct);
  if (anyDirect && anyIndirect) return "MIXED";
  return anyDirect ? "DIRECT" : "INDIRECT";
}

function summarize(evidence: readonly BusinessQueryEvidence[]): {
  provenanceSummary: GraphProvenance[];
  authoritySummary: GraphAuthority[];
  approvalStateSummary: GraphEdgeApprovalState[];
} {
  const prov = new Set<GraphProvenance>();
  const auth = new Set<GraphAuthority>();
  const appr = new Set<GraphEdgeApprovalState>();
  for (const e of evidence) {
    prov.add(e.provenance);
    auth.add(e.authority);
    appr.add(e.approvalState ?? "none");
  }
  return {
    provenanceSummary: [...prov].sort(),
    authoritySummary: [...auth].sort(),
    approvalStateSummary: [...appr].sort(),
  };
}

// ---------------------------------------------------------------------------
// service
// ---------------------------------------------------------------------------

export class BusinessGraphQueryService {
  private readonly traversal: BusinessGraphTraversalService;
  private readonly now: () => string;
  private readonly execId: () => string;

  constructor(traversal: BusinessGraphTraversalService, options: BusinessQueryServiceOptions) {
    this.traversal = traversal;
    this.now = options.now; // NO hidden Date.now in this layer.
    this.execId = options.executionIdProvider ?? (() => crypto.randomUUID());
  }

  // -------------------------------------------------------------------------
  // shared traversal-call recorder (business + underlying-traversal audit)
  // -------------------------------------------------------------------------

  private record(result: GraphTraversalResult, acc: Accum): void {
    acc.audits.push(result.audit);
    acc.execIds.push(result.audit.executionId);
    acc.snapshotId = result.snapshotId;
    acc.registryVersion = result.registryVersion;
    acc.health = result.health;
    acc.stale = result.stale;
    if (result.truncated.truncated) acc.truncated = true;
    if (!result.ok && result.refusalReason !== null && HARD_REFUSALS.has(result.refusalReason)) {
      acc.hardRefusal = result.refusalReason;
    }
  }

  /** Resolve the traversal ctx (explicit asOf → ctx.asOf → injected clock). */
  private traversalCtx(ctx: GraphQueryContext, resolvedAsOf: string): GraphQueryContext {
    return { ...ctx, asOf: resolvedAsOf };
  }

  private finalize(args: {
    query: BusinessQueryName;
    ctx: GraphQueryContext;
    request: BusinessQueryRequest;
    policy: BusinessQueryPolicy;
    acc: Accum;
    findings: BusinessQueryFinding[];
    readiness: BusinessQueryReadiness;
    missingFacts: string[];
    ok: boolean;
    refusalReason: string | null;
  }): BusinessQueryResult {
    const { query, ctx, request, policy, acc, findings, readiness, missingFacts, ok, refusalReason } = args;
    // counts computed ONLY from the assembled (already-security-filtered) findings.
    const entityIds = new Set<string>();
    for (const f of findings) {
      entityIds.add(f.subject.nodeId);
      for (const r of f.relatedEntities) entityIds.add(r.nodeId);
      for (const e of f.evidence) entityIds.add(e.nodeId);
    }
    const counts = { findings: findings.length, entities: entityIds.size };
    const audit: BusinessQueryAuditRecord = {
      executionId: this.execId(),
      query,
      organizationId: ctx.organizationId,
      actorKind: ctx.viewer.actor.kind,
      policyVersion: policy.policyVersion,
      asOf: policy.asOf,
      thresholdDays: policy.thresholdDays,
      cutoff: policy.cutoff,
      readiness,
      snapshotId: acc.snapshotId,
      health: acc.health,
      stale: acc.stale,
      subjectCount: request.subjects?.length ?? (request.startNodeId ? 1 : 0),
      resultCounts: counts,
      truncated: acc.truncated,
      traversalExecutionIds: acc.execIds,
      safeReason: refusalReason,
    };
    return {
      ok,
      query,
      organizationId: ctx.organizationId,
      snapshotId: acc.snapshotId,
      registryVersion: acc.registryVersion,
      health: acc.health,
      stale: acc.stale,
      readiness,
      capability: BUSINESS_QUERY_CAPABILITIES[query],
      policy,
      findings,
      counts,
      truncated: acc.truncated,
      missingFacts,
      refusalReason,
      audit,
      traversalAudits: acc.audits,
    };
  }

  /** Shared preamble: validate → resolve asOf/policy → return null on refusal result. */
  private preamble(
    query: BusinessQueryName,
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ):
    | { kind: "refuse"; result: BusinessQueryResult }
    | { kind: "ok"; policy: BusinessQueryPolicy; asOf: string; acc: Accum } {
    const acc = newAccum();
    const parsed = businessQueryRequestSchema.safeParse(request);
    const asOf = request.asOf ?? ctx.asOf ?? this.now();
    const policy = resolvePolicy({
      query,
      asOf,
      thresholdDays: request.thresholdDays,
      policyVersion: request.policyVersion,
    });
    const hasSubjects = (request.subjects?.length ?? 0) > 0 || request.startNodeId !== undefined;
    if (!parsed.success || parsed.data.query !== query || !hasSubjects) {
      return {
        kind: "refuse",
        result: this.finalize({
          query,
          ctx,
          request,
          policy,
          acc,
          findings: [],
          readiness: "UNSUPPORTED",
          missingFacts: [],
          ok: false,
          refusalReason: "INVALID_REQUEST",
        }),
      };
    }
    return { kind: "ok", policy, asOf, acc };
  }

  /** Build a finding skeleton with all the required envelope fields filled. */
  private buildFinding(args: {
    acc: Accum;
    ctx: GraphQueryContext;
    policy: BusinessQueryPolicy;
    subject: BusinessEntityReference;
    relatedEntities: BusinessEntityReference[];
    reasonCodes: BusinessQueryReasonCode[];
    evidence: BusinessQueryEvidence[];
    supportingPaths: GraphPath[];
    truncated: GraphTruncationState;
  }): BusinessQueryFinding {
    const s = summarize(args.evidence);
    return {
      organizationId: args.ctx.organizationId,
      snapshotId: args.acc.snapshotId,
      graphHealth: args.acc.health,
      stale: args.acc.stale,
      queryExecutionId: "", // filled by the query method with the business executionId
      subject: args.subject,
      relatedEntities: args.relatedEntities,
      reasonCodes: args.reasonCodes,
      supportingPaths: args.supportingPaths,
      evidence: args.evidence,
      provenanceSummary: s.provenanceSummary,
      authoritySummary: s.authoritySummary,
      approvalStateSummary: s.approvalStateSummary,
      relationshipKind: relationshipKindOf(args.evidence),
      truncated: args.truncated,
      policyVersion: args.policy.policyVersion,
      sourceConfidence: null,
    };
  }

  /** Stamp the business execution id onto every finding's queryExecutionId. */
  private stampExecutionId(findings: BusinessQueryFinding[], result: BusinessQueryResult): BusinessQueryResult {
    for (const f of findings) f.queryExecutionId = result.audit.executionId;
    return result;
  }

  // =========================================================================
  // Q1 — findCustomersNeedingFollowUp
  // =========================================================================

  async findCustomersNeedingFollowUp(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "findCustomersNeedingFollowUp";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];

    for (const subject of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const r = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: subject }, tctx);
      this.record(r, acc);
      if (!r.ok || r.data === null) continue;
      const data = r.data;
      const evidence: BusinessQueryEvidence[] = [];
      const reasons = new Set<BusinessQueryReasonCode>();
      const related: BusinessEntityReference[] = [];
      for (const nb of data.neighbors) {
        let reason: BusinessQueryReasonCode | null = null;
        if (nb.node.entityType === "task" && isOpenTaskStatus(nb.node.status)) reason = "OPEN_FOLLOW_UP_TASK";
        else if (nb.node.entityType === "opportunity" && isOpenOpportunityStage(nb.node.status)) reason = "OPEN_OPPORTUNITY";
        else if (nb.node.entityType === "quotation" && isPendingQuotationStatus(nb.node.status)) reason = "PENDING_QUOTATION_LINK";
        if (reason === null) continue;
        reasons.add(reason);
        const path = oneHopPath(data.startNode.id, nb.via, nb.node.id);
        evidence.push(makeEvidence({
          nodeId: nb.node.id,
          provenance: nb.via.provenance,
          authority: nb.via.authority,
          relationshipType: nb.via.relationshipType,
          direct: true,
          sensitivity: nb.node.sensitivity,
          path,
        }));
        related.push(entityRefOfNode(nb.node));
      }
      if (reasons.size === 0) continue;
      findings.push(this.buildFinding({
        acc, ctx, policy,
        subject: entityRefOfNode(data.startNode),
        relatedEntities: related,
        reasonCodes: [...reasons],
        evidence,
        supportingPaths: evidence.map((e) => e.path),
        truncated: r.truncated,
      }));
    }

    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);
    const readiness: BusinessQueryReadiness = "SUPPORTED";
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness, missingFacts: [], ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q2 — findUnansweredQuotations
  // =========================================================================

  async findUnansweredQuotations(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "findUnansweredQuotations";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];

    for (const subject of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const r = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: subject }, tctx);
      this.record(r, acc);
      if (!r.ok || r.data === null) continue;
      const data = r.data;
      const q = data.startNode;
      if (q.entityType !== "quotation") continue;
      if (!isUnansweredQuotationStatus(q.status)) continue;
      // deterministic calendar-day cutoff: aged when created on/before the cutoff.
      if (policy.cutoff === null || q.createdAt > policy.cutoff) continue;
      const evidence: BusinessQueryEvidence[] = [];
      const related: BusinessEntityReference[] = [];
      for (const nb of data.neighbors) {
        if (!["customer", "opportunity", "task"].includes(nb.node.entityType)) continue;
        evidence.push(makeEvidence({
          nodeId: nb.node.id,
          provenance: nb.via.provenance,
          authority: nb.via.authority,
          relationshipType: nb.via.relationshipType,
          direct: true,
          sensitivity: nb.node.sensitivity,
          path: oneHopPath(q.id, nb.via, nb.node.id),
        }));
        related.push(entityRefOfNode(nb.node));
      }
      findings.push(this.buildFinding({
        acc, ctx, policy,
        subject: entityRefOfNode(q),
        relatedEntities: related,
        reasonCodes: ["UNANSWERED_QUOTATION_AGED"],
        evidence,
        supportingPaths: evidence.map((e) => e.path),
        truncated: r.truncated,
      }));
    }

    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness: "SUPPORTED", missingFacts: [], ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q3 — findRecurringServiceIssues
  // =========================================================================

  async findRecurringServiceIssues(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "findRecurringServiceIssues";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];
    // relevant service tickets exist for this model's customers but lack the
    // canonical facts (printer link / fault category) needed to group recurrence.
    let anyIncompleteRelevant = false;

    for (const modelId of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const modelRes = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: modelId }, tctx);
      this.record(modelRes, acc);
      if (!modelRes.ok || modelRes.data === null) continue;
      const modelData = modelRes.data;
      const printers = modelData.neighbors.filter((n) => n.node.entityType === "customerPrinter");

      // canonically-LINKED tickets (SERVICED serviceTicket→customerPrinter),
      // grouped by (this model, faultCategory). Only tickets carrying a typed
      // faultCategory are groupable — recurrence is never grouped by free text.
      const byCategory = new Map<string, { ticket: BusinessGraphNode; ticketVia: GraphPathStep; printer: BusinessGraphNode; printerVia: GraphPathStep }[]>();
      const seenTickets = new Set<string>();
      const seenCustomers = new Set<string>();
      for (const printer of printers) {
        if (acc.hardRefusal) break;
        const printerRes = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: printer.node.id }, tctx);
        this.record(printerRes, acc);
        if (!printerRes.ok || printerRes.data === null) continue;
        for (const nb of printerRes.data.neighbors) {
          if (nb.node.entityType === "serviceTicket") {
            const category = metaString(nb.node, "faultCategory");
            if (category === null) { anyIncompleteRelevant = true; continue; } // linked but uncategorized
            if (seenTickets.has(nb.node.id)) continue;
            seenTickets.add(nb.node.id);
            const arr = byCategory.get(category) ?? [];
            arr.push({ ticket: nb.node, ticketVia: nb.via, printer: printer.node, printerVia: printer.via });
            byCategory.set(category, arr);
          } else if (nb.node.entityType === "customer") {
            // INSTANCE completeness probe: does the owning customer have service
            // tickets NOT linked to a specific printer (or uncategorized)? Such a
            // ticket is a RELEVANT-but-INCOMPLETE record (never grouped heuristically).
            if (seenCustomers.has(nb.node.id)) continue;
            seenCustomers.add(nb.node.id);
            const custRes = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: nb.node.id }, tctx);
            this.record(custRes, acc);
            if (!custRes.ok || custRes.data === null) continue;
            for (const cn of custRes.data.neighbors) {
              if (cn.node.entityType !== "serviceTicket") continue;
              if (metaString(cn.node, "customerPrinterId") === null || metaString(cn.node, "faultCategory") === null) {
                anyIncompleteRelevant = true;
              }
            }
          }
        }
      }

      // a (model, faultCategory) group with MULTIPLE linked tickets is recurring.
      for (const items of byCategory.values()) {
        if (items.length < 2) continue;
        const evidence: BusinessQueryEvidence[] = [];
        const related: BusinessEntityReference[] = [];
        for (const it of items) {
          const twoHop: GraphPath = {
            nodes: [modelData.startNode.id, it.printer.id, it.ticket.id],
            steps: [it.printerVia, it.ticketVia],
            length: 2,
          };
          evidence.push(makeEvidence({
            nodeId: it.ticket.id,
            provenance: it.ticketVia.provenance,
            authority: it.ticketVia.authority,
            relationshipType: it.ticketVia.relationshipType,
            direct: false,
            sensitivity: it.ticket.sensitivity,
            path: twoHop,
          }));
          related.push(entityRefOfNode(it.ticket));
          related.push(entityRefOfNode(it.printer));
        }
        findings.push(this.buildFinding({
          acc, ctx, policy,
          subject: entityRefOfNode(modelData.startNode),
          relatedEntities: related,
          reasonCodes: ["RECURRING_SERVICE_ISSUE"],
          evidence,
          supportingPaths: evidence.map((e) => e.path),
          truncated: modelRes.truncated,
        }));
      }
    }

    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);
    // structurally SUPPORTED; INSTANCE-level INSUFFICIENT only when relevant tickets
    // exist that lack the canonical facts AND nothing groupable was found. When no
    // records match at all → SUPPORTED + [] (an honest empty answer).
    const insufficient = findings.length === 0 && anyIncompleteRelevant;
    const readiness: BusinessQueryReadiness = insufficient ? "INSUFFICIENT_GRAPH_DATA" : "SUPPORTED";
    const missingFacts = insufficient ? [...(INSTANCE_MISSING_FACTS[query] ?? [])] : [];
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness, missingFacts, ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q4 — findDelayedEnrollments (NEVER infer delay from age)
  // =========================================================================

  async findDelayedEnrollments(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "findDelayedEnrollments";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];
    // an enrollment with dated OPEN-stage facts is structurally answerable; one
    // without is INSUFFICIENT (delay is NEVER inferred from enrollment age).
    let anyStageFacts = false;
    let anyMissingFacts = false;

    for (const subject of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const r = await this.traversal.getNode({ operation: "getNode", startNodeId: subject }, tctx);
      this.record(r, acc);
      if (!r.ok || r.data === null) continue;
      const node = r.data;
      if (node.entityType !== "enrollment") continue;
      // the enrollment stage-progress projection (derived, clock-free).
      if (node.metadataSummary["enrollmentStageFactsPresent"] !== true) {
        anyMissingFacts = true;
        continue;
      }
      anyStageFacts = true;
      const earliestOpenDue = metaString(node, "enrollmentEarliestOpenStageDue");
      // delayed ONLY when an OPEN (non-completed) stage's due < asOf. Date-string
      // boundary: the due day is a grace day (strict <), TZ-independent.
      if (earliestOpenDue === null || !(earliestOpenDue < asOf)) continue;
      const evidence: BusinessQueryEvidence[] = [];
      const nbRes = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: subject }, tctx);
      this.record(nbRes, acc);
      const related: BusinessEntityReference[] = [];
      if (nbRes.ok && nbRes.data !== null) {
        for (const nb of nbRes.data.neighbors) {
          if (!["course", "student"].includes(nb.node.entityType)) continue;
          evidence.push(makeEvidence({
            nodeId: nb.node.id, provenance: nb.via.provenance, authority: nb.via.authority,
            relationshipType: nb.via.relationshipType, direct: true, sensitivity: nb.node.sensitivity,
            path: oneHopPath(node.id, nb.via, nb.node.id),
          }));
          related.push(entityRefOfNode(nb.node));
        }
      }
      findings.push(this.buildFinding({
        acc, ctx, policy,
        subject: entityRefOfId(node.id),
        relatedEntities: related,
        reasonCodes: ["DELAYED_ENROLLMENT"],
        evidence,
        supportingPaths: evidence.map((e) => e.path),
        truncated: r.truncated,
      }));
    }

    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);
    // SUPPORTED when stage facts were present (findings or an honest empty answer);
    // INSUFFICIENT only when an enrollment carried NO dated stage facts at all.
    const insufficient = findings.length === 0 && !anyStageFacts && anyMissingFacts;
    const readiness: BusinessQueryReadiness = insufficient ? "INSUFFICIENT_GRAPH_DATA" : "SUPPORTED";
    const missingFacts = insufficient ? [...(INSTANCE_MISSING_FACTS[query] ?? [])] : [];
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness, missingFacts, ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q5 — assessPrinterModelSupportImpact (via calculateImpact)
  // =========================================================================

  async assessPrinterModelSupportImpact(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "assessPrinterModelSupportImpact";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];
    const origin = request.startNodeId ?? (request.subjects ?? [])[0];
    if (origin === undefined) return this.blocked(query, ctx, request, policy, acc);

    // Phase 9 — INBOUND (incident) impact: walk the customerPrinter→printerModel
    // USES edge in reverse (no inverse edge) to the customerPrinters, then to their
    // customers (OWNS), tickets (SERVICED serviceTicket→customerPrinter) and open
    // tasks (RELATED_TO task→customer). Bounded by a closed entity-type allow-list.
    const r = await this.traversal.calculateImpact({
      operation: "calculateImpact",
      startNodeId: origin,
      impactDirection: "incident",
      limits: { allowedEntityTypes: ["customerPrinter", "customer", "serviceTicket", "task"] },
    }, tctx);
    this.record(r, acc);
    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);

    if (r.ok && r.data !== null) {
      const data = r.data;
      const emit = (impacted: GraphImpactedNode, direct: boolean): void => {
        // only OPEN tasks count as impacted work; closed/cancelled tasks are inert.
        if (impacted.node.entityType === "task" && !isOpenTaskStatus(impacted.node.status)) return;
        const rt = impacted.path.steps[impacted.path.steps.length - 1]?.relationshipType ?? null;
        const ev = makeEvidence({
          nodeId: impacted.node.id,
          provenance: impacted.path.steps[impacted.path.steps.length - 1]?.provenance ?? "EXPLICIT",
          authority: impacted.path.steps[impacted.path.steps.length - 1]?.authority ?? "CANONICAL",
          relationshipType: rt, direct, sensitivity: impacted.node.sensitivity, path: impacted.path,
        });
        findings.push(this.buildFinding({
          acc, ctx, policy,
          subject: entityRefOfNode(impacted.node),
          relatedEntities: [entityRefOfId(data.originNodeId)],
          reasonCodes: [direct ? "PRINTER_MODEL_IMPACT_DIRECT" : "PRINTER_MODEL_IMPACT_INDIRECT"],
          evidence: [ev],
          supportingPaths: [impacted.path],
          truncated: r.truncated,
        }));
      };
      for (const d of data.direct) emit(d, true);
      for (const i of data.indirect) emit(i, false);
    }

    // structurally SUPPORTED (traversal-direction only — no canonical fact can be
    // "missing"): a model with no dependents is an honest SUPPORTED + [] answer.
    const readiness: BusinessQueryReadiness = "SUPPORTED";
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness, missingFacts: [], ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q6 — findSupersededEvidence (SUPERSEDES; current vs historical)
  // =========================================================================

  async findSupersededEvidence(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "findSupersededEvidence";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];

    for (const subject of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const r = await this.traversal.findConflicts({ operation: "findConflicts", startNodeId: subject }, tctx);
      this.record(r, acc);
      if (!r.ok || r.data === null) continue;
      for (const c of r.data.conflicts) {
        if (c.kind !== "SUPERSEDES") continue;
        // SUPERSEDES source supersedes target ⇒ target is HISTORICAL, source CURRENT.
        const historicalId = c.targetNodeId;
        const currentId = c.sourceNodeId;
        const path: GraphPath = {
          nodes: [c.sourceNodeId, c.targetNodeId],
          steps: [{
            edgeId: c.edgeId, relationshipType: c.relationshipType,
            sourceId: c.sourceNodeId, targetId: c.targetNodeId,
            provenance: c.provenance, authority: c.authority, direction: "directed",
          }],
          length: 1,
        };
        const ev = makeEvidence({
          nodeId: historicalId, provenance: c.provenance, authority: c.authority,
          relationshipType: c.relationshipType, direct: true, sensitivity: c.otherNode.sensitivity, path,
        });
        findings.push(this.buildFinding({
          acc, ctx, policy,
          subject: entityRefOfId(historicalId),
          relatedEntities: [entityRefOfId(currentId)],
          reasonCodes: ["SUPERSEDED_EVIDENCE_HISTORICAL", "CURRENT_EVIDENCE"],
          evidence: [ev],
          supportingPaths: [path],
          truncated: r.truncated,
        }));
      }
    }

    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness: "SUPPORTED", missingFacts: [], ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q7 — findRecommendationConflicts (registered CONTRADICTS only)
  // =========================================================================

  async findRecommendationConflicts(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "findRecommendationConflicts";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];

    for (const subject of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const r = await this.traversal.findConflicts({ operation: "findConflicts", startNodeId: subject }, tctx);
      this.record(r, acc);
      if (!r.ok || r.data === null) continue;
      for (const c of r.data.conflicts) {
        // ONLY a registered CONTRADICTS relationship — never inferred.
        if (c.kind !== "CONTRADICTS") continue;
        const path: GraphPath = {
          nodes: [c.sourceNodeId, c.targetNodeId],
          steps: [{
            edgeId: c.edgeId, relationshipType: c.relationshipType,
            sourceId: c.sourceNodeId, targetId: c.targetNodeId,
            provenance: c.provenance, authority: c.authority, direction: "directed",
          }],
          length: 1,
        };
        const ev = makeEvidence({
          nodeId: c.otherNode.id, provenance: c.provenance, authority: c.authority,
          relationshipType: c.relationshipType, direct: true, sensitivity: c.otherNode.sensitivity, path,
        });
        findings.push(this.buildFinding({
          acc, ctx, policy,
          subject: entityRefOfId(subject as GraphNodeId),
          relatedEntities: [entityRefOfNode(c.otherNode)],
          reasonCodes: ["REGISTERED_CONTRADICTION"],
          evidence: [ev],
          supportingPaths: [path],
          truncated: r.truncated,
        }));
      }
    }

    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness: "SUPPORTED", missingFacts: [], ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q8 — findTasksFromApprovedRecommendations
  // =========================================================================

  async findTasksFromApprovedRecommendations(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "findTasksFromApprovedRecommendations";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];
    let sawApprovedApproval = false;

    for (const recId of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const r = await this.traversal.calculateImpact({ operation: "calculateImpact", startNodeId: recId }, tctx);
      this.record(r, acc);
      if (!r.ok || r.data === null) continue;
      const data = r.data;
      const reached = [...data.direct, ...data.indirect];
      // approval reached via an APPROVED_BY hop (only traversable when approved)
      // AND carrying a NAMED-HUMAN approver (ownerRef is a user).
      const approval = reached.find((i) =>
        i.node.entityType === "approval" &&
        i.path.steps.some((s) => s.relationshipType === "APPROVED_BY") &&
        i.node.ownerRef !== null && i.node.ownerRef.entityType === "user");
      if (approval !== undefined) sawApprovedApproval = true;
      const task = reached.find((i) =>
        i.node.entityType === "task" &&
        i.path.steps.some((s) => s.relationshipType === "GENERATED_TASK"));
      if (approval === undefined || task === undefined) continue;
      const approvalStep = approval.path.steps[approval.path.steps.length - 1];
      const taskStep = task.path.steps[task.path.steps.length - 1];
      const evidence: BusinessQueryEvidence[] = [
        makeEvidence({
          nodeId: approval.node.id, provenance: approvalStep?.provenance ?? "EXPLICIT",
          authority: approvalStep?.authority ?? "CANONICAL", relationshipType: approvalStep?.relationshipType ?? null,
          direct: approval.impact === "DIRECT", sensitivity: approval.node.sensitivity, path: approval.path,
        }),
        makeEvidence({
          nodeId: task.node.id, provenance: taskStep?.provenance ?? "EXPLICIT",
          authority: taskStep?.authority ?? "CANONICAL", relationshipType: taskStep?.relationshipType ?? null,
          direct: task.impact === "DIRECT", sensitivity: task.node.sensitivity, path: task.path,
        }),
      ];
      findings.push(this.buildFinding({
        acc, ctx, policy,
        subject: entityRefOfNode(task.node),
        relatedEntities: [entityRefOfId(recId as GraphNodeId), entityRefOfNode(approval.node)],
        reasonCodes: ["APPROVED_RECOMMENDATION_TASK"],
        evidence,
        supportingPaths: [approval.path, task.path],
        truncated: r.truncated,
      }));
    }

    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);
    // structurally SUPPORTED; INSTANCE-level INSUFFICIENT when no approved,
    // human-decided approval was reached from any subject recommendation.
    const readiness: BusinessQueryReadiness = sawApprovedApproval ? "SUPPORTED" : "INSUFFICIENT_GRAPH_DATA";
    const missingFacts = sawApprovedApproval ? [] : [...(INSTANCE_MISSING_FACTS[query] ?? [])];
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness, missingFacts, ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // =========================================================================
  // Q9 — buildFullEvidencePath (bounded, permission-filtered, provenance-labelled)
  // =========================================================================

  async buildFullEvidencePath(
    request: BusinessQueryRequest,
    ctx: GraphQueryContext,
  ): Promise<BusinessQueryResult> {
    const query: BusinessQueryName = "buildFullEvidencePath";
    const pre = this.preamble(query, request, ctx);
    if (pre.kind === "refuse") return pre.result;
    const { acc, policy, asOf } = pre;
    const tctx = this.traversalCtx(ctx, asOf);
    const findings: BusinessQueryFinding[] = [];
    const start = request.startNodeId;
    const target = request.targetNodeId;
    if (start === undefined || target === undefined) {
      return this.finalize({ query, ctx, request, policy, acc, findings: [], readiness: "UNSUPPORTED", missingFacts: [], ok: false, refusalReason: "INVALID_REQUEST" });
    }

    const r = await this.traversal.findPath({ operation: "findPath", startNodeId: start, targetNodeId: target }, tctx);
    this.record(r, acc);
    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);

    if (r.ok && r.data !== null) {
      const paths = (r.data as { paths: GraphPath[] }).paths;
      if (paths.length > 0) {
        const evidence: BusinessQueryEvidence[] = [];
        for (const path of paths) {
          for (let i = 1; i < path.nodes.length; i += 1) {
            const nodeId = path.nodes[i]!;
            const step = path.steps[i - 1]!;
            evidence.push(makeEvidence({
              nodeId, provenance: step.provenance, authority: step.authority,
              relationshipType: step.relationshipType, direct: path.length === 1, sensitivity: null,
              path,
            }));
          }
        }
        findings.push(this.buildFinding({
          acc, ctx, policy,
          subject: entityRefOfId(start as GraphNodeId),
          relatedEntities: [entityRefOfId(target as GraphNodeId)],
          reasonCodes: ["EVIDENCE_PATH"],
          evidence,
          supportingPaths: paths,
          truncated: r.truncated,
        }));
      }
    }

    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness: "SUPPORTED", missingFacts: [], ok: true, refusalReason: null });
    return this.stampExecutionId(findings, result);
  }

  // -------------------------------------------------------------------------
  // shared blocked result (health/context refusal surfaced from traversal)
  // -------------------------------------------------------------------------

  private blocked(
    query: BusinessQueryName,
    ctx: GraphQueryContext,
    request: BusinessQueryRequest,
    policy: BusinessQueryPolicy,
    acc: Accum,
  ): BusinessQueryResult {
    const reason = acc.hardRefusal ?? "GRAPH_UNAVAILABLE";
    return this.finalize({
      query, ctx, request, policy, acc,
      findings: [],
      readiness: readinessForRefusal(reason),
      missingFacts: [],
      ok: false,
      refusalReason: reason,
    });
  }
}
