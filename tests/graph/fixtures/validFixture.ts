// TERAGON Business Graph — VALID canonical fixture (Phase 3.1).
// ---------------------------------------------------------------------------
// WHAT THIS FIXTURE PROVES
// ---------------------------------------------------------------------------
// A hand-built, fully-deterministic set of canonical records for a SINGLE
// organization that derives a CLEAN graph — the positive counterpart to the
// adversarial (mixed-org) fixture. It proves the derivation produces authoritative
// nodes + edges with zero defects when the input is well-formed:
//   • every record has a valid organizationId, or inherits the SAME org from the
//     registry-approved context (allowOrgInheritance) — parent + child agree;
//   • every referenced target EXISTS in the fixture (no dangling FK / no missing
//     target), and every reference is by real id (no ambiguous name matching);
//   • NO cross-organization edge is attempted;
//   • all 15 Core-V1 entities are represented as nodes, wired by their expected
//     authoritative relationships (follow-up, printer ownership, recurring
//     service, recommendation→approval→task, course/enrollment, approved
//     knowledge/memory evidence, memory lineage).
//
// Deriving with VALID_CONTEXT yields EXACTLY: 0 error-severity issues,
// 0 unmappableRecords, 0 orphanReferences, 0 duplicateEdges — asserted by
// tests/graph/validFixture.test.ts. Every value is a literal (no Date/random) so
// deriving twice is byte-identical.
import type { CanonicalRecord, GraphDerivationContext, GraphEntityType } from "@/graph";

/** The single organization every record in this fixture belongs to. */
export const VALID_ORG = "org-canonical";

const CREATED = "2026-07-01T09:00:00.000Z";
const UPDATED = "2026-07-02T09:00:00.000Z";
const EFFECTIVE = "2026-07-01T00:00:00.000Z";

/**
 * The derivation context for the valid fixture. `allowOrgInheritance` is ON so
 * the org-scoped-by-inheritance child records (those whose registry entry has no
 * own `organizationField`) legitimately adopt VALID_ORG — the registry-approved
 * inheritance path. Records that DO carry their own org already use VALID_ORG, so
 * parent and child always agree and no cross-org mismatch can arise.
 */
export function buildValidContext(
  over: Partial<GraphDerivationContext> = {},
): GraphDerivationContext {
  return {
    organizationId: VALID_ORG,
    registryVersion: "core-v1",
    sourceSnapshotVersion: "valid-canonical-2026-07-01",
    allowOrgInheritance: true,
    ...over,
  };
}

export const VALID_CONTEXT: GraphDerivationContext = buildValidContext();

/**
 * Build the canonical records-by-collection map. Returns a FRESH deep-literal set
 * on every call so a determinism test can derive twice from independent inputs
 * and assert byte-identical output.
 */
export function buildValidRecords(): Partial<Record<string, CanonicalRecord[]>> {
  return {
    // identity target for ASSIGNED_TO edges (lead/task/course → user).
    users: [
      { id: "u-1", name: "מהנדס שירות", status: "פעיל", createdAt: CREATED, updatedAt: UPDATED },
    ],
    // CRM spine ------------------------------------------------------------
    // The customer is org-scoped-by-inheritance (registry-approved: customer is
    // graph-eligible + allowOrgInheritance is on), so it adopts VALID_ORG — the
    // same org its explicit-org children (memoryRecords) carry. (An org→customer
    // OWNS edge is intentionally NOT modeled: the current Phase-3 collectRefs
    // resolves that source-pointing FK under the customer repository, so it is a
    // capability the pure derivation does not yet emit — see the header note.)
    customers: [
      {
        id: "cu-1",
        name: "לקוח קנוני",
        status: "פעיל",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    leads: [
      {
        id: "l-1",
        ownerId: "u-1",
        name: "ליד קנוני",
        status: "חדש",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    opportunities: [
      {
        id: "op-1",
        leadId: "l-1",
        customerId: "cu-1",
        stage: "כשירות",
        name: "הזדמנות קנונית",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    quotations: [
      {
        id: "q-1",
        customerId: "cu-1",
        status: "אושרה",
        version: 1,
        lines: [{ productId: "prod-1", quantity: 1 }],
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    products: [
      { id: "prod-1", name: "מדפסת FDM", active: true, createdAt: CREATED, updatedAt: UPDATED },
    ],
    // printers / service spine --------------------------------------------
    printerModels: [
      { id: "pm-1", name: "Teragon X1", createdAt: CREATED, updatedAt: UPDATED },
    ],
    customerPrinters: [
      {
        id: "cp-1",
        customerId: "cu-1",
        printerModelId: "pm-1",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    serviceTickets: [
      {
        id: "st-1",
        customerId: "cu-1",
        status: "פתוח",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    // knowledge evidence ---------------------------------------------------
    knowledgeArticles: [
      {
        id: "ka-1",
        title: "מאמר ידע מאושר",
        approval: { state: "מאושר" },
        effectiveDate: EFFECTIVE,
        currentVersion: 1,
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    // AI orchestration: recommendation → approval + agent + evidence -------
    agents: [
      {
        id: "ag-1",
        name: "סוכן המלצות",
        status: "פעיל",
        promptVersion: 1,
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    approvals: [
      { id: "ap-1", status: "אושר", createdAt: CREATED, updatedAt: UPDATED },
    ],
    aiRecommendations: [
      {
        id: "rec-1",
        agentId: "ag-1",
        approvalId: "ap-1",
        evidenceIds: ["ka-1"],
        approvalRequired: false,
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    tasks: [
      {
        id: "t-1",
        ownerId: "u-1",
        relatedRef: "customer:cu-1",
        title: "משימת מעקב",
        status: "פתוח",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    agentRuns: [
      {
        id: "run-1",
        status: "הושלם",
        taskIds: ["t-1"],
        recommendationIds: ["rec-1"],
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    // learning spine -------------------------------------------------------
    courses: [
      {
        id: "co-1",
        instructorId: "u-1",
        title: "קורס הדפסה תלת-ממד",
        status: "פעיל",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    students: [
      { id: "s-1", name: "תלמיד קנוני", status: "פעיל", createdAt: CREATED, updatedAt: UPDATED },
    ],
    enrollments: [
      {
        id: "en-1",
        courseId: "co-1",
        studentId: "s-1",
        paymentStatus: "שולם",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
    // memory evidence + lineage -------------------------------------------
    memoryRecords: [
      {
        // authoritative approved memory: MENTIONED_IN cu-1 (approved evidence),
        // and the SUPERSEDES target for mem-1.
        id: "mem-0",
        memoryLayer: "customer",
        organizationId: VALID_ORG,
        approvalState: "מאושר",
        sensitivity: "פנימי",
        title: "זיכרון מאושר",
        currentVersion: 1,
        entityLinks: [{ collection: "customers", entityId: "cu-1" }],
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
      {
        // lineage record: SUPERSEDES mem-0 (memory version lineage).
        id: "mem-1",
        memoryLayer: "customer",
        organizationId: VALID_ORG,
        approvalState: "מאושר",
        sensitivity: "פנימי",
        title: "זיכרון מאושר גרסה 2",
        currentVersion: 2,
        supersedesId: "mem-0",
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
    ],
  };
}

/** The 15 Core-V1 entity types that MUST each appear as a node. */
export const VALID_CORE_V1_TYPES: readonly GraphEntityType[] = [
  "customer",
  "lead",
  "opportunity",
  "quotation",
  "customerPrinter",
  "printerModel",
  "serviceTicket",
  "knowledgeArticle",
  "aiRecommendation",
  "approval",
  "task",
  "agentRun",
  "course",
  "enrollment",
  "memoryRecord",
] as const;

/**
 * The authoritative relationships this fixture is built to demonstrate, keyed by
 * relationshipType with the (source→target) entity types. Asserted present by the
 * accompanying test. These trace the reasoning paths in the derivation brief.
 */
export const VALID_EXPECTED_RELATIONSHIPS: ReadonlyArray<{
  relationshipType: string;
  sourceType: GraphEntityType;
  targetType: GraphEntityType;
}> = [
  { relationshipType: "OWNS", sourceType: "customerPrinter", targetType: "customer" },
  { relationshipType: "USES", sourceType: "customerPrinter", targetType: "printerModel" },
  { relationshipType: "ASSIGNED_TO", sourceType: "lead", targetType: "user" },
  { relationshipType: "DERIVED_FROM", sourceType: "opportunity", targetType: "lead" },
  { relationshipType: "RELATED_TO", sourceType: "opportunity", targetType: "customer" },
  { relationshipType: "QUOTED_FOR", sourceType: "quotation", targetType: "customer" },
  { relationshipType: "USES", sourceType: "quotation", targetType: "product" },
  { relationshipType: "SERVICED", sourceType: "serviceTicket", targetType: "customer" },
  { relationshipType: "RECOMMENDED", sourceType: "aiRecommendation", targetType: "agent" },
  { relationshipType: "APPROVED_BY", sourceType: "aiRecommendation", targetType: "approval" },
  { relationshipType: "SUPPORTED_BY", sourceType: "aiRecommendation", targetType: "knowledgeArticle" },
  { relationshipType: "ASSIGNED_TO", sourceType: "task", targetType: "user" },
  { relationshipType: "RELATED_TO", sourceType: "task", targetType: "customer" },
  { relationshipType: "GENERATED_TASK", sourceType: "agentRun", targetType: "task" },
  { relationshipType: "CREATED", sourceType: "agentRun", targetType: "aiRecommendation" },
  { relationshipType: "ASSIGNED_TO", sourceType: "course", targetType: "user" },
  { relationshipType: "ENROLLED_IN", sourceType: "enrollment", targetType: "course" },
  { relationshipType: "RELATED_TO", sourceType: "enrollment", targetType: "student" },
  { relationshipType: "MENTIONED_IN", sourceType: "memoryRecord", targetType: "customer" },
  { relationshipType: "SUPERSEDES", sourceType: "memoryRecord", targetType: "memoryRecord" },
];
