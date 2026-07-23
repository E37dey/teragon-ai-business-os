// TERAGON AI BUSINESS OS — Stage Gates V2 barrel (Wave 7, W7-C).
export {
  CANONICAL_STAGE_GATES,
  EVIDENCE_REF_TYPE_LABELS_HE,
  STAGE_GATE_EVIDENCE_REF_TYPES,
  STAGE_GATE_KEYS,
  STAGE_GATE_V2_STATES,
  isStageGateV2,
} from "./types";
export type {
  StageGateCompletionRequest,
  StageGateCriterionDef,
  StageGateDecision,
  StageGateDef,
  StageGateEvidenceRef,
  StageGateEvidenceRefType,
  StageGateKey,
  StageGateV2,
  StageGateV2Fields,
  StageGateV2State,
  W7RecordLike,
} from "./types";
export {
  METRIC_FRESHNESS_DAYS,
  evaluateEvidenceRef,
  requiredEvidenceHe,
  validateCriterion,
  validateGate,
} from "./validator";
export type {
  CriterionState,
  CriterionValidation,
  EvaluatedEvidenceRef,
  EvidenceRefStatus,
  GateValidation,
  StageGateContext,
} from "./validator";
export { StageGateError, StageGateService } from "./service";
export type {
  BridgeResult,
  GateWithValidation,
  StageGateErrorCode,
  StageGateServiceDeps,
} from "./service";
