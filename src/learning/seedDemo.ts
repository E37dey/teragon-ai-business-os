// TERAGON AI BUSINESS OS — deterministic learning demo dataset (Wave 6, W6-D).
//
// Seeds THROUGH the repositories, idempotently (create-if-missing by stable
// id — safe to call on every page mount):
// - observations + outcomes DERIVED from the existing seed recommendations
//   and approvals (never invented);
// - two derived proposals: one pending review (single case — mandatory marker,
//   can never become a rule) and one that IS approved here by the named
//   reviewer through the real ApprovalEngine, becoming the one active demo
//   rule (honest small sampleSize + limitations, effectiveness "טרם נמדד");
// - one recorded application of the active rule (מעקב).
import { ApprovalEngine } from "@/agents";
import { agentStores } from "@/repositories/agentStores";
import { CANONICAL_USER } from "@/app/identity";
import { MIN_RULE_SAMPLE_SIZE } from "@/domain/learning";
import {
  approveProposal,
  deriveProposals,
  submitProposal,
  syncObservations,
  syncOutcomes,
  type Clock,
} from "./loop";
import { applyRule, ruleApplicationsFromAudit } from "./ruleEngine";
import { learningStores, type LearningStores } from "./stores";

/** The named reviewer of the demo proposals — the canonical CEO user record. */
export const LEARNING_DEMO_REVIEWER = {
  id: "u-tzachi", // seeded CEO user (repositories/seed CEO_USER_ID)
  name: CANONICAL_USER.name,
} as const;

export interface LearningDemoDeps {
  stores?: LearningStores;
  engine?: ApprovalEngine;
  clock?: Clock;
}

export interface LearningDemoResult {
  observations: number;
  outcomes: number;
  proposals: number;
  activeRules: number;
}

/** Idempotent boot of the learning demo state. Safe to call repeatedly. */
export async function ensureLearningDemoData(
  deps: LearningDemoDeps = {},
): Promise<LearningDemoResult> {
  const stores = deps.stores ?? learningStores();
  const clock: Clock = deps.clock ?? (() => new Date().toISOString());
  const engine = deps.engine ?? new ApprovalEngine({ stores: agentStores(), clock });

  // 1–2: observations + outcomes derived from real recommendation/approval records
  const observations = await syncObservations(stores);
  const outcomes = await syncOutcomes(stores);

  // 3: deterministic proposals (submit-if-missing → opens canonical approvals)
  const domainEvidence = await stores.domainEvidence.list();
  const drafts = deriveProposals(observations, domainEvidence, LEARNING_DEMO_REVIEWER);
  for (const draft of drafts) {
    await submitProposal(stores, engine, draft);
  }

  // 4: the one demo rule — named approval through the real engine, only for a
  //    proposal with enough supporting records (single-case stays pending).
  for (const draft of drafts) {
    if (draft.proposal.sampleSize < MIN_RULE_SAMPLE_SIZE) continue;
    const ruleId = `rule-${draft.proposal.id}`;
    const existingRule = await stores.rules.get(ruleId);
    const proposal = await stores.proposals.get(draft.proposal.id);
    if (!existingRule && proposal && proposal.approvalState === "pending") {
      await approveProposal(
        stores,
        engine,
        {
          proposalId: proposal.id,
          decidedById: LEARNING_DEMO_REVIEWER.id,
          decidedByName: LEARNING_DEMO_REVIEWER.name,
          noteHe: "אישור הדגמה — מדגם קטן, בפיקוח",
        },
        clock,
      );
    }
    // 5: one recorded application (מעקב) — only if none exists yet
    const rule = await stores.rules.get(ruleId);
    if (rule && rule.status === "active") {
      const audit = await stores.audit.list();
      if (ruleApplicationsFromAudit(audit, ruleId).length === 0) {
        await applyRule(stores, ruleId, "ticket:t-9", LEARNING_DEMO_REVIEWER.id, clock);
      }
    }
  }

  const [proposals, rules] = await Promise.all([stores.proposals.list(), stores.rules.list()]);
  return {
    observations: observations.length,
    outcomes: outcomes.length,
    proposals: proposals.length,
    activeRules: rules.filter((r) => r.status === "active").length,
  };
}
