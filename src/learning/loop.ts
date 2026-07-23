// TERAGON AI BUSINESS OS — the governed learning loop (Wave 6, W6-D).
//
// recommendation → user approval/edit/rejection (OBSERVED from the existing
// approvals/aiRecommendations records — derived, never invented) → outcome
// observation → learning proposal (deterministic aggregation) → evidence
// review → NAMED manager approval via the canonical ApprovalEngine →
// versioned LearningRule → monitored use → review/rollback.
//
// There is NO autonomous path: a rule exists only after a named human decided
// through the one canonical ApprovalEngine, and every rule is reversible.
import type { AIRecommendation, Approval, AuditEvent, Evidence } from "@/domain/types";
import {
  learningProposalSchema,
  learningRuleSchema,
  ruleEffectSchema,
  MIN_RULE_SAMPLE_SIZE,
  SINGLE_CASE_MARKER_HE,
  RECOMMENDATION_DECISION_LABELS_HE,
  type LearningEvidence,
  type LearningObservation,
  type LearningProposal,
  type LearningRollback,
  type LearningRule,
  type LearningRuleVersion,
  type RecommendationDecision,
  type RecommendationOutcome,
  type RuleEffect,
} from "@/domain/learning";
import type { ApprovalEngine } from "@/agents";
import { nextId } from "@/repositories/Repository";
import { LearningGovernanceError } from "./errors";
import type { LearningStores } from "./stores";

export type Clock = () => string;

/** The dedicated run id all learning-loop approvals hang off. */
export const LEARNING_RUN_ID = "learning-loop-w6d";

/** Actor recorded for derived (non-human) loop steps — honestly a system actor. */
export const LEARNING_LOOP_ACTOR = "learning-loop";

// ---------------------------------------------------------------------------
// audit helper — every governance step lands in the canonical auditEvents
// ---------------------------------------------------------------------------

export interface LearningAuditInput {
  actor: string;
  action: string;
  entityRef: string;
  detailsHe: string;
  correlationId: string | null;
}

export async function writeLearningAudit(
  stores: LearningStores,
  input: LearningAuditInput,
  clock: Clock,
): Promise<AuditEvent> {
  const ts = clock();
  const existing = await stores.audit.list();
  const record: AuditEvent = {
    id: nextId("lae", existing.map((a) => a.id)),
    createdAt: ts,
    updatedAt: ts,
    at: ts,
    actor: input.actor,
    action: input.action,
    entityRef: input.entityRef,
    details: input.detailsHe,
    correlationId: input.correlationId,
  };
  return stores.audit.create(record);
}

// ---------------------------------------------------------------------------
// step 1 — observations DERIVED from existing recommendation/approval records
// ---------------------------------------------------------------------------

function domainFromRef(ref: string | null): string {
  if (!ref) return "כללי";
  if (ref.startsWith("lead:") || ref.startsWith("quotation:") || ref.startsWith("opportunity:")) {
    return "מכירות";
  }
  if (ref.startsWith("ticket:") || ref.startsWith("service-ticket:")) return "שירות";
  if (ref.startsWith("enrollment:") || ref.startsWith("course:") || ref.startsWith("student:")) {
    return "הדרכה";
  }
  if (ref.startsWith("automation:")) return "אוטומציות";
  return "כללי";
}

function decisionFromApproval(approval: Approval): RecommendationDecision {
  if (approval.status === "ממתין") return "pending";
  if (approval.status === "נדחה") return "rejected";
  return approval.note.includes("אושר עם עריכה") ? "edited" : "approved";
}

/**
 * Pure, deterministic derivation: same records in ⇒ same observations out.
 * Only DECIDED approvals produce decision observations; recommendations that
 * required no approval produce domain observations by their entityRef kind.
 */
export function deriveObservations(
  recommendations: readonly AIRecommendation[],
  approvals: readonly Approval[],
): LearningObservation[] {
  const approvalById = new Map(approvals.map((a) => [a.id, a]));
  const referencedApprovalIds = new Set<string>();
  const out: LearningObservation[] = [];

  for (const rec of [...recommendations].sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.approvalId) {
      referencedApprovalIds.add(rec.approvalId);
      const approval = approvalById.get(rec.approvalId);
      if (!approval || approval.status === "ממתין") continue; // no decision — no observation
      const decision = decisionFromApproval(approval);
      const origin =
        decision === "approved"
          ? "recommendation-approved"
          : decision === "edited"
            ? "recommendation-edited"
            : "recommendation-rejected";
      const at = approval.decidedAt ?? approval.updatedAt;
      out.push({
        id: `lo-${rec.id}`,
        createdAt: at,
        updatedAt: at,
        origin,
        sourceRef: `ai-recommendation:${rec.id}`,
        agentId: rec.agentId,
        businessDomain: domainFromRef(rec.entityRef),
        summaryHe: `${rec.title} — ${RECOMMENDATION_DECISION_LABELS_HE[decision]}`,
        observedAt: at,
      });
    } else if (!rec.approvalRequired && rec.entityRef) {
      const origin = rec.entityRef.startsWith("ticket:")
        ? ("repeated-service-solution" as const)
        : rec.entityRef.startsWith("enrollment:")
          ? ("training-outcome" as const)
          : null;
      if (!origin) continue;
      out.push({
        id: `lo-${rec.id}`,
        createdAt: rec.updatedAt,
        updatedAt: rec.updatedAt,
        origin,
        sourceRef: `ai-recommendation:${rec.id}`,
        agentId: rec.agentId,
        businessDomain: domainFromRef(rec.entityRef),
        summaryHe: rec.title,
        observedAt: rec.updatedAt,
      });
    }
  }

  // decided approvals that no recommendation references (e.g. automation approvals).
  // learning-governance approvals are excluded — the loop never observes itself.
  for (const approval of [...approvals].sort((a, b) => a.id.localeCompare(b.id))) {
    if (referencedApprovalIds.has(approval.id) || approval.status === "ממתין") continue;
    if (approval.subjectRef.startsWith("learning-proposal:")) continue;
    const decision = decisionFromApproval(approval);
    const origin =
      decision === "rejected"
        ? ("recommendation-rejected" as const)
        : decision === "edited"
          ? ("recommendation-edited" as const)
          : ("recommendation-approved" as const);
    const at = approval.decidedAt ?? approval.updatedAt;
    out.push({
      id: `lo-${approval.id}`,
      createdAt: at,
      updatedAt: at,
      origin,
      sourceRef: `approval:${approval.id}`,
      agentId: approval.requestedById.startsWith("ag-") ? approval.requestedById : null,
      businessDomain: domainFromRef(approval.subjectRef),
      summaryHe: `${approval.note} — ${RECOMMENDATION_DECISION_LABELS_HE[decision]}`,
      observedAt: at,
    });
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// step 2 — outcome records per recommendation (unmeasured ⇒ honest null)
// ---------------------------------------------------------------------------

export function deriveOutcomes(
  recommendations: readonly AIRecommendation[],
  approvals: readonly Approval[],
): RecommendationOutcome[] {
  const approvalById = new Map(approvals.map((a) => [a.id, a]));
  return [...recommendations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((rec) => {
      const approval = rec.approvalId ? approvalById.get(rec.approvalId) : undefined;
      const decision: RecommendationDecision = approval
        ? decisionFromApproval(approval)
        : rec.approvalRequired
          ? "pending"
          : "approved";
      return {
        id: `ro-${rec.id}`,
        createdAt: rec.updatedAt,
        updatedAt: rec.updatedAt,
        recommendationId: rec.id,
        decision,
        decidedById: approval?.decidedById ?? null,
        userEditHe: null,
        // honesty: the business result was NOT measured — null, never 0/success
        measuredResult: null,
        measurementMethodHe: null,
        measuredAt: null,
        notesHe: "התוצאה העסקית טרם נמדדה — אין מדידה מומצאת",
      } satisfies RecommendationOutcome;
    });
}

// ---------------------------------------------------------------------------
// step 3 — proposals: deterministic aggregation over observations + evidence
// ---------------------------------------------------------------------------

export interface ProposalDraft {
  proposal: LearningProposal;
  evidence: LearningEvidence[];
}

export interface ReviewerRef {
  id: string;
  name: string;
}

function maxISO(dates: readonly string[]): string {
  return dates.reduce((a, b) => (b > a ? b : a));
}

function draftEvidence(
  proposalId: string,
  items: readonly {
    sourceType: LearningEvidence["sourceType"];
    sourceRef: string;
    claimHe: string;
    direction: LearningEvidence["direction"];
    capturedAt: string;
  }[],
): LearningEvidence[] {
  return items.map((item, i) => ({
    id: `${proposalId}-ev-${i + 1}`,
    createdAt: item.capturedAt,
    updatedAt: item.capturedAt,
    proposalId,
    ...item,
  }));
}

/**
 * Deterministic proposal derivation. Two aggregation rules:
 * 1. repeated-service-solution observations + verified knowledge evidence
 *    (domain Evidence records citing "knowledge:" sources) ⇒ a troubleshooting
 *    -order proposal. sampleSize = supporting record count (honest).
 * 2. training-outcome observations ⇒ a suggested-next-action proposal —
 *    when only one record exists it carries the MANDATORY single-case marker
 *    and can never become a rule.
 * Everything is correlation (no causal evidence exists in the records).
 */
export function deriveProposals(
  observations: readonly LearningObservation[],
  domainEvidence: readonly Evidence[],
  reviewer: ReviewerRef,
): ProposalDraft[] {
  const drafts: ProposalDraft[] = [];
  const sorted = [...observations].sort((a, b) => a.id.localeCompare(b.id));

  const serviceObs = sorted.filter((o) => o.origin === "repeated-service-solution");
  const knowledgeEv = [...domainEvidence]
    .filter((e) => e.sourceType === "document" && e.sourceRef.startsWith("knowledge:"))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (serviceObs.length > 0) {
    const id = "lp-service-warping";
    const supporting = [
      ...serviceObs.map((o) => o.sourceRef),
      ...knowledgeEv.map((e) => e.sourceRef),
    ];
    const sampleSize = supporting.length;
    const at = maxISO([
      ...serviceObs.map((o) => o.observedAt),
      ...knowledgeEv.map((e) => e.capturedAt),
    ]);
    drafts.push({
      proposal: {
        id,
        createdAt: at,
        updatedAt: at,
        proposedInsightHe:
          'וורפינג בהדפסת PETG נפתר שוב ושוב באותו סדר פעולות: Brim 5 מ"מ ואז חימום מיטה ל-70°C — מומלץ כסדר פתרון ראשון באבחון.',
        businessDomain: "שירות",
        sampleSize,
        supportingRecordIds: [...supporting].sort((a, b) => a.localeCompare(b)),
        contraryRecordIds: [],
        possibleBiasHe: [
          "הרשומות התומכות מגיעות ממקור ידע יחיד (kn-1) ומקריאה אחת — ייתכן שהפתרון תלוי-סביבה",
        ],
        limitationsHe: [
          `מדגם קטן — ${sampleSize} רשומות תומכות בלבד`,
          "קורלציה בלבד — לא הוכחה סיבתיות",
          "האפקטיביות בשטח טרם נמדדה",
        ],
        affectedAgentIds: ["ag-fixer"],
        affectedWorkflowsHe: ["אבחון קריאת שירות", "סדר פתרון תקלות"],
        proposedEffect: {
          kind: "troubleshooting-order",
          symptomHe: "וורפינג בהדפסת PETG",
          orderedActionsHe: ['הוספת Brim 5 מ"מ', "חימום מיטה ל-70°C"],
        },
        evidenceBasis: "correlation",
        causationEvidenceRef: null,
        singleCaseMarkerHe: sampleSize === 1 ? SINGLE_CASE_MARKER_HE : null,
        namedReviewerId: reviewer.id,
        namedReviewerName: reviewer.name,
        approvalId: null,
        approvalState: "pending",
        reviewDueAt: null,
      },
      evidence: draftEvidence(id, [
        ...serviceObs.map((o) => ({
          sourceType: "entity" as const,
          sourceRef: o.sourceRef,
          claimHe: o.summaryHe,
          direction: "supporting" as const,
          capturedAt: o.observedAt,
        })),
        ...knowledgeEv.map((e) => ({
          sourceType: "document" as const,
          sourceRef: e.sourceRef,
          claimHe: e.claim,
          direction: "supporting" as const,
          capturedAt: e.capturedAt,
        })),
      ]),
    });
  }

  const trainingObs = sorted.filter((o) => o.origin === "training-outcome");
  if (trainingObs.length > 0) {
    const id = "lp-training-first-check";
    const supporting = trainingObs.map((o) => o.sourceRef);
    const sampleSize = supporting.length;
    const at = maxISO(trainingObs.map((o) => o.observedAt));
    drafts.push({
      proposal: {
        id,
        createdAt: at,
        updatedAt: at,
        proposedInsightHe:
          "תלמיד המסומן 'חסום' עשוי להיות חסום טכנית ולא מוטיבציונית — לבדוק חסם טכני לפני שיחת מוטיבציה.",
        businessDomain: "הדרכה",
        sampleSize,
        supportingRecordIds: [...supporting].sort((a, b) => a.localeCompare(b)),
        contraryRecordIds: [],
        possibleBiasHe: ["מקרה בודד של תלמידה אחת — ייתכן שאינו מייצג"],
        limitationsHe: [
          sampleSize === 1 ? SINGLE_CASE_MARKER_HE : `מדגם קטן — ${sampleSize} רשומות`,
          "קורלציה בלבד — לא הוכחה סיבתיות",
          "האפקטיביות טרם נמדדה",
        ],
        affectedAgentIds: ["ag-mentor"],
        affectedWorkflowsHe: ["טיפול בתלמיד חסום"],
        proposedEffect: {
          kind: "suggested-next-action",
          contextHe: "תלמיד מסומן חסום מעל 3 ימים",
          actionHe: "בדיקת חסם טכני (חיבור מדפסת/ציוד) לפני שיחת מוטיבציה",
        },
        evidenceBasis: "correlation",
        causationEvidenceRef: null,
        singleCaseMarkerHe: sampleSize === 1 ? SINGLE_CASE_MARKER_HE : null,
        namedReviewerId: reviewer.id,
        namedReviewerName: reviewer.name,
        approvalId: null,
        approvalState: "pending",
        reviewDueAt: null,
      },
      evidence: draftEvidence(
        id,
        trainingObs.map((o) => ({
          sourceType: "entity" as const,
          sourceRef: o.sourceRef,
          claimHe: o.summaryHe,
          direction: "supporting" as const,
          capturedAt: o.observedAt,
        })),
      ),
    });
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// idempotent persistence of derived records (create-if-missing, never overwrite)
// ---------------------------------------------------------------------------

export async function syncObservations(stores: LearningStores): Promise<LearningObservation[]> {
  const [recs, approvals, existing] = await Promise.all([
    stores.recommendations.list(),
    stores.approvals.list(),
    stores.observations.list(),
  ]);
  const existingIds = new Set(existing.map((o) => o.id));
  const derived = deriveObservations(recs, approvals);
  for (const obs of derived) {
    if (!existingIds.has(obs.id)) await stores.observations.create(obs);
  }
  return stores.observations.list();
}

export async function syncOutcomes(stores: LearningStores): Promise<RecommendationOutcome[]> {
  const [recs, approvals, existing] = await Promise.all([
    stores.recommendations.list(),
    stores.approvals.list(),
    stores.outcomes.list(),
  ]);
  const existingIds = new Set(existing.map((o) => o.id));
  for (const outcome of deriveOutcomes(recs, approvals)) {
    if (!existingIds.has(outcome.id)) await stores.outcomes.create(outcome);
  }
  return stores.outcomes.list();
}

/**
 * Submit a derived proposal for NAMED review: persists the proposal + its
 * evidence and opens a canonical Approval (recommendation-only payload).
 * Idempotent — an existing proposal id is returned untouched.
 */
export async function submitProposal(
  stores: LearningStores,
  engine: ApprovalEngine,
  draft: ProposalDraft,
  requestedById: string = LEARNING_LOOP_ACTOR,
): Promise<LearningProposal> {
  const existing = await stores.proposals.get(draft.proposal.id);
  if (existing) return existing;
  const parsed = learningProposalSchema.safeParse(draft.proposal);
  if (!parsed.success) {
    throw new LearningGovernanceError(
      "LEARNING_PROPOSAL_INVALID",
      parsed.error.issues.map((i) => i.message).join(" · "),
    );
  }
  const approval = await engine.requestApproval({
    runId: LEARNING_RUN_ID,
    subjectRef: `learning-proposal:${draft.proposal.id}`,
    action: "permanent-knowledge-update",
    requestedById,
    executionPayload: null, // recommendation-only: nothing executes by machine
    previewHe: draft.proposal.proposedInsightHe,
  });
  const created = await stores.proposals.create({
    ...draft.proposal,
    approvalId: approval.id,
  });
  const existingEvidence = new Set((await stores.evidence.list()).map((e) => e.id));
  for (const ev of draft.evidence) {
    if (!existingEvidence.has(ev.id)) await stores.evidence.create(ev);
  }
  return created;
}

// ---------------------------------------------------------------------------
// NAMED manager decision — via the ONE canonical ApprovalEngine
// ---------------------------------------------------------------------------

export interface ProposalDecisionInput {
  proposalId: string;
  decidedById: string;
  decidedByName: string;
  noteHe?: string;
}

async function requireReviewableProposal(
  stores: LearningStores,
  input: ProposalDecisionInput,
): Promise<LearningProposal> {
  const proposal = await stores.proposals.get(input.proposalId);
  if (!proposal) {
    throw new LearningGovernanceError(
      "LEARNING_PROPOSAL_NOT_FOUND",
      `הצעה "${input.proposalId}" לא נמצאה`,
    );
  }
  if (proposal.approvalState !== "pending" || !proposal.approvalId) {
    throw new LearningGovernanceError(
      "LEARNING_PROPOSAL_NOT_PENDING",
      `ההצעה "${proposal.id}" כבר הוכרעה (${proposal.approvalState})`,
    );
  }
  if (!input.decidedById.trim() || !input.decidedByName.trim()) {
    throw new LearningGovernanceError(
      "LEARNING_REVIEWER_NOT_NAMED",
      "אישור למידה מחייב מאשר בשם — אין אישור אנונימי",
    );
  }
  if (input.decidedById !== proposal.namedReviewerId) {
    throw new LearningGovernanceError(
      "LEARNING_REVIEWER_MISMATCH",
      `ההצעה ממתינה לבדיקת ${proposal.namedReviewerName} (${proposal.namedReviewerId}) — לא ${input.decidedById}`,
    );
  }
  return proposal;
}

/**
 * Approve a proposal ⇒ activate a versioned rule.
 * - the decision goes through ApprovalEngine.decide (bypass throws there);
 * - single-case proposals are BLOCKED from becoming rules (honesty rule 2);
 * - the created rule + version v1 are validated against the schemas.
 */
export async function approveProposal(
  stores: LearningStores,
  engine: ApprovalEngine,
  input: ProposalDecisionInput,
  clock: Clock,
): Promise<LearningRule> {
  const proposal = await requireReviewableProposal(stores, input);
  if (proposal.sampleSize < MIN_RULE_SAMPLE_SIZE) {
    throw new LearningGovernanceError(
      "LEARNING_SINGLE_CASE_RULE_BLOCKED",
      `${SINGLE_CASE_MARKER_HE} — נדרשות לפחות ${MIN_RULE_SAMPLE_SIZE} רשומות תומכות`,
    );
  }
  // the canonical gate — throws when the approval is missing / already decided
  await engine.decide({
    runId: LEARNING_RUN_ID,
    approvalId: proposal.approvalId as string,
    kind: "approve",
    decidedById: input.decidedById,
    noteHe: input.noteHe,
  });
  const ts = clock();
  const rule: LearningRule = learningRuleSchema.parse({
    id: `rule-${proposal.id}`,
    createdAt: ts,
    updatedAt: ts,
    nameHe: proposal.proposedInsightHe.slice(0, 60),
    insightHe: proposal.proposedInsightHe,
    proposalId: proposal.id,
    effect: ruleEffectSchema.parse(proposal.proposedEffect),
    status: "active",
    currentVersion: 1,
    sampleSize: proposal.sampleSize,
    limitationsHe: proposal.limitationsHe,
    approvedById: input.decidedById,
    approvedByName: input.decidedByName,
    approvedAt: ts,
    approvalId: proposal.approvalId as string,
    effectivenessMeasured: false, // honest: nothing was measured yet
    effectivenessHe: null,
  } satisfies LearningRule);
  const created = await stores.rules.create(rule);
  await stores.ruleVersions.create({
    id: `${rule.id}-v1`,
    createdAt: ts,
    updatedAt: ts,
    ruleId: rule.id,
    version: 1,
    insightHe: rule.insightHe,
    effect: rule.effect,
    reasonHe: `אושר על ידי ${input.decidedByName}${input.noteHe ? ` — ${input.noteHe}` : ""}`,
    createdById: input.decidedById,
  } satisfies LearningRuleVersion);
  await stores.proposals.update(proposal.id, { approvalState: "approved", updatedAt: ts });
  await writeLearningAudit(
    stores,
    {
      actor: input.decidedById,
      action: "learning.rule-activated",
      entityRef: `learning-rule:${rule.id}`,
      detailsHe: `כלל למידה הופעל מתוך הצעה ${proposal.id} על ידי ${input.decidedByName} (גרסה 1)`,
      correlationId: rule.id,
    },
    clock,
  );
  return created;
}

/** Reject a proposal — reason mandatory (enforced here AND by the engine). */
export async function rejectProposal(
  stores: LearningStores,
  engine: ApprovalEngine,
  input: ProposalDecisionInput & { reasonHe: string },
  clock: Clock,
): Promise<LearningProposal> {
  const proposal = await requireReviewableProposal(stores, input);
  await engine.decide({
    runId: LEARNING_RUN_ID,
    approvalId: proposal.approvalId as string,
    kind: "reject",
    decidedById: input.decidedById,
    noteHe: input.reasonHe,
  });
  const ts = clock();
  const updated = await stores.proposals.update(proposal.id, {
    approvalState: "rejected",
    updatedAt: ts,
  });
  await writeLearningAudit(
    stores,
    {
      actor: input.decidedById,
      action: "learning.proposal-rejected",
      entityRef: `learning-proposal:${proposal.id}`,
      detailsHe: `ההצעה נדחתה על ידי ${input.decidedByName}: ${input.reasonHe}`,
      correlationId: proposal.id,
    },
    clock,
  );
  return updated;
}

// ---------------------------------------------------------------------------
// versioning — append-only version records; revision bumps currentVersion
// ---------------------------------------------------------------------------

export interface ReviseRuleInput {
  ruleId: string;
  effect: RuleEffect;
  insightHe: string;
  reasonHe: string;
  actorId: string;
}

export async function reviseRule(
  stores: LearningStores,
  input: ReviseRuleInput,
  clock: Clock,
): Promise<LearningRule> {
  const rule = await stores.rules.get(input.ruleId);
  if (!rule) {
    throw new LearningGovernanceError("LEARNING_RULE_NOT_FOUND", `כלל "${input.ruleId}" לא נמצא`);
  }
  if (rule.status !== "active") {
    throw new LearningGovernanceError(
      "LEARNING_RULE_INACTIVE",
      `הכלל "${rule.id}" אינו פעיל — אין לעדכן כלל שבוטל`,
    );
  }
  const effect = ruleEffectSchema.parse(input.effect);
  const ts = clock();
  const version = rule.currentVersion + 1;
  await stores.ruleVersions.create({
    id: `${rule.id}-v${version}`,
    createdAt: ts,
    updatedAt: ts,
    ruleId: rule.id,
    version,
    insightHe: input.insightHe,
    effect,
    reasonHe: input.reasonHe,
    createdById: input.actorId,
  } satisfies LearningRuleVersion);
  const updated = await stores.rules.update(rule.id, {
    effect,
    insightHe: input.insightHe,
    currentVersion: version,
    updatedAt: ts,
  });
  await writeLearningAudit(
    stores,
    {
      actor: input.actorId,
      action: "learning.rule-revised",
      entityRef: `learning-rule:${rule.id}`,
      detailsHe: `הכלל עודכן לגרסה ${version}: ${input.reasonHe}`,
      correlationId: rule.id,
    },
    clock,
  );
  return updated;
}

// ---------------------------------------------------------------------------
// rollback — deactivate + record; past applications remain visible forever
// ---------------------------------------------------------------------------

export interface RollbackRuleInput {
  ruleId: string;
  reasonHe: string;
  actorId: string;
  actorName: string;
}

export async function rollbackRule(
  stores: LearningStores,
  input: RollbackRuleInput,
  clock: Clock,
): Promise<{ rule: LearningRule; rollback: LearningRollback }> {
  const rule = await stores.rules.get(input.ruleId);
  if (!rule) {
    throw new LearningGovernanceError("LEARNING_RULE_NOT_FOUND", `כלל "${input.ruleId}" לא נמצא`);
  }
  if (rule.status === "rolled-back") {
    throw new LearningGovernanceError(
      "LEARNING_RULE_ALREADY_ROLLED_BACK",
      `הכלל "${rule.id}" כבר בוטל`,
    );
  }
  if (!input.reasonHe.trim()) {
    throw new LearningGovernanceError("LEARNING_ROLLBACK_INVALID", "ביטול כלל מחייב נימוק");
  }
  if (!input.actorId.trim() || !input.actorName.trim()) {
    throw new LearningGovernanceError(
      "LEARNING_ROLLBACK_INVALID",
      "ביטול כלל מחייב מבצע בשם — אין ביטול אנונימי",
    );
  }
  const ts = clock();
  const updatedRule = await stores.rules.update(rule.id, {
    status: "rolled-back",
    updatedAt: ts,
  });
  const rollback = await stores.rollbacks.create({
    id: `rb-${rule.id}`,
    createdAt: ts,
    updatedAt: ts,
    ruleId: rule.id,
    version: rule.currentVersion,
    reasonHe: input.reasonHe,
    rolledBackById: input.actorId,
    rolledBackByName: input.actorName,
    rolledBackAt: ts,
  });
  await writeLearningAudit(
    stores,
    {
      actor: input.actorId,
      action: "learning.rule-rollback",
      entityRef: `learning-rule:${rule.id}`,
      detailsHe: `הכלל בוטל (גרסה ${rule.currentVersion}) על ידי ${input.actorName}: ${input.reasonHe} · יישומי העבר נשארים גלויים`,
      correlationId: rule.id,
    },
    clock,
  );
  return { rule: updatedRule, rollback };
}
