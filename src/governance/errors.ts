// TERAGON AI BUSINESS OS — governance errors (Wave 8, W8-B).

export type GovernanceErrorCode =
  | "GOV_POLICY_NOT_FOUND"
  | "GOV_POLICY_NOT_PENDING"
  | "GOV_POLICY_NOT_DRAFT"
  | "GOV_APPROVER_NOT_NAMED"
  | "GOV_RISK_NOT_FOUND"
  | "GOV_RISK_TRANSITION_INVALID"
  | "GOV_INCIDENT_NOT_FOUND"
  | "GOV_INCIDENT_STATE_INVALID"
  | "GOV_REASON_REQUIRED";

export class GovernanceError extends Error {
  readonly code: GovernanceErrorCode;

  constructor(code: GovernanceErrorCode, detailHe: string) {
    super(detailHe);
    this.name = "GovernanceError";
    this.code = code;
  }
}
