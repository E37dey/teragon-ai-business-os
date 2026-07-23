// TERAGON AI BUSINESS OS — governed learning loop domain (Wave 6, W6-D).
// Records for the recommendation → outcome → proposal → evidence → named
// approval → versioned rule → monitoring → rollback loop.
//
// HONESTY RULES (enforced in schema + logic, tested in tests/learning):
// 1. Correlation is NEVER labeled causation without an explicit evidence ref
//    (evidenceBasis "causation" requires causationEvidenceRef).
// 2. sampleSize === 1 ⇒ the proposal MUST carry the mandatory marker
//    "מקרה יחיד — לא מספיק ליצירת כלל" and can never become a rule
//    (MIN_RULE_SAMPLE_SIZE is schema-enforced on LearningRule).
// 3. Effectiveness without measurement ⇒ "טרם נמדד" — an absent measurement is
//    never rendered as 0 or as success.
// 4. sampleSize always equals the number of supporting records — no invented
//    counts.
import { z } from "zod";
import type { ISODate } from "@/domain/types";

// ---------------------------------------------------------------------------
// honesty constants
// ---------------------------------------------------------------------------

/** Mandatory Hebrew marker on every single-case proposal. */
export const SINGLE_CASE_MARKER_HE = "מקרה יחיד — לא מספיק ליצירת כלל";

/** The honest label for anything unmeasured. */
export const LEARNING_UNMEASURED_HE = "טרם נמדד";

/** A rule may only be created from at least this many supporting records. */
export const MIN_RULE_SAMPLE_SIZE = 2;

/**
 * Areas a learning rule can NEVER touch — enforced by construction: the
 * RuleEffect closed union simply cannot express them (guard-tested).
 */
export const FORBIDDEN_RULE_AREAS_HE: readonly string[] = Object.freeze([
  "הרשאות",
  "דרישות אישור",
  "סמכות תמחור",
  "מדיניות אבטחה",
  "תצורת ספק AI",
  "גישה ארגונית",
  "הוראות מערכת",
]);

// ---------------------------------------------------------------------------
// shared zod building blocks (mirrors src/domain/schemas.ts conventions)
// ---------------------------------------------------------------------------

const isoDate = z.string().min(1);

const baseEntity = {
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
};

// ---------------------------------------------------------------------------
// LearningObservation — where a learning signal comes from (closed union)
// ---------------------------------------------------------------------------

export const LEARNING_OBSERVATION_ORIGINS = [
  "recommendation-approved",
  "recommendation-edited",
  "recommendation-rejected",
  "business-result-success",
  "business-result-failure",
  "repeated-service-solution",
  "training-outcome",
  "user-feedback",
  "automation-failure",
  "knowledge-contradiction",
] as const;

export type LearningObservationOrigin = (typeof LEARNING_OBSERVATION_ORIGINS)[number];

export const LEARNING_OBSERVATION_ORIGIN_LABELS_HE: Record<LearningObservationOrigin, string> = {
  "recommendation-approved": "המלצה שאושרה",
  "recommendation-edited": "המלצה שנערכה",
  "recommendation-rejected": "המלצה שנדחתה",
  "business-result-success": "תוצאה עסקית — הצלחה",
  "business-result-failure": "תוצאה עסקית — כישלון",
  "repeated-service-solution": "פתרון שירות חוזר",
  "training-outcome": "תוצאת הדרכה",
  "user-feedback": "משוב משתמש",
  "automation-failure": "כשל אוטומציה",
  "knowledge-contradiction": "סתירה בידע",
};

export interface LearningObservation {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  origin: LearningObservationOrigin;
  /** the REAL record observed, e.g. "ai-recommendation:rec-2" / "approval:ap-3" */
  sourceRef: string;
  /** originating agent id when known (e.g. "ag-fixer"); null otherwise */
  agentId: string | null;
  /** business domain in Hebrew: "שירות" / "מכירות" / "הדרכה" / "אוטומציות"… */
  businessDomain: string;
  summaryHe: string;
  observedAt: ISODate;
}

export const learningObservationSchema = z.object({
  ...baseEntity,
  origin: z.enum(LEARNING_OBSERVATION_ORIGINS),
  sourceRef: z.string().min(1),
  agentId: z.string().min(1).nullable(),
  businessDomain: z.string().min(1),
  summaryHe: z.string().min(1),
  observedAt: isoDate,
}) satisfies z.ZodType<LearningObservation>;

// ---------------------------------------------------------------------------
// RecommendationOutcome — what actually happened after a recommendation
// ---------------------------------------------------------------------------

export type RecommendationDecision = "approved" | "edited" | "rejected" | "pending";

export const RECOMMENDATION_DECISION_LABELS_HE: Record<RecommendationDecision, string> = {
  approved: "אושרה",
  edited: "אושרה עם עריכה",
  rejected: "נדחתה",
  pending: "ממתינה להחלטה",
};

export interface RecommendationOutcome {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  recommendationId: string;
  decision: RecommendationDecision;
  decidedById: string | null;
  /** the human's edit, when decision is "edited" */
  userEditHe: string | null;
  /** null ⇒ the business result was NOT measured ("טרם נמדד" — never 0) */
  measuredResult: "success" | "failure" | null;
  /** HOW the result was measured — mandatory whenever measuredResult exists */
  measurementMethodHe: string | null;
  measuredAt: ISODate | null;
  notesHe: string;
}

export const recommendationOutcomeSchema = z
  .object({
    ...baseEntity,
    recommendationId: z.string().min(1),
    decision: z.enum(["approved", "edited", "rejected", "pending"]),
    decidedById: z.string().min(1).nullable(),
    userEditHe: z.string().min(1).nullable(),
    measuredResult: z.enum(["success", "failure"]).nullable(),
    measurementMethodHe: z.string().min(1).nullable(),
    measuredAt: isoDate.nullable(),
    notesHe: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.measuredResult !== null && (!val.measurementMethodHe || !val.measuredAt)) {
      ctx.addIssue({
        code: "custom",
        message: "תוצאה נמדדת מחייבת שיטת מדידה ותאריך מדידה — אין מדידה מומצאת",
        path: ["measurementMethodHe"],
      });
    }
  }) satisfies z.ZodType<RecommendationOutcome>;

/** The ONLY sanctioned way to render an outcome: unmeasured ⇒ "טרם נמדד". */
export function outcomeDisplayHe(outcome: RecommendationOutcome | null | undefined): string {
  if (!outcome || outcome.measuredResult === null) return LEARNING_UNMEASURED_HE;
  return outcome.measuredResult === "success" ? "הצלחה (נמדד)" : "כישלון (נמדד)";
}

// ---------------------------------------------------------------------------
// RuleEffect — the ONLY surfaces a learning rule may influence (closed union).
// Permissions / approval requirements / pricing authority / security policy /
// provider config / org access / system instructions are inexpressible here
// BY CONSTRUCTION — see FORBIDDEN_RULE_AREAS_HE + the guard test.
// ---------------------------------------------------------------------------

export type RuleEffect =
  | { kind: "ranking-adjustment"; targetHe: string; direction: "boost" | "demote"; rationaleHe: string }
  | { kind: "suggested-next-action"; contextHe: string; actionHe: string }
  | { kind: "default-draft-structure"; draftTypeHe: string; sectionsHe: string[] }
  | { kind: "follow-up-timing"; contextHe: string; recommendedDelayHours: number }
  | { kind: "knowledge-retrieval-weighting"; sourceRef: string; direction: "increase" | "decrease" }
  | { kind: "troubleshooting-order"; symptomHe: string; orderedActionsHe: string[] };

export const RULE_EFFECT_KINDS = [
  "ranking-adjustment",
  "suggested-next-action",
  "default-draft-structure",
  "follow-up-timing",
  "knowledge-retrieval-weighting",
  "troubleshooting-order",
] as const;

export const RULE_EFFECT_KIND_LABELS_HE: Record<RuleEffect["kind"], string> = {
  "ranking-adjustment": "דירוג המלצות",
  "suggested-next-action": "הצעת פעולה הבאה",
  "default-draft-structure": "מבנה טיוטה ברירת-מחדל",
  "follow-up-timing": "תזמון מעקב מומלץ",
  "knowledge-retrieval-weighting": "משקול שליפת ידע",
  "troubleshooting-order": "סדר פתרון תקלות",
};

export const ruleEffectSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ranking-adjustment"),
    targetHe: z.string().min(1),
    direction: z.enum(["boost", "demote"]),
    rationaleHe: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("suggested-next-action"),
    contextHe: z.string().min(1),
    actionHe: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("default-draft-structure"),
    draftTypeHe: z.string().min(1),
    sectionsHe: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    kind: z.literal("follow-up-timing"),
    contextHe: z.string().min(1),
    recommendedDelayHours: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal("knowledge-retrieval-weighting"),
    sourceRef: z.string().min(1),
    direction: z.enum(["increase", "decrease"]),
  }),
  z.strictObject({
    kind: z.literal("troubleshooting-order"),
    symptomHe: z.string().min(1),
    orderedActionsHe: z.array(z.string().min(1)).min(1),
  }),
]) satisfies z.ZodType<RuleEffect>;

// ---------------------------------------------------------------------------
// LearningProposal — a derived insight awaiting NAMED human review
// ---------------------------------------------------------------------------

export type ProposalApprovalState = "pending" | "approved" | "rejected";

export interface LearningProposal {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  proposedInsightHe: string;
  businessDomain: string;
  /** ALWAYS equals supportingRecordIds.length — honest counting */
  sampleSize: number;
  supportingRecordIds: string[];
  contraryRecordIds: string[];
  possibleBiasHe: string[];
  /** honest limitations — always non-empty */
  limitationsHe: string[];
  affectedAgentIds: string[];
  affectedWorkflowsHe: string[];
  /** the bounded rule effect this proposal would activate if approved */
  proposedEffect: RuleEffect;
  /** correlation unless real causal evidence is cited */
  evidenceBasis: "correlation" | "causation";
  /** mandatory when evidenceBasis is "causation" */
  causationEvidenceRef: string | null;
  /** mandatory marker when sampleSize === 1; null otherwise */
  singleCaseMarkerHe: string | null;
  /** the NAMED reviewer — approvals are never anonymous */
  namedReviewerId: string;
  namedReviewerName: string;
  /** id of the canonical Approval record (ApprovalEngine) */
  approvalId: string | null;
  approvalState: ProposalApprovalState;
  reviewDueAt: ISODate | null;
}

export const learningProposalSchema = z
  .object({
    ...baseEntity,
    proposedInsightHe: z.string().min(1),
    businessDomain: z.string().min(1),
    sampleSize: z.number().int().min(1),
    supportingRecordIds: z.array(z.string().min(1)).min(1),
    contraryRecordIds: z.array(z.string().min(1)),
    possibleBiasHe: z.array(z.string().min(1)),
    limitationsHe: z.array(z.string().min(1)).min(1),
    affectedAgentIds: z.array(z.string().min(1)),
    affectedWorkflowsHe: z.array(z.string().min(1)),
    proposedEffect: ruleEffectSchema,
    evidenceBasis: z.enum(["correlation", "causation"]),
    causationEvidenceRef: z.string().min(1).nullable(),
    singleCaseMarkerHe: z.string().min(1).nullable(),
    namedReviewerId: z.string().min(1),
    namedReviewerName: z.string().min(1),
    approvalId: z.string().min(1).nullable(),
    approvalState: z.enum(["pending", "approved", "rejected"]),
    reviewDueAt: isoDate.nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.sampleSize !== val.supportingRecordIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "sampleSize חייב להיות שווה למספר הרשומות התומכות — אין ספירה מומצאת",
        path: ["sampleSize"],
      });
    }
    if (val.sampleSize === 1 && val.singleCaseMarkerHe !== SINGLE_CASE_MARKER_HE) {
      ctx.addIssue({
        code: "custom",
        message: `הצעה ממקרה יחיד מחייבת את הסימון "${SINGLE_CASE_MARKER_HE}"`,
        path: ["singleCaseMarkerHe"],
      });
    }
    if (val.sampleSize > 1 && val.singleCaseMarkerHe !== null) {
      ctx.addIssue({
        code: "custom",
        message: "סימון מקרה-יחיד מותר רק כשהמדגם הוא 1",
        path: ["singleCaseMarkerHe"],
      });
    }
    if (val.evidenceBasis === "causation" && !val.causationEvidenceRef) {
      ctx.addIssue({
        code: "custom",
        message: "קורלציה לעולם אינה מוצגת כסיבתיות ללא הפניה לראיה סיבתית",
        path: ["causationEvidenceRef"],
      });
    }
  }) satisfies z.ZodType<LearningProposal>;

// ---------------------------------------------------------------------------
// LearningEvidence — supporting/contrary evidence attached to a proposal
// ---------------------------------------------------------------------------

export interface LearningEvidence {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  proposalId: string;
  sourceType: "entity" | "document" | "computation" | "external";
  /** the REAL record cited */
  sourceRef: string;
  claimHe: string;
  direction: "supporting" | "contrary";
  capturedAt: ISODate;
}

export const learningEvidenceSchema = z.object({
  ...baseEntity,
  proposalId: z.string().min(1),
  sourceType: z.enum(["entity", "document", "computation", "external"]),
  sourceRef: z.string().min(1),
  claimHe: z.string().min(1),
  direction: z.enum(["supporting", "contrary"]),
  capturedAt: isoDate,
}) satisfies z.ZodType<LearningEvidence>;

// ---------------------------------------------------------------------------
// LearningRule — an ACTIVE, versioned, named-approved rule (bounded effects)
// ---------------------------------------------------------------------------

export type LearningRuleStatus = "active" | "rolled-back";

export interface LearningRule {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  nameHe: string;
  insightHe: string;
  /** provenance — the approved proposal this rule came from */
  proposalId: string;
  effect: RuleEffect;
  status: LearningRuleStatus;
  currentVersion: number;
  sampleSize: number;
  limitationsHe: string[];
  /** NAMED approval — never anonymous, never a system actor */
  approvedById: string;
  approvedByName: string;
  approvedAt: ISODate;
  /** the canonical Approval record behind the activation */
  approvalId: string;
  /** false ⇒ effectiveness renders "טרם נמדד" */
  effectivenessMeasured: boolean;
  effectivenessHe: string | null;
}

export const learningRuleSchema = z
  .object({
    ...baseEntity,
    nameHe: z.string().min(1),
    insightHe: z.string().min(1),
    proposalId: z.string().min(1),
    effect: ruleEffectSchema,
    status: z.enum(["active", "rolled-back"]),
    currentVersion: z.number().int().min(1),
    sampleSize: z.number().int().min(MIN_RULE_SAMPLE_SIZE),
    limitationsHe: z.array(z.string().min(1)).min(1),
    approvedById: z.string().min(1),
    approvedByName: z.string().min(1),
    approvedAt: isoDate,
    approvalId: z.string().min(1),
    effectivenessMeasured: z.boolean(),
    effectivenessHe: z.string().min(1).nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.effectivenessMeasured && !val.effectivenessHe) {
      ctx.addIssue({
        code: "custom",
        message: "אפקטיביות נמדדת מחייבת תיאור מדידה",
        path: ["effectivenessHe"],
      });
    }
    if (!val.effectivenessMeasured && val.effectivenessHe !== null) {
      ctx.addIssue({
        code: "custom",
        message: 'ללא מדידה אין תיאור אפקטיביות — התצוגה היא "טרם נמדד"',
        path: ["effectivenessHe"],
      });
    }
  }) satisfies z.ZodType<LearningRule>;

/** Unmeasured effectiveness ⇒ "טרם נמדד" — the only sanctioned rendering. */
export function ruleEffectivenessDisplayHe(rule: LearningRule): string {
  if (!rule.effectivenessMeasured || rule.effectivenessHe === null) return LEARNING_UNMEASURED_HE;
  return rule.effectivenessHe;
}

// ---------------------------------------------------------------------------
// LearningRuleVersion — immutable, append-only version snapshots
// ---------------------------------------------------------------------------

export interface LearningRuleVersion {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  ruleId: string;
  version: number;
  insightHe: string;
  effect: RuleEffect;
  reasonHe: string;
  createdById: string;
}

export const learningRuleVersionSchema = z.object({
  ...baseEntity,
  ruleId: z.string().min(1),
  version: z.number().int().min(1),
  insightHe: z.string().min(1),
  effect: ruleEffectSchema,
  reasonHe: z.string().min(1),
  createdById: z.string().min(1),
}) satisfies z.ZodType<LearningRuleVersion>;

// ---------------------------------------------------------------------------
// LearningRollback — deactivation record; past applications stay visible
// ---------------------------------------------------------------------------

export interface LearningRollback {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  ruleId: string;
  /** the rule version that was active when rolled back */
  version: number;
  reasonHe: string;
  rolledBackById: string;
  rolledBackByName: string;
  rolledBackAt: ISODate;
}

export const learningRollbackSchema = z.object({
  ...baseEntity,
  ruleId: z.string().min(1),
  version: z.number().int().min(1),
  reasonHe: z.string().min(1),
  rolledBackById: z.string().min(1),
  rolledBackByName: z.string().min(1),
  rolledBackAt: isoDate,
}) satisfies z.ZodType<LearningRollback>;
