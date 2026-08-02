// TERAGON Business Graph — entity registry (Phase 2).
// A DECLARATIVE, CLOSED description of how each canonical entity maps to a graph
// node: its repository, id/org fields, and small strategy descriptors for
// sensitivity/authoritativeness/lifecycle. These are descriptors, NOT executable
// reads of live records — this is a contract, not an index. The Record type is
// exhaustive over GraphEntityType (every type MUST have an entry; a missing key
// is a compile error). Duplicate/legacy representations are disambiguated by an
// explicit `discriminator` — duplicates are never normalized away.
import { z } from "zod";
import {
  GRAPH_ENTITY_TYPES,
  graphEntityTypeSchema,
  type GraphEntityType,
} from "../contracts/identity";
import { graphSensitivitySchema, type GraphSensitivity } from "../contracts/node";

// ---------------------------------------------------------------------------
// strategy descriptors (declarative — resolved by the future index, not here)
// ---------------------------------------------------------------------------

export type SensitivityStrategy =
  | { kind: "constant"; value: GraphSensitivity }
  | { kind: "field"; field: string }
  | { kind: "predicate"; name: string };

export type AuthoritativeStrategy =
  | { kind: "constant"; value: boolean }
  | { kind: "field"; field: string }
  | { kind: "predicate"; name: string };

export type PayloadExposure = "envelope-safe" | "protected";

export interface EntityRegistryEntry {
  entityType: GraphEntityType;
  /** collection key, or null for a derived/synthesized entity */
  repository: string | null;
  identifierField: string;
  /** field carrying the org, or null when org is inherited from a parent FK */
  organizationField: string | null;
  sensitivityStrategy: SensitivityStrategy;
  lifecycleField: string | null;
  versionField: string | null;
  authoritativeStrategy: AuthoritativeStrategy;
  archiveField: string | null;
  supersedeField: string | null;
  graphEligible: boolean;
  payloadExposure: PayloadExposure;
  /** how a legacy/canonical duplicate is told apart (never normalized away) */
  discriminator?: string;
}

// ---------------------------------------------------------------------------
// zod schema for a single entry
// ---------------------------------------------------------------------------

const sensitivityStrategySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("constant"), value: graphSensitivitySchema }),
  z.object({ kind: z.literal("field"), field: z.string().min(1) }),
  z.object({ kind: z.literal("predicate"), name: z.string().min(1) }),
]);

const authoritativeStrategySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("constant"), value: z.boolean() }),
  z.object({ kind: z.literal("field"), field: z.string().min(1) }),
  z.object({ kind: z.literal("predicate"), name: z.string().min(1) }),
]);

export const entityRegistryEntrySchema = z.object({
  entityType: graphEntityTypeSchema,
  repository: z.string().min(1).nullable(),
  identifierField: z.string().min(1),
  organizationField: z.string().min(1).nullable(),
  sensitivityStrategy: sensitivityStrategySchema,
  lifecycleField: z.string().min(1).nullable(),
  versionField: z.string().min(1).nullable(),
  authoritativeStrategy: authoritativeStrategySchema,
  archiveField: z.string().min(1).nullable(),
  supersedeField: z.string().min(1).nullable(),
  graphEligible: z.boolean(),
  payloadExposure: z.enum(["envelope-safe", "protected"]),
  discriminator: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// helpers to keep the table terse
// ---------------------------------------------------------------------------

const INTERNAL: SensitivityStrategy = { kind: "constant", value: "פנימי" };
const PUBLIC: SensitivityStrategy = { kind: "constant", value: "ציבורי" };
const AUTH_TRUE: AuthoritativeStrategy = { kind: "constant", value: true };
const AUTH_FALSE: AuthoritativeStrategy = { kind: "constant", value: false };

// ---------------------------------------------------------------------------
// the closed, exhaustive registry
// ---------------------------------------------------------------------------

export const ENTITY_REGISTRY: Record<GraphEntityType, EntityRegistryEntry> = {
  organization: {
    entityType: "organization",
    repository: "organizations",
    identifierField: "id",
    organizationField: "id",
    sensitivityStrategy: PUBLIC,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  user: {
    entityType: "user",
    repository: "users",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    // identity domain — no agent reads it, but it IS a node target of edges.
    graphEligible: true,
    payloadExposure: "protected",
  },
  role: {
    entityType: "role",
    repository: "roles",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
    // legacy Role (role-*) vs canonical RoleDefinition (crole-*) share the
    // collection — pick the canonical record; never merge the two.
    discriminator: 'recordKind === "canonical-role" (else legacy role-*)',
  },
  customer: {
    entityType: "customer",
    repository: "customers",
    identifierField: "id",
    organizationField: "organizationId",
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  contact: {
    entityType: "contact",
    repository: "contacts",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  lead: {
    entityType: "lead",
    repository: "leads",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  opportunity: {
    entityType: "opportunity",
    repository: "opportunities",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "stage",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  quotation: {
    entityType: "quotation",
    repository: "quotations",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: "version",
    // authoritative only when status === "אושרה" (approved) — a predicate.
    authoritativeStrategy: { kind: "predicate", name: "quotationApproved" },
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  product: {
    entityType: "product",
    repository: "products",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: PUBLIC,
    lifecycleField: "active",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  printerModel: {
    entityType: "printerModel",
    repository: "printerModels",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: PUBLIC,
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  customerPrinter: {
    entityType: "customerPrinter",
    repository: "customerPrinters",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  serviceTicket: {
    entityType: "serviceTicket",
    repository: "serviceTickets",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  repairAction: {
    entityType: "repairAction",
    repository: "repairActions",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  course: {
    entityType: "course",
    repository: "courses",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: PUBLIC,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  student: {
    entityType: "student",
    repository: "students",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  enrollment: {
    entityType: "enrollment",
    repository: "enrollments",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "paymentStatus",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  task: {
    entityType: "task",
    repository: "tasks",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  document: {
    entityType: "document",
    repository: "documents",
    identifierField: "id",
    organizationField: null,
    // document visibility is a real field; body is protected.
    sensitivityStrategy: { kind: "field", field: "visible" },
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "protected",
  },
  automation: {
    entityType: "automation",
    repository: "automations",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "enabled",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  automationRun: {
    entityType: "automationRun",
    repository: "automationRuns",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "outcome",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  agent: {
    entityType: "agent",
    repository: "agents",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: "promptVersion",
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    // prompt content is protected — checksum/label only.
    payloadExposure: "protected",
  },
  agentRun: {
    entityType: "agentRun",
    repository: "agentRuns",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  agentEvent: {
    entityType: "agentEvent",
    repository: "agentEvents",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "protected",
  },
  aiRecommendation: {
    entityType: "aiRecommendation",
    repository: "aiRecommendations",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: null,
    versionField: null,
    // an AI recommendation is a PROPOSAL — never authoritative until approved.
    authoritativeStrategy: { kind: "predicate", name: "recommendationApproved" },
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "protected",
  },
  approval: {
    entityType: "approval",
    repository: "approvals",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    // a node target, but hard-banned from EVERY agent's read window.
    graphEligible: true,
    payloadExposure: "protected",
  },
  auditEvent: {
    entityType: "auditEvent",
    repository: "auditEvents",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: { kind: "constant", value: "מוגבל" },
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    // raw details may contain secrets — redaction-mandatory; agent-hard-banned.
    graphEligible: true,
    payloadExposure: "protected",
  },
  memoryRecord: {
    entityType: "memoryRecord",
    repository: "memoryRecords",
    identifierField: "id",
    organizationField: "organizationId",
    sensitivityStrategy: { kind: "field", field: "sensitivity" },
    lifecycleField: "approvalState",
    versionField: "currentVersion",
    // approved AND not archived — a predicate (memory/selectors.ts:57).
    authoritativeStrategy: { kind: "predicate", name: "memoryAuthoritative" },
    archiveField: "archivedAt",
    supersedeField: "supersedesId",
    graphEligible: true,
    payloadExposure: "protected",
    // V2 (has memoryLayer) vs legacy mem-* share the collection — pick V2.
    discriminator: '"memoryLayer" in rec (V2, else legacy mem-*)',
  },
  knowledgeArticle: {
    entityType: "knowledgeArticle",
    repository: "knowledgeArticles",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "approval.state",
    versionField: "currentVersion",
    // isAuthoritative(article, now): מאושר AND effective AND not archived/expired.
    authoritativeStrategy: { kind: "predicate", name: "isAuthoritative" },
    archiveField: "archivedAt",
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "protected",
  },
  learningObservation: {
    entityType: "learningObservation",
    repository: "learningObservations",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "origin",
    versionField: null,
    authoritativeStrategy: AUTH_FALSE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  learningProposal: {
    entityType: "learningProposal",
    repository: "learningProposals",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "approvalState",
    versionField: null,
    authoritativeStrategy: AUTH_FALSE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  learningRule: {
    entityType: "learningRule",
    repository: "learningRules",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: "version",
    // active AND named-approval AND not rolled back — a predicate.
    authoritativeStrategy: { kind: "predicate", name: "learningRuleActive" },
    archiveField: null,
    supersedeField: "previousVersionId",
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  metricDefinition: {
    entityType: "metricDefinition",
    repository: "metricDefinitions",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "level",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  metricObservation: {
    entityType: "metricObservation",
    repository: "metricObservations",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: null,
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  governancePolicy: {
    entityType: "governancePolicy",
    repository: "governancePolicies",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: "currentVersion",
    // "פעילה" with named approval + effectiveAt — a predicate.
    authoritativeStrategy: { kind: "predicate", name: "policyActive" },
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
  governanceRisk: {
    entityType: "governanceRisk",
    repository: "governanceRisks",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
    // canonical GovernanceRisk (separate collection) vs legacy Risk (risks).
    discriminator: 'collection "governanceRisks" (else legacy "risks")',
  },
  governanceIncident: {
    entityType: "governanceIncident",
    repository: "governanceIncidents",
    identifierField: "id",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "status",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
    // governance incident vs HealthIncident share the collection.
    discriminator: 'source !== "system-health" (else HealthIncident)',
  },
  submissionDeliverable: {
    entityType: "submissionDeliverable",
    repository: "submissionDeliverables",
    identifierField: "key",
    organizationField: null,
    sensitivityStrategy: INTERNAL,
    lifecycleField: "state",
    versionField: null,
    authoritativeStrategy: AUTH_TRUE,
    archiveField: null,
    supersedeField: null,
    graphEligible: true,
    payloadExposure: "envelope-safe",
  },
};

// ---------------------------------------------------------------------------
// compile-time + runtime exhaustiveness
// ---------------------------------------------------------------------------

/** Every GraphEntityType has exactly one registry entry keyed by itself. */
export function assertEntityRegistryExhaustive(): void {
  for (const t of GRAPH_ENTITY_TYPES) {
    const entry = ENTITY_REGISTRY[t];
    if (!entry || entry.entityType !== t) {
      throw new Error(`ENTITY_REGISTRY missing or mis-keyed entry for "${t}"`);
    }
  }
}

export const ENTITY_REGISTRY_ENTRIES: readonly EntityRegistryEntry[] =
  GRAPH_ENTITY_TYPES.map((t) => ENTITY_REGISTRY[t]);
