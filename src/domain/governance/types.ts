// TERAGON AI BUSINESS OS — AI governance domain (Wave 8, W8-B).
// Records for the governance control center: policies with APPEND-ONLY
// immutable versions, a risk register with a full lifecycle, incident
// management, periodic reviews, and a prompt registry that stores ONLY a
// sha-256 checksum of the protected prompt text — never the text itself.
//
// HONESTY RULES (enforced in schema + stores, tested in tests/governance):
// 1. A policy is NEVER auto-approved — bootstrap creates drafts only, and the
//    only path to "פעילה" runs through the ONE canonical ApprovalEngine.
// 2. Policy versions are immutable BY THE STORE (update/remove throw), exactly
//    like memoryVersions.
// 3. The agent permission matrix is a DERIVED read-only view over the frozen
//    AGENT_DEFINITIONS — it is never persisted and never duplicated by hand.
// 4. Provider/model configuration is honest: מקומי פעיל, מרוחק מושבת.
// 5. Audit exports are redacted (redact patterns of W5-B) and truncated —
//    no secrets, no full payloads.
import { z } from "zod";
import type { ISODate } from "@/domain/types";

// ---------------------------------------------------------------------------
// shared zod building blocks (mirrors src/domain/learning conventions)
// ---------------------------------------------------------------------------

const isoDate = z.string().min(1);

const baseEntity = {
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
};

// ---------------------------------------------------------------------------
// GovernancePolicy — the canonical policy record (content lives in versions)
// ---------------------------------------------------------------------------

export const POLICY_STATUSES = ["טיוטה", "ממתין לבדיקה", "פעילה", "בארכיון"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export interface GovernancePolicy {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** stable canonical key, e.g. "correct-use" */
  key: string;
  titleHe: string;
  summaryHe: string;
  /** NAMED owner — a policy without an owner is a rail finding */
  ownerId: string;
  ownerName: string;
  /** points at the newest immutable version in governancePolicyVersions */
  currentVersion: number;
  status: PolicyStatus;
  /** canonical Approval record id once submitted for review; null while טיוטה */
  approvalId: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  /** null until approved — a draft has NO effective date (honesty) */
  effectiveAt: ISODate | null;
  nextReviewAt: ISODate | null;
  affectedAgentIds: string[];
  /** approval-required actions / operations this policy governs */
  affectedOperations: string[];
}

export const governancePolicySchema = z
  .object({
    ...baseEntity,
    key: z.string().min(1),
    titleHe: z.string().min(1),
    summaryHe: z.string().min(1),
    ownerId: z.string().min(1),
    ownerName: z.string().min(1),
    currentVersion: z.number().int().min(1),
    status: z.enum(POLICY_STATUSES),
    approvalId: z.string().min(1).nullable(),
    approvedById: z.string().min(1).nullable(),
    approvedByName: z.string().min(1).nullable(),
    effectiveAt: isoDate.nullable(),
    nextReviewAt: isoDate.nullable(),
    affectedAgentIds: z.array(z.string().min(1)),
    affectedOperations: z.array(z.string().min(1)),
  })
  .superRefine((val, ctx) => {
    if (val.status !== "פעילה" && val.effectiveAt !== null) {
      ctx.addIssue({
        code: "custom",
        message: "למדיניות שאינה פעילה אין תאריך תחולה — תחולה קיימת רק לאחר אישור",
        path: ["effectiveAt"],
      });
    }
    if (val.status === "פעילה" && (!val.approvedById || !val.approvedByName || !val.effectiveAt)) {
      ctx.addIssue({
        code: "custom",
        message: "מדיניות פעילה מחייבת מאשר בשם ותאריך תחולה — אין אישור אנונימי/אוטומטי",
        path: ["approvedById"],
      });
    }
  }) satisfies z.ZodType<GovernancePolicy>;

// ---------------------------------------------------------------------------
// GovernancePolicyVersion — APPEND-ONLY immutable version snapshot
// ---------------------------------------------------------------------------

export interface PolicySection {
  headingHe: string;
  bulletsHe: string[];
}

export const policySectionSchema = z.strictObject({
  headingHe: z.string().min(1),
  bulletsHe: z.array(z.string().min(1)).min(1),
}) satisfies z.ZodType<PolicySection>;

export interface GovernancePolicyVersion {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  policyId: string;
  version: number;
  titleHe: string;
  sections: PolicySection[];
  changeReasonHe: string;
  createdById: string;
  /** sha-256 of the canonical JSON of the version content — tamper evidence */
  checksumSha256: string;
}

export const governancePolicyVersionSchema = z.object({
  ...baseEntity,
  policyId: z.string().min(1),
  version: z.number().int().min(1),
  titleHe: z.string().min(1),
  sections: z.array(policySectionSchema).min(1),
  changeReasonHe: z.string().min(1),
  createdById: z.string().min(1),
  checksumSha256: z.string().length(64),
}) satisfies z.ZodType<GovernancePolicyVersion>;

// ---------------------------------------------------------------------------
// GovernanceRisk — the risk register lifecycle
// ---------------------------------------------------------------------------

export const GOVERNANCE_RISK_SEVERITIES = ["נמוכה", "בינונית", "גבוהה", "קריטית"] as const;
export type GovernanceRiskSeverity = (typeof GOVERNANCE_RISK_SEVERITIES)[number];

export const GOVERNANCE_RISK_STATES = [
  "פתוח",
  "בטיפול",
  "התקבל",
  "הופחת",
  "נסגר",
  "נפתח מחדש",
] as const;
export type GovernanceRiskState = (typeof GOVERNANCE_RISK_STATES)[number];

/** The allowed lifecycle transitions — anything else throws. */
export const RISK_TRANSITIONS: Readonly<Record<GovernanceRiskState, readonly GovernanceRiskState[]>> =
  Object.freeze({
    פתוח: ["בטיפול", "התקבל"],
    בטיפול: ["הופחת", "התקבל", "נסגר"],
    התקבל: ["בטיפול", "נסגר"],
    הופחת: ["בטיפול", "נסגר"],
    נסגר: ["נפתח מחדש"],
    "נפתח מחדש": ["בטיפול", "התקבל"],
  });

export interface RiskTransition {
  from: GovernanceRiskState;
  to: GovernanceRiskState;
  at: ISODate;
  byId: string;
  byName: string;
  reasonHe: string;
}

export const riskTransitionSchema = z.strictObject({
  from: z.enum(GOVERNANCE_RISK_STATES),
  to: z.enum(GOVERNANCE_RISK_STATES),
  at: isoDate,
  byId: z.string().min(1),
  byName: z.string().min(1),
  reasonHe: z.string().min(1),
}) satisfies z.ZodType<RiskTransition>;

export interface GovernanceRisk {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** stable canonical key, e.g. "prompt-injection" */
  key: string;
  titleHe: string;
  descriptionHe: string;
  severity: GovernanceRiskSeverity;
  status: GovernanceRiskState;
  /** NAMED owner */
  ownerId: string;
  ownerName: string;
  /** ids of existing Control records ("controls" collection) mitigating this risk */
  controlIds: string[];
  mitigationHe: string | null;
  /** what real record/code surface the risk was identified from */
  sourceRef: string | null;
  history: RiskTransition[];
  reviewDueAt: ISODate | null;
}

export const governanceRiskSchema = z.object({
  ...baseEntity,
  key: z.string().min(1),
  titleHe: z.string().min(1),
  descriptionHe: z.string().min(1),
  severity: z.enum(GOVERNANCE_RISK_SEVERITIES),
  status: z.enum(GOVERNANCE_RISK_STATES),
  ownerId: z.string().min(1),
  ownerName: z.string().min(1),
  controlIds: z.array(z.string().min(1)),
  mitigationHe: z.string().min(1).nullable(),
  sourceRef: z.string().min(1).nullable(),
  history: z.array(riskTransitionSchema),
  reviewDueAt: isoDate.nullable(),
}) satisfies z.ZodType<GovernanceRisk>;

// ---------------------------------------------------------------------------
// GovernanceIncident — incident management flow
// ---------------------------------------------------------------------------

export const INCIDENT_STATUSES = ["חדש", "בטיפול", "מוכל", "נפתר", "בתחקיר", "סגור"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface GovernanceIncident {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  titleHe: string;
  descriptionHe: string;
  severity: GovernanceRiskSeverity;
  status: IncidentStatus;
  reportedById: string;
  reportedByName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  /** REAL AuditEvent ids related to the incident */
  relatedAuditEventIds: string[];
  relatedRiskIds: string[];
  containmentHe: string | null;
  resolutionHe: string | null;
  /** id of the GovernanceReview created in the post-incident review step */
  reviewId: string | null;
  followUpActionsHe: string[];
  openedAt: ISODate;
  containedAt: ISODate | null;
  resolvedAt: ISODate | null;
  closedAt: ISODate | null;
}

export const governanceIncidentSchema = z
  .object({
    ...baseEntity,
    titleHe: z.string().min(1),
    descriptionHe: z.string().min(1),
    severity: z.enum(GOVERNANCE_RISK_SEVERITIES),
    status: z.enum(INCIDENT_STATUSES),
    reportedById: z.string().min(1),
    reportedByName: z.string().min(1),
    assignedToId: z.string().min(1).nullable(),
    assignedToName: z.string().min(1).nullable(),
    relatedAuditEventIds: z.array(z.string().min(1)),
    relatedRiskIds: z.array(z.string().min(1)),
    containmentHe: z.string().min(1).nullable(),
    resolutionHe: z.string().min(1).nullable(),
    reviewId: z.string().min(1).nullable(),
    followUpActionsHe: z.array(z.string().min(1)),
    openedAt: isoDate,
    containedAt: isoDate.nullable(),
    resolvedAt: isoDate.nullable(),
    closedAt: isoDate.nullable(),
  })
  .superRefine((val, ctx) => {
    if ((val.status === "מוכל" || val.status === "נפתר") && !val.containmentHe) {
      ctx.addIssue({
        code: "custom",
        message: "אירוע מוכל/נפתר מחייב תיאור הכלה",
        path: ["containmentHe"],
      });
    }
    if (val.status === "נפתר" && !val.resolutionHe) {
      ctx.addIssue({
        code: "custom",
        message: "אירוע נפתר מחייב תיאור פתרון",
        path: ["resolutionHe"],
      });
    }
    if (val.status === "סגור" && !val.reviewId) {
      ctx.addIssue({
        code: "custom",
        message: "סגירת אירוע מחייבת תחקיר (GovernanceReview) — אין סגירה ללא הפקת לקחים",
        path: ["reviewId"],
      });
    }
  }) satisfies z.ZodType<GovernanceIncident>;

// ---------------------------------------------------------------------------
// GovernanceReview — periodic / post-incident review record
// ---------------------------------------------------------------------------

export const REVIEW_SUBJECT_KINDS = ["policy", "risk", "incident", "permissions"] as const;
export type ReviewSubjectKind = (typeof REVIEW_SUBJECT_KINDS)[number];

export interface GovernanceReview {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  subjectKind: ReviewSubjectKind;
  /** e.g. "governance-incident:gi-1" / "governance-policy:gp-1" */
  subjectRef: string;
  reviewerId: string;
  reviewerName: string;
  summaryHe: string;
  findingsHe: string[];
  followUpsHe: string[];
  reviewedAt: ISODate;
  nextReviewAt: ISODate | null;
}

export const governanceReviewSchema = z.object({
  ...baseEntity,
  subjectKind: z.enum(REVIEW_SUBJECT_KINDS),
  subjectRef: z.string().min(1),
  reviewerId: z.string().min(1),
  reviewerName: z.string().min(1),
  summaryHe: z.string().min(1),
  findingsHe: z.array(z.string().min(1)),
  followUpsHe: z.array(z.string().min(1)),
  reviewedAt: isoDate,
  nextReviewAt: isoDate.nullable(),
}) satisfies z.ZodType<GovernanceReview>;

// ---------------------------------------------------------------------------
// PromptVersionRecord — the prompt registry. checksum ONLY, never the text.
// ---------------------------------------------------------------------------

/** The only sanctioned rendering of protected prompt content. */
export const PROMPT_PROTECTED_LABEL_HE = "תוכן מוגן — checksum בלבד";

export interface PromptVersionRecord {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** agent id, or null for the server-owned system policy prompt */
  agentId: string | null;
  /** operation key, or null for an agent's base role prompt */
  operation: string | null;
  labelHe: string;
  version: string;
  active: boolean;
  ownerId: string;
  ownerName: string;
  /** canonical Approval id; null ⇒ rail finding "prompt version without approval" */
  approvalId: string | null;
  approvedById: string | null;
  /** sha-256 (hex) of the protected prompt fingerprint — the ONLY stored trace */
  checksumSha256: string;
  /** literal false — the protected text is NEVER stored client-side */
  protectedTextStored: false;
}

export const promptVersionRecordSchema = z.object({
  ...baseEntity,
  agentId: z.string().min(1).nullable(),
  operation: z.string().min(1).nullable(),
  labelHe: z.string().min(1),
  version: z.string().min(1),
  active: z.boolean(),
  ownerId: z.string().min(1),
  ownerName: z.string().min(1),
  approvalId: z.string().min(1).nullable(),
  approvedById: z.string().min(1).nullable(),
  checksumSha256: z.string().length(64),
  protectedTextStored: z.literal(false),
}) satisfies z.ZodType<PromptVersionRecord>;

// ---------------------------------------------------------------------------
// Derived read-only views (NEVER persisted; derived from frozen definitions)
// ---------------------------------------------------------------------------

/** One row of the agent-permission matrix — derived from AGENT_DEFINITIONS. */
export interface AgentPermissionView {
  agentId: string;
  nameHe: string;
  codeName: string;
  operations: readonly string[];
  allowedDomains: readonly string[];
  prohibitedDomains: readonly string[];
  prohibitedActionsHe: readonly string[];
  tools: readonly string[];
  providerPolicy: string;
  maxExecutionMs: number;
  maxUsageBudgetILS: number;
  maxTaskDepth: number;
  maxHandoffs: number;
  approvalRequiredFor: readonly string[];
  promptVersion: string;
  /** live status from the agents collection (emergency stop state); null = record missing */
  runtimeStatus: string | null;
}

/** Tool-centric view: which agents may use a tool. */
export interface ToolPermissionView {
  tool: string;
  agentIds: readonly string[];
}

/** Honest provider/model configuration state — derived, not configured here. */
export interface ProviderConfigurationState {
  providerId: string;
  displayNameHe: string;
  kind: "מקומי" | "מרוחק";
  enabled: boolean;
  statusHe: "פעיל" | "מושבת";
  /** null — the local rules engine is NOT a model; remote model comes from the server only */
  model: string | null;
  operations: readonly string[];
  noteHe: string;
}

/** Model-configuration record shown in the governance UI (derived). */
export interface ModelConfigurationRecord {
  key: string;
  labelHe: string;
  valueHe: string;
  sourceRef: string;
}

// ---------------------------------------------------------------------------
// Audit explorer — query + redacted export contracts
// ---------------------------------------------------------------------------

/** Derived (heuristic) severity of an audit event — documented, not stored. */
export const AUDIT_SEVERITIES = ["רגילה", "בינונית", "גבוהה"] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export interface AuditQuery {
  actor: string | null;
  agentId: string | null;
  /** action prefix match, e.g. "approval." */
  operation: string | null;
  entityRef: string | null;
  /** only events whose entityRef points at an approval */
  approvalsOnly: boolean;
  severity: AuditSeverity | null;
  fromAt: ISODate | null;
  toAt: ISODate | null;
  correlationId: string | null;
  freeText: string | null;
}

export const EMPTY_AUDIT_QUERY: AuditQuery = Object.freeze({
  actor: null,
  agentId: null,
  operation: null,
  entityRef: null,
  approvalsOnly: false,
  severity: null,
  fromAt: null,
  toAt: null,
  correlationId: null,
  freeText: null,
});

/** A single exported event — redacted + truncated, never a full payload. */
export interface RedactedAuditEventExport {
  id: string;
  at: ISODate;
  actor: string;
  action: string;
  entityRef: string | null;
  correlationId: string | null;
  /** redacted + truncated details */
  details: string;
}

export interface AuditExport {
  generatedAt: ISODate;
  query: AuditQuery;
  totalMatched: number;
  /** literal true — every export passes redaction */
  redacted: true;
  events: RedactedAuditEventExport[];
}
