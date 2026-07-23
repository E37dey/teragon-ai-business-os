// TERAGON AI BUSINESS OS — structured learning-loop errors (Wave 6, W6-D).

export type LearningErrorCode =
  | "LEARNING_PROPOSAL_NOT_FOUND"
  | "LEARNING_PROPOSAL_NOT_PENDING"
  | "LEARNING_PROPOSAL_INVALID"
  | "LEARNING_REVIEWER_NOT_NAMED"
  | "LEARNING_REVIEWER_MISMATCH"
  | "LEARNING_SINGLE_CASE_RULE_BLOCKED"
  | "LEARNING_RULE_NOT_FOUND"
  | "LEARNING_RULE_INACTIVE"
  | "LEARNING_RULE_ALREADY_ROLLED_BACK"
  | "LEARNING_ROLLBACK_INVALID"
  | "LEARNING_EFFECT_INVALID";

export class LearningGovernanceError extends Error {
  readonly code: LearningErrorCode;
  readonly detail: string;

  constructor(code: LearningErrorCode, detail: string) {
    super(`[${code}] ${detail}`);
    this.name = "LearningGovernanceError";
    this.code = code;
    this.detail = detail;
  }
}
