// TERAGON Business Graph — Phase 7 BUSINESS QUERY test helpers.
// Builds the query service over (a) the REAL derived valid fixture, (b) an
// AUGMENTED real fixture that adds records to exercise positive CRM/learning
// cases through genuine derivation, and (c) small SYNTHETIC snapshots for the
// directional/registered-relationship cases the 15-entity spine cannot express.
import {
  BusinessGraphQueryService,
  BusinessGraphTraversalService,
  rebuildOrganizationGraph,
  type BusinessGraphNode,
  type BusinessGraphEdge,
  type CanonicalRecord,
  type GraphIndexSnapshot,
  type GraphQueryContext,
} from "@/graph";
import { VALID_CONTEXT, VALID_ORG, buildValidRecords } from "../fixtures/validFixture";
import { freshStore, makeClock } from "../store/helpers";
import {
  FIXED_EXEC,
  ctxFor,
  healthyStore,
  nid,
  storeWithHealth,
  synthEdge,
  synthNode,
  synthSnapshot,
  type StubStore,
} from "../traversal/helpers";

export { VALID_ORG, ctxFor, nid, synthEdge, synthNode, synthSnapshot };

/** A fixed ISO clock — deterministic asOf resolution in tests. */
export const NOW_ISO = "2026-07-30T00:00:00.000Z";
export const FIXED_NOW_ISO = (): string => NOW_ISO;

const OLD = "2026-05-01T09:00:00.000Z";
const C = "2026-07-01T09:00:00.000Z";
const U = "2026-07-02T09:00:00.000Z";

/** Derive + activate a record set through the REAL store; return the ACTIVE snapshot. */
export async function deriveSnapshot(
  records: Partial<Record<string, CanonicalRecord[]>>,
): Promise<GraphIndexSnapshot> {
  const store = freshStore();
  await rebuildOrganizationGraph(records, VALID_CONTEXT, store, { now: makeClock() });
  const snap = await store.getActiveSnapshot(VALID_CONTEXT.organizationId);
  if (snap === null) throw new Error("fixture failed to activate");
  return snap;
}

/** The plain valid fixture snapshot (15-entity spine, one of each). */
export function deriveValidSnapshot(): Promise<GraphIndexSnapshot> {
  return deriveSnapshot(buildValidRecords());
}

/**
 * An AUGMENTED valid fixture that adds — through real derivation — records to
 * exercise positive cases: an unanswered (sent+aged) quotation, a COMPLETED
 * follow-up task (must be excluded), a second customer whose only "follow-up"
 * task is a NAME reference (must not resolve to an edge), and a delayed
 * enrollment carrying progress + due-date facts.
 */
export function buildAugmentedRecords(): Partial<Record<string, CanonicalRecord[]>> {
  const base = buildValidRecords();
  return {
    ...base,
    customers: [
      ...(base.customers ?? []),
      { id: "cu-2", name: "לקוח שני", organizationId: VALID_ORG, status: "פעיל", createdAt: C, updatedAt: U },
    ],
    quotations: [
      ...(base.quotations ?? []),
      { id: "q-2", customerId: "cu-1", status: "נשלחה", version: 1, lines: [{ productId: "prod-1", quantity: 1 }], createdAt: OLD, updatedAt: OLD },
    ],
    tasks: [
      ...(base.tasks ?? []),
      // COMPLETED follow-up — must be EXCLUDED from cu-1's follow-up findings.
      { id: "t-2", ownerId: "u-1", relatedRef: "customer:cu-1", title: "מעקב שהושלם", status: "הושלמה", createdAt: C, updatedAt: U },
      // NAME-based reference — must NOT resolve to an authoritative RELATED_TO edge.
      { id: "t-3", ownerId: "u-1", relatedRef: "customer:לקוח שני", title: "מעקב לפי שם", status: "פתוח", createdAt: C, updatedAt: U },
    ],
    enrollments: [
      ...(base.enrollments ?? []),
      // delayed: progress 40% + due-date in the past (BEFORE asOf), carried on the envelope.
      { id: "en-2", courseId: "co-1", studentId: "s-1", paymentStatus: "שולם", progress: 40, dueDate: "2026-06-01T00:00:00.000Z", createdAt: C, updatedAt: U },
    ],
  };
}

export function deriveAugmentedSnapshot(): Promise<GraphIndexSnapshot> {
  return deriveSnapshot(buildAugmentedRecords());
}

// ---------------------------------------------------------------------------
// service construction
// ---------------------------------------------------------------------------

export function queryService(traversal: BusinessGraphTraversalService, exec = FIXED_EXEC): BusinessGraphQueryService {
  return new BusinessGraphQueryService(traversal, { now: FIXED_NOW_ISO, executionIdProvider: exec });
}

/** A fully-deterministic query service over a HEALTHY store for `snap`. */
export function detQueryService(snap: GraphIndexSnapshot, exec = FIXED_EXEC): BusinessGraphQueryService {
  const traversal = new BusinessGraphTraversalService(healthyStore(snap), {
    now: () => 0,
    executionIdProvider: exec,
  });
  return queryService(traversal, exec);
}

/** A query service whose store is in an arbitrary health state (stale/corrupt). */
export function queryServiceWithHealth(
  snap: GraphIndexSnapshot,
  state: Parameters<typeof storeWithHealth>[1],
  exec = FIXED_EXEC,
): BusinessGraphQueryService {
  const store: StubStore = storeWithHealth(snap, state);
  const traversal = new BusinessGraphTraversalService(store, { now: () => 0, executionIdProvider: exec });
  return queryService(traversal, exec);
}

// ---------------------------------------------------------------------------
// synthetic snapshots for the directional / registered-relationship cases
// ---------------------------------------------------------------------------

/** printerModel ← USES ← {cp1,cp2}; cp1 → RELATED_TO → {st1,st2}; cp2 → st3. */
export function recurringServiceSnapshot(): {
  snap: GraphIndexSnapshot;
  pm: BusinessGraphNode;
  tickets: BusinessGraphNode[];
} {
  const pm = synthNode("printerModel", "pm-r");
  const cp1 = synthNode("customerPrinter", "cp-r1");
  const cp2 = synthNode("customerPrinter", "cp-r2");
  const st1 = synthNode("serviceTicket", "st-r1", { status: "בבדיקה" });
  const st2 = synthNode("serviceTicket", "st-r2", { status: "בבדיקה" });
  const st3 = synthNode("serviceTicket", "st-r3", { status: "בבדיקה" });
  const edges: BusinessGraphEdge[] = [
    synthEdge("USES", cp1, pm),
    synthEdge("USES", cp2, pm),
    synthEdge("RELATED_TO", cp1, st1),
    synthEdge("RELATED_TO", cp1, st2),
    synthEdge("RELATED_TO", cp2, st3),
  ];
  const snap = synthSnapshot([pm, cp1, cp2, st1, st2, st3], edges);
  return { snap, pm, tickets: [st1, st2, st3] };
}

/** printerModel → RELATED_TO → cp → OWNS → cu → RELATED_TO → st → GENERATED_TASK → task. */
export function printerImpactSnapshot(): { snap: GraphIndexSnapshot; pm: BusinessGraphNode } {
  const pm = synthNode("printerModel", "pm-i");
  const cp = synthNode("customerPrinter", "cp-i");
  const cu = synthNode("customer", "cu-i");
  const st = synthNode("serviceTicket", "st-i", { status: "בבדיקה" });
  const task = synthNode("task", "t-i", { status: "פתוחה" });
  const edges: BusinessGraphEdge[] = [
    synthEdge("RELATED_TO", pm, cp),
    synthEdge("OWNS", cp, cu),
    synthEdge("RELATED_TO", cu, st),
    synthEdge("GENERATED_TASK", st, task),
  ];
  return { snap: synthSnapshot([pm, cp, cu, st, task], edges), pm };
}

/** recA → CONTRADICTS → recB (registered); recC has only a RELATED_TO (no conflict). */
export function contradictSnapshot(): {
  snap: GraphIndexSnapshot;
  recA: BusinessGraphNode;
  recB: BusinessGraphNode;
  recC: BusinessGraphNode;
} {
  const recA = synthNode("aiRecommendation", "rec-a");
  const recB = synthNode("aiRecommendation", "rec-b");
  const recC = synthNode("aiRecommendation", "rec-c");
  const other = synthNode("customer", "cu-x");
  const edges: BusinessGraphEdge[] = [
    synthEdge("CONTRADICTS", recA, recB, { direction: "bidirectional" }),
    synthEdge("RELATED_TO", recC, other),
  ];
  return { snap: synthSnapshot([recA, recB, recC, other], edges), recA, recB, recC };
}

/**
 * recA → APPROVED_BY(approved) → approval(named-human owner) and recA →
 * GENERATED_TASK → task. recB → APPROVED_BY(NOT approved) → approval2 and
 * recB → GENERATED_TASK → task2 (must NOT qualify — unapproved).
 */
export function approvedTaskSnapshot(): {
  snap: GraphIndexSnapshot;
  recApproved: BusinessGraphNode;
  recUnapproved: BusinessGraphNode;
  taskApproved: BusinessGraphNode;
} {
  const humanOwner = { organizationId: VALID_ORG, entityType: "user" as const, entityId: "u-approver" };
  const recA = synthNode("aiRecommendation", "rec-ap");
  const recB = synthNode("aiRecommendation", "rec-un");
  const approval = synthNode("approval", "ap-ok", { ownerRef: humanOwner, status: "אושר" });
  const approval2 = synthNode("approval", "ap-no", { ownerRef: humanOwner, status: "ממתין" });
  const taskA = synthNode("task", "t-ap", { status: "פתוחה" });
  const taskB = synthNode("task", "t-un", { status: "פתוחה" });
  const edges: BusinessGraphEdge[] = [
    synthEdge("APPROVED_BY", recA, approval, { approvalState: "approved" }),
    synthEdge("GENERATED_TASK", recA, taskA),
    synthEdge("APPROVED_BY", recB, approval2, { approvalState: "none" }),
    synthEdge("GENERATED_TASK", recB, taskB),
  ];
  const snap = synthSnapshot([recA, recB, approval, approval2, taskA, taskB], edges);
  return { snap, recApproved: recA, recUnapproved: recB, taskApproved: taskA };
}

// ---------------------------------------------------------------------------
// context helper re-export with a query-friendly default (highest clearance)
// ---------------------------------------------------------------------------

export function qctx(over: Partial<GraphQueryContext> = {}): GraphQueryContext {
  return ctxFor(over);
}
