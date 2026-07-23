// Shared fixtures for the W6-D learning-loop tests: fresh factory-backed
// stores (InMemory in jsdom), the canonical ApprovalEngine, deterministic clock.
import { ApprovalEngine } from "@/agents";
import type {
  LearningEvidence,
  LearningProposal,
  LearningRule,
  RuleEffect,
} from "@/domain/learning";
import { __resetRepositoriesForTests } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import { learningStores, type LearningStores, type ProposalDraft } from "@/learning";
import { makeClock } from "../agents/helpers";

export interface LearningFixture {
  stores: LearningStores;
  engine: ApprovalEngine;
  clock: () => string;
}

/** Fresh seeded repositories + engine per test. */
export function freshLearning(): LearningFixture {
  __resetRepositoriesForTests();
  const clock = makeClock();
  return {
    stores: learningStores(),
    engine: new ApprovalEngine({ stores: agentStores(), clock }),
    clock,
  };
}

export const REVIEWER = { id: "u-tzachi", name: "צחי זוסטייהם" } as const;

const T0 = "2026-07-20T08:00:00.000Z";

export function makeEffect(overrides: Partial<Extract<RuleEffect, { kind: "suggested-next-action" }>> = {}): RuleEffect {
  return {
    kind: "suggested-next-action",
    contextHe: "הקשר בדיקה",
    actionHe: "פעולה מוצעת לבדיקה",
    ...overrides,
  };
}

export function makeProposal(overrides: Partial<LearningProposal> = {}): LearningProposal {
  return {
    id: "lp-test",
    createdAt: T0,
    updatedAt: T0,
    proposedInsightHe: "תובנת בדיקה נגזרת",
    businessDomain: "שירות",
    sampleSize: 2,
    supportingRecordIds: ["ai-recommendation:rec-2", "knowledge:kn-1"],
    contraryRecordIds: [],
    possibleBiasHe: ["הטיית בדיקה"],
    limitationsHe: ["מדגם קטן — 2 רשומות"],
    affectedAgentIds: ["ag-fixer"],
    affectedWorkflowsHe: ["אבחון"],
    proposedEffect: makeEffect(),
    evidenceBasis: "correlation",
    causationEvidenceRef: null,
    singleCaseMarkerHe: null,
    namedReviewerId: REVIEWER.id,
    namedReviewerName: REVIEWER.name,
    approvalId: null,
    approvalState: "pending",
    reviewDueAt: null,
    ...overrides,
  };
}

export function makeDraft(overrides: Partial<LearningProposal> = {}): ProposalDraft {
  const proposal = makeProposal(overrides);
  const evidence: LearningEvidence[] = proposal.supportingRecordIds.map((ref, i) => ({
    id: `${proposal.id}-ev-${i + 1}`,
    createdAt: T0,
    updatedAt: T0,
    proposalId: proposal.id,
    sourceType: "entity",
    sourceRef: ref,
    claimHe: `רשומה תומכת ${ref}`,
    direction: "supporting",
    capturedAt: T0,
  }));
  return { proposal, evidence };
}

export function makeRule(overrides: Partial<LearningRule> = {}): LearningRule {
  return {
    id: "rule-lp-test",
    createdAt: T0,
    updatedAt: T0,
    nameHe: "כלל בדיקה",
    insightHe: "תובנת בדיקה",
    proposalId: "lp-test",
    effect: makeEffect(),
    status: "active",
    currentVersion: 1,
    sampleSize: 2,
    limitationsHe: ["מדגם קטן"],
    approvedById: REVIEWER.id,
    approvedByName: REVIEWER.name,
    approvedAt: T0,
    approvalId: "learning-loop-w6d-ap-1",
    effectivenessMeasured: false,
    effectivenessHe: null,
    ...overrides,
  };
}
