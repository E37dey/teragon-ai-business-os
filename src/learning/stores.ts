// TERAGON AI BUSINESS OS — typed accessors over the learning collections
// (Wave 6, W6-D; new seam — existing repository files untouched).
import type { AIRecommendation, Approval, AuditEvent, Evidence } from "@/domain/types";
import type {
  LearningEvidence,
  LearningObservation,
  LearningProposal,
  LearningRollback,
  LearningRule,
  LearningRuleVersion,
  RecommendationOutcome,
} from "@/domain/learning";
import type { Repository } from "@/repositories/Repository";
import { getRepository } from "@/repositories";

export interface LearningStores {
  observations: Repository<LearningObservation>;
  outcomes: Repository<RecommendationOutcome>;
  proposals: Repository<LearningProposal>;
  evidence: Repository<LearningEvidence>;
  rules: Repository<LearningRule>;
  ruleVersions: Repository<LearningRuleVersion>;
  rollbacks: Repository<LearningRollback>;
  // read/write neighbors the loop derives from / audits into
  recommendations: Repository<AIRecommendation>;
  approvals: Repository<Approval>;
  domainEvidence: Repository<Evidence>;
  audit: Repository<AuditEvent>;
}

/** Production wiring over the canonical repository factory. */
export function learningStores(): LearningStores {
  return {
    observations: getRepository<LearningObservation>("learningObservations"),
    outcomes: getRepository<RecommendationOutcome>("recommendationOutcomes"),
    proposals: getRepository<LearningProposal>("learningProposals"),
    evidence: getRepository<LearningEvidence>("learningEvidence"),
    rules: getRepository<LearningRule>("learningRules"),
    ruleVersions: getRepository<LearningRuleVersion>("learningRuleVersions"),
    rollbacks: getRepository<LearningRollback>("learningRollbacks"),
    recommendations: getRepository<AIRecommendation>("aiRecommendations"),
    approvals: getRepository<Approval>("approvals"),
    domainEvidence: getRepository<Evidence>("evidence"),
    audit: getRepository<AuditEvent>("auditEvents"),
  };
}
