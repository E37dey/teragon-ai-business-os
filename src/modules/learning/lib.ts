// W6-D — pure selectors behind /learning. Every number derives from records;
// nothing invented; unmeasured metrics surface as "טרם נמדד".
import type { AIRecommendation, Approval, AuditEvent } from "@/domain/types";
import {
  LEARNING_UNMEASURED_HE,
  RECOMMENDATION_DECISION_LABELS_HE,
  type LearningEvidence,
  type LearningObservation,
  type LearningProposal,
  type LearningRollback,
  type LearningRule,
  type RecommendationOutcome,
} from "@/domain/learning";
import { getAgentDefinition } from "@/agents";
import { RULE_APPLY_AUDIT_ACTION } from "@/learning";

// ---------------------------------------------------------------------------
// metrics
// ---------------------------------------------------------------------------

export interface LearningMetrics {
  approvedCount: number;
  editedCount: number;
  rejectedCount: number;
  measuredOutcomeCount: number;
  /** "טרם נמדד" when nothing was measured — never a fake 0-as-progress */
  measuredOutcomeDisplay: string;
  proposalsPending: number;
  activeRules: number;
  /** active rules whose effectiveness is still unmeasured — under monitoring */
  underReview: number;
  rollbackCount: number;
}

export function learningMetrics(input: {
  observations: readonly LearningObservation[];
  outcomes: readonly RecommendationOutcome[];
  proposals: readonly LearningProposal[];
  rules: readonly LearningRule[];
  rollbacks: readonly LearningRollback[];
}): LearningMetrics {
  const byOrigin = (o: LearningObservation["origin"]): number =>
    input.observations.filter((x) => x.origin === o).length;
  const measured = input.outcomes.filter((o) => o.measuredResult !== null).length;
  const activeRules = input.rules.filter((r) => r.status === "active");
  return {
    approvedCount: byOrigin("recommendation-approved"),
    editedCount: byOrigin("recommendation-edited"),
    rejectedCount: byOrigin("recommendation-rejected"),
    measuredOutcomeCount: measured,
    measuredOutcomeDisplay: measured > 0 ? String(measured) : LEARNING_UNMEASURED_HE,
    proposalsPending: input.proposals.filter((p) => p.approvalState === "pending").length,
    activeRules: activeRules.length,
    underReview: activeRules.filter((r) => !r.effectivenessMeasured).length,
    rollbackCount: input.rollbacks.length,
  };
}

// ---------------------------------------------------------------------------
// workflow stepper counts
// ---------------------------------------------------------------------------

export interface LoopStep {
  id: string;
  label: string;
  count: number;
}

export function loopSteps(input: {
  recommendations: readonly AIRecommendation[];
  outcomes: readonly RecommendationOutcome[];
  proposals: readonly LearningProposal[];
  evidence: readonly LearningEvidence[];
  rules: readonly LearningRule[];
  audit: readonly AuditEvent[];
}): LoopStep[] {
  const decided = input.outcomes.filter((o) => o.decision !== "pending").length;
  const measured = input.outcomes.filter((o) => o.measuredResult !== null).length;
  const approved = input.proposals.filter((p) => p.approvalState === "approved").length;
  const applications = input.audit.filter((a) => a.action === RULE_APPLY_AUDIT_ACTION).length;
  return [
    { id: "recommendation", label: "המלצה", count: input.recommendations.length },
    { id: "user-response", label: "תגובת משתמש", count: decided },
    { id: "outcome", label: "תוצאה", count: measured },
    { id: "insight", label: "תובנה מוצעת", count: input.proposals.length },
    { id: "evidence", label: "בדיקת ראיות", count: input.evidence.length },
    { id: "manager-approval", label: "אישור מנהל", count: approved },
    { id: "active-rule", label: "כלל פעיל", count: input.rules.filter((r) => r.status === "active").length },
    { id: "monitoring", label: "מעקב", count: applications },
  ];
}

// ---------------------------------------------------------------------------
// main table rows — recommendation joined with its outcome/proposal/rule
// ---------------------------------------------------------------------------

export interface LearningRow {
  id: string;
  recommendation: AIRecommendation;
  agentNameHe: string;
  decisionLabelHe: string;
  editHe: string;
  outcomeDisplayHe: string;
  proposal: LearningProposal | null;
  rule: LearningRule | null;
  sampleSize: number | null;
  contraryCount: number | null;
  approverDisplayHe: string;
  statusHe: string;
}

export function learningRows(input: {
  recommendations: readonly AIRecommendation[];
  approvals: readonly Approval[];
  outcomes: readonly RecommendationOutcome[];
  proposals: readonly LearningProposal[];
  rules: readonly LearningRule[];
}): LearningRow[] {
  const outcomeByRec = new Map(input.outcomes.map((o) => [o.recommendationId, o]));
  const ruleByProposal = new Map(input.rules.map((r) => [r.proposalId, r]));
  return [...input.recommendations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((rec) => {
      const outcome = outcomeByRec.get(rec.id) ?? null;
      const proposal =
        input.proposals.find((p) =>
          p.supportingRecordIds.includes(`ai-recommendation:${rec.id}`),
        ) ?? null;
      const rule = proposal ? (ruleByProposal.get(proposal.id) ?? null) : null;
      const decision = outcome?.decision ?? "pending";
      const statusHe = rule
        ? rule.status === "active"
          ? "כלל פעיל"
          : "כלל בוטל (rollback)"
        : proposal
          ? proposal.approvalState === "pending"
            ? "ממתין לבדיקת מנהל"
            : proposal.approvalState === "rejected"
              ? "הצעה נדחתה"
              : "הצעה אושרה"
          : "אין תובנה נגזרת";
      return {
        id: rec.id,
        recommendation: rec,
        agentNameHe: getAgentDefinition(rec.agentId)?.nameHe ?? rec.agentId,
        decisionLabelHe: RECOMMENDATION_DECISION_LABELS_HE[decision],
        editHe: outcome?.userEditHe ?? "—",
        outcomeDisplayHe:
          outcome && outcome.measuredResult !== null
            ? outcome.measuredResult === "success"
              ? "הצלחה (נמדד)"
              : "כישלון (נמדד)"
            : LEARNING_UNMEASURED_HE,
        proposal,
        rule,
        sampleSize: proposal ? proposal.sampleSize : null,
        contraryCount: proposal ? proposal.contraryRecordIds.length : null,
        approverDisplayHe: rule
          ? rule.approvedByName
          : proposal
            ? proposal.approvalState === "pending"
              ? `ממתין ל${proposal.namedReviewerName}`
              : proposal.namedReviewerName
            : "—",
        statusHe,
      } satisfies LearningRow;
    });
}
