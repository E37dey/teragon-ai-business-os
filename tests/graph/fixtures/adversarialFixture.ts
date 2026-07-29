// TERAGON Business Graph — ADVERSARIAL security fixture (Phase 3.1).
// ---------------------------------------------------------------------------
// WHAT THIS FIXTURE PROVES
// ---------------------------------------------------------------------------
// This is the *mixed-organization* fixture: the seed's customers carry their own
// concrete organization (`org-2` / `org-3`) while every child record inherits a
// single synthetic test-context org (`org-teragon`, via `allowOrgInheritance`).
// That deliberate mismatch turns every customer-targeting relationship into a
// cross-organization reference the derivation MUST refuse.
//
// It is an ADVERSARIAL fixture — it asserts the security contract holds under a
// hostile, org-mixed input:
//   • every cross-organization relation is REJECTED (CROSS_ORGANIZATION issue);
//   • NO forbidden cross-org edge is ever emitted;
//   • a rejected edge never aborts its node or the snapshot (safe continuation);
//   • the exact issue counts are DETERMINISTIC across runs.
//
// The expected counts below are the measured, deterministic outcome of deriving
// this seed map with `ADVERSARIAL_CONTEXT`. They are asserted (not merely
// documented) by tests/graph/adversarialFixture.test.ts.
import type { CanonicalRecord, GraphDerivationContext } from "@/graph";
import {
  CUSTOMERS,
  CUSTOMER_PRINTERS,
  COURSES,
  ENROLLMENTS,
  LEADS,
  OPPORTUNITIES,
  PRINTER_MODELS,
  QUOTATIONS,
  SERVICE_TICKETS,
  REPAIR_ACTIONS,
  TASKS,
  KNOWLEDGE_NOTES,
  MEMORY_RECORDS,
  AI_RECOMMENDATIONS,
  APPROVALS,
  STUDENTS,
  USERS,
  AGENTS,
} from "@/repositories/seed/seedData";

/** The single synthetic test-context organization the child records inherit. */
export const ADVERSARIAL_ORG = "org-teragon";

/**
 * The derivation context for the adversarial fixture. `allowOrgInheritance` is
 * ON — that is exactly what lets the org-less child records adopt the test org
 * while the seed customers keep their own `org-2`/`org-3`, manufacturing the
 * cross-organization mismatch this fixture exists to reject.
 */
export function buildAdversarialContext(
  over: Partial<GraphDerivationContext> = {},
): GraphDerivationContext {
  return {
    organizationId: ADVERSARIAL_ORG,
    registryVersion: "core-v1",
    sourceSnapshotVersion: "seed-2026-07-22",
    allowOrgInheritance: true,
    ...over,
  };
}

/** Alias kept for readability at call sites that never override the context. */
export const ADVERSARIAL_CONTEXT: GraphDerivationContext = buildAdversarialContext();

/**
 * Build the seed → records-by-collection map (collection key = registry
 * repository). Returns a fresh object each call so a test may derive twice from
 * independent inputs and assert byte-identical output.
 */
export function buildAdversarialRecords(): Partial<Record<string, CanonicalRecord[]>> {
  return {
    customers: CUSTOMERS as unknown as CanonicalRecord[],
    leads: LEADS as unknown as CanonicalRecord[],
    opportunities: OPPORTUNITIES as unknown as CanonicalRecord[],
    quotations: QUOTATIONS as unknown as CanonicalRecord[],
    customerPrinters: CUSTOMER_PRINTERS as unknown as CanonicalRecord[],
    printerModels: PRINTER_MODELS as unknown as CanonicalRecord[],
    serviceTickets: SERVICE_TICKETS as unknown as CanonicalRecord[],
    repairActions: REPAIR_ACTIONS as unknown as CanonicalRecord[],
    knowledgeArticles: KNOWLEDGE_NOTES as unknown as CanonicalRecord[],
    aiRecommendations: AI_RECOMMENDATIONS as unknown as CanonicalRecord[],
    approvals: APPROVALS as unknown as CanonicalRecord[],
    tasks: TASKS as unknown as CanonicalRecord[],
    courses: COURSES as unknown as CanonicalRecord[],
    enrollments: ENROLLMENTS as unknown as CanonicalRecord[],
    students: STUDENTS as unknown as CanonicalRecord[],
    users: USERS as unknown as CanonicalRecord[],
    agents: AGENTS as unknown as CanonicalRecord[],
    memoryRecords: MEMORY_RECORDS as unknown as CanonicalRecord[],
  };
}

/**
 * The measured, DETERMINISTIC issue-severity counts for this fixture (asserted by
 * the accompanying test). The 14 error issues are all CROSS_ORGANIZATION — the
 * expected, honest refusal of the mixed-org customer edges.
 */
export const ADVERSARIAL_EXPECTED = {
  errorIssues: 14,
  warningIssues: 21,
  infoIssues: 169,
  crossOrgErrors: 14,
  unmappableRecords: 0,
  duplicateEdges: 0,
  orphanReferences: 0,
} as const;
