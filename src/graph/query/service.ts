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
    let anyTicketLinked = false;

    for (const modelId of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const modelRes = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: modelId }, tctx);
      this.record(modelRes, acc);
      if (!modelRes.ok || modelRes.data === null) continue;
      const modelData = modelRes.data;
      const printers = modelData.neighbors.filter((n) => n.node.entityType === "customerPrinter");

      const evidence: BusinessQueryEvidence[] = [];
      const related: BusinessEntityReference[] = [];
      const ticketIds = new Set<string>();
      for (const printer of printers) {
        if (acc.hardRefusal) break;
        const printerRes = await this.traversal.getNeighbors({ operation: "getNeighbors", startNodeId: printer.node.id }, tctx);
        this.record(printerRes, acc);
        if (!printerRes.ok || printerRes.data === null) continue;
        const tickets = printerRes.data.neighbors.filter((n) => n.node.entityType === "serviceTicket");
        for (const ticket of tickets) {
          anyTicketLinked = true;
          if (ticketIds.has(ticket.node.id)) continue;
          ticketIds.add(ticket.node.id);
          const twoHop: GraphPath = {
            nodes: [modelData.startNode.id, printer.node.id, ticket.node.id],
            steps: [printer.via, ticket.via],
            length: 2,
          };
          evidence.push(makeEvidence({
            nodeId: ticket.node.id,
            provenance: ticket.via.provenance,
            authority: ticket.via.authority,
            relationshipType: ticket.via.relationshipType,
            direct: false,
            sensitivity: ticket.node.sensitivity,
            path: twoHop,
          }));
          related.push(entityRefOfNode(ticket.node));
          related.push(entityRefOfNode(printer.node));
        }
      }
      // "recurring" requires MULTIPLE authoritative service-ticket relationships.
      if (ticketIds.size >= 2) {
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
    // honest readiness: without any ticket→printer linkage the spine cannot detect
    // recurrence at all (a missing edge), so report INSUFFICIENT_GRAPH_DATA.
    const cap = BUSINESS_QUERY_CAPABILITIES[query];
    const readiness: BusinessQueryReadiness = anyTicketLinked ? "SUPPORTED" : "INSUFFICIENT_GRAPH_DATA";
    const missingFacts = anyTicketLinked ? [] : [...cap.missingFacts];
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
    let anyDelayFacts = false;

    for (const subject of request.subjects ?? []) {
      if (acc.hardRefusal) break;
      const r = await this.traversal.getNode({ operation: "getNode", startNodeId: subject }, tctx);
      this.record(r, acc);
      if (!r.ok || r.data === null) continue;
      const node = r.data;
      if (node.entityType !== "enrollment") continue;
      const meta = node.metadataSummary;
      const dueDate = typeof meta["dueDate"] === "string" ? (meta["dueDate"] as string)
        : typeof meta["expectedCompletionAt"] === "string" ? (meta["expectedCompletionAt"] as string) : null;
      const progress = typeof meta["progress"] === "number" ? (meta["progress"] as number) : null;
      // REQUIRE both a due-date AND a progress fact — otherwise delay is unknowable.
      if (dueDate === null || progress === null) continue;
      anyDelayFacts = true;
      // delayed = past the due date AND not yet complete. Deterministic, fact-based.
      if (!(dueDate < asOf && progress < 100)) continue;
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
    const cap = BUSINESS_QUERY_CAPABILITIES[query];
    const readiness: BusinessQueryReadiness = anyDelayFacts ? "SUPPORTED" : "INSUFFICIENT_GRAPH_DATA";
    const missingFacts = anyDelayFacts ? [] : [...cap.missingFacts];
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

    const r = await this.traversal.calculateImpact({ operation: "calculateImpact", startNodeId: origin }, tctx);
    this.record(r, acc);
    if (acc.hardRefusal) return this.blocked(query, ctx, request, policy, acc);

    let impactedCount = 0;
    if (r.ok && r.data !== null) {
      const data = r.data;
      const emit = (impacted: GraphImpactedNode, direct: boolean): void => {
        impactedCount += 1;
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

    const cap = BUSINESS_QUERY_CAPABILITIES[query];
    // bounded + deterministic: an empty impact means the model has no outbound
    // impact edge (USES is oriented printer→model) — an honest data gap.
    const readiness: BusinessQueryReadiness = impactedCount > 0 ? "SUPPORTED" : "INSUFFICIENT_GRAPH_DATA";
    const missingFacts = impactedCount > 0 ? [] : [...cap.missingFacts];
    const result = this.finalize({ query, ctx, request, policy, acc, findings, readiness, missingFacts, ok: true, refusalReason: null });
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
    const cap = BUSINESS_QUERY_CAPABILITIES[query];
    // SUPPORTED only when the required approved-approval + named-human facts were
    // actually observed; otherwise the spine lacks them → INSUFFICIENT.
    const readiness: BusinessQueryReadiness = sawApprovedApproval ? "SUPPORTED" : "INSUFFICIENT_GRAPH_DATA";
    const missingFacts = sawApprovedApproval ? [] : [...cap.missingFacts];
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
